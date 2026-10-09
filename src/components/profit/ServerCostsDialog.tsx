import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ProfitCurrency,
  ProfitExpense,
  ProfitExpenseWrite,
  ProfitNodeCost,
} from '../../api/adminProfit';
import { PROFIT_CURRENCIES, profitApi } from '../../api/adminProfit';
import { useCurrency } from '../../hooks/useCurrency';
import { useNativeDialog } from '../../platform/hooks/useNativeDialog';
import { getApiErrorMessage } from '../../utils/api-error';
import { CheckIcon, PlusIcon, TrashIcon } from '../icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/Dialog';

import { KOPEKS_IN_RUBLE, groupColor } from './constants';

interface ServerCostsDialogProps {
  open: boolean;
  onClose: () => void;
}

const CURRENCY_SIGNS: Record<ProfitCurrency, string> = { RUB: '₽', USD: '$', EUR: '€' };

/** Черновик строки: то, что человек напечатал, но ещё не сохранил. */
interface Draft {
  hosting: string;
  amount: string;
  currency: ProfitCurrency;
}

function draftFromExpense(expense: ProfitExpense | null, fallbackHosting?: string | null): Draft {
  return {
    hosting: expense?.group_name ?? fallbackHosting ?? '',
    amount: expense ? String(expense.amount) : '',
    currency: expense?.currency ?? 'RUB',
  };
}

export function ServerCostsDialog({ open, onClose }: ServerCostsDialogProps) {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const dialog = useNativeDialog();

  const { data, isLoading } = useQuery({
    queryKey: ['profit', 'servers'],
    queryFn: profitApi.getServers,
    enabled: open,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Ключ строки, у которой только что показалась галочка «сохранено».
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newServer, setNewServer] = useState('');

  // Строки с несохранённым вводом. Ref, а не state: значение нужно читать
  // синхронно внутри эффекта обновления, и перерисовка от него не зависит.
  const dirtyRef = useRef<Set<string>>(new Set());
  const markDirty = (key: string) => {
    dirtyRef.current.add(key);
  };

  // Черновики пересобираются из ответа, но НЕ поверх несохранённого ввода:
  // ответ /servers меняется почти на каждом рефетче (в нём есть users_online),
  // и безусловная перезапись стирала то, что человек печатает в соседней строке.
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      const keep = (key: string, fresh: Draft) =>
        dirtyRef.current.has(key) && prev[key] ? prev[key] : fresh;

      for (const node of data.nodes) {
        const key = `node:${node.uuid}`;
        next[key] = keep(key, draftFromExpense(node.expense, node.provider_name));
      }
      for (const expense of data.standalone) {
        const key = `row:${expense.id}`;
        next[key] = keep(key, draftFromExpense(expense));
      }
      return next;
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (input: { key: string; id: number | null; payload: ProfitExpenseWrite }) =>
      input.id
        ? profitApi.updateExpense(input.id, input.payload)
        : profitApi.createExpense(input.payload),
    onSuccess: (_result, variables) => {
      dirtyRef.current.delete(variables.key);
      queryClient.invalidateQueries({ queryKey: ['profit'] });
      setSavedKey(variables.key);
      setError(null);
      window.setTimeout(() => setSavedKey(null), 1500);
    },
    onError: (err: unknown) => setError(getApiErrorMessage(err, t('common.error'))),
  });

  const deleteMutation = useMutation({
    mutationFn: profitApi.deleteExpense,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profit'] }),
    onError: (err: unknown) => setError(getApiErrorMessage(err, t('common.error'))),
  });

  const handleDelete = async (expense: ProfitExpense) => {
    const confirmed = await dialog.confirm(
      t('admin.profit.confirmDelete', { title: expense.title }),
      t('common.delete'),
    );
    if (confirmed) deleteMutation.mutate(expense.id);
  };

  const commit = (key: string, expense: ProfitExpense | null, title: string, nodeUuid?: string) => {
    const draft = drafts[key];
    if (!draft) return;

    // Каждый выход без отправки снимает «грязь»: иначе строка навсегда
    // переставала обновляться из ответа сервера и показывала устаревшее.
    const giveUp = () => {
      dirtyRef.current.delete(key);
    };

    const amount = Number(draft.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) return giveUp();

    const unchanged =
      expense &&
      expense.amount === amount &&
      expense.currency === draft.currency &&
      (expense.group_name ?? '') === draft.hosting.trim();
    if (unchanged) return giveUp();
    // Пустое поле у ещё не заведённой строки — человек просто прошёл мимо.
    if (!expense && draft.amount.trim() === '') return giveUp();

    // Гварды «запрос уже летит» здесь намеренно нет: POST по ноде на сервере —
    // апсерт, дубль не создаётся, а гварда молча съедала бы вторую правку.
    saveMutation.mutate({
      key,
      id: expense?.id ?? null,
      payload: {
        category: 'server',
        kind: 'monthly',
        title,
        group_name: draft.hosting.trim() || null,
        amount,
        currency: draft.currency,
        is_active: expense?.is_active ?? true,
        // Привязку к ноде шлём ТОЛЬКО у строк панели. У «отдельных серверов»
        // её нет, и явный null отвязал бы строку от ноды навсегда — вернуть
        // привязку из интерфейса нечем.
        ...(nodeUuid ? { node_uuid: nodeUuid } : {}),
      },
    });
  };

  const addStandalone = () => {
    const title = newServer.trim();
    // Строка «вне панели» не привязана к ноде, апсерт её не защищает —
    // от повторного клика спасает только эта проверка.
    if (!title || saveMutation.isPending) return;
    saveMutation.mutate({
      key: `new:${title}`,
      id: null,
      payload: { category: 'server', kind: 'monthly', title, amount: 0, currency: 'RUB' },
    });
    setNewServer('');
  };

  const hostings = useMemo(() => {
    const set = new Set<string>();
    for (const draft of Object.values(drafts)) {
      if (draft.hosting.trim()) set.add(draft.hosting.trim());
    }
    return [...set].sort();
  }, [drafts]);

  const renderRow = (
    key: string,
    title: string,
    subtitle: string | null,
    expense: ProfitExpense | null,
    options: { nodeUuid?: string; online?: boolean; disabled?: boolean; removable?: boolean },
  ) => {
    const draft = drafts[key] ?? draftFromExpense(expense);
    const dotColor = draft.hosting.trim()
      ? groupColor(draft.hosting.trim(), expense?.color)
      : undefined;
    const justSaved = savedKey === key;

    return (
      <div
        key={key}
        className="rounded-xl border border-dark-700/40 bg-dark-800/40 p-3 transition-colors hover:border-dark-600/50"
      >
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor ?? 'rgb(var(--color-dark-600))' }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-dark-100">{title}</div>
            {subtitle && <div className="truncate text-xs text-dark-500">{subtitle}</div>}
          </div>
          {options.online !== undefined && (
            <span
              className={`shrink-0 text-xs ${options.online ? 'text-success-400' : 'text-dark-500'}`}
            >
              {options.online
                ? t('admin.profit.servers.online')
                : t('admin.profit.servers.offline')}
            </span>
          )}
          {justSaved && <CheckIcon className="h-4 w-4 shrink-0 text-success-400" />}
          {options.removable && expense && (
            <button
              type="button"
              onClick={() => handleDelete(expense)}
              className="shrink-0 rounded-lg p-1.5 text-dark-500 transition-colors hover:bg-error-500/10 hover:text-error-400"
              aria-label={t('common.delete')}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1 py-2 text-sm"
            list="profit-hostings"
            value={draft.hosting}
            onChange={(e) => {
              markDirty(key);
              setDrafts((prev) => ({ ...prev, [key]: { ...draft, hosting: e.target.value } }));
            }}
            onBlur={() => commit(key, expense, title, options.nodeUuid)}
            placeholder={t('admin.profit.form.hostingPlaceholder')}
          />
          <div className="flex gap-1.5">
            <input
              className="input w-24 py-2 text-sm"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => {
                markDirty(key);
                setDrafts((prev) => ({
                  ...prev,
                  [key]: { ...draft, amount: e.target.value.replace(/[^\d.,]/g, '') },
                }));
              }}
              onBlur={() => commit(key, expense, title, options.nodeUuid)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder={t('admin.profit.servers.perMonth')}
            />
            <select
              className="input w-16 py-2 text-sm"
              value={draft.currency}
              onChange={(e) => {
                const currency = e.target.value as ProfitCurrency;
                markDirty(key);
                setDrafts((prev) => ({ ...prev, [key]: { ...draft, currency } }));
              }}
              onBlur={() => commit(key, expense, title, options.nodeUuid)}
            >
              {PROFIT_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_SIGNS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('admin.profit.servers.title')}</DialogTitle>
          <DialogDescription>{t('admin.profit.servers.subtitle')}</DialogDescription>
        </DialogHeader>

        {/* Общий список хостингов — подсказка при вводе, чтобы одна и та же
            «Aeza» не разъехалась на «aeza» и «Aeza ' и не получила два цвета. */}
        <datalist id="profit-hostings">
          {hostings.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {error && (
            <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="py-8 text-center text-sm text-dark-400">{t('common.loading')}</div>
          )}

          {data && !data.panel_available && (
            <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-sm text-warning-400">
              {t('admin.profit.servers.panelUnavailable')}
            </div>
          )}

          {data?.nodes.map((node: ProfitNodeCost) =>
            renderRow(`node:${node.uuid}`, node.name, node.address, node.expense, {
              nodeUuid: node.uuid,
              online: node.is_connected && !node.is_disabled,
            }),
          )}

          {data && data.standalone.length > 0 && (
            <div className="pt-2 text-xs font-medium uppercase tracking-wide text-dark-500">
              {t('admin.profit.servers.standalone')}
            </div>
          )}
          {data?.standalone.map((expense) =>
            renderRow(`row:${expense.id}`, expense.title, expense.notes, expense, {
              removable: true,
            }),
          )}

          {/* Сервер вне панели: VPS бота, база, что угодно ещё */}
          <div className="flex gap-2 pt-1">
            <input
              className="input flex-1 py-2 text-sm"
              value={newServer}
              onChange={(e) => setNewServer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStandalone()}
              placeholder={t('admin.profit.servers.addPlaceholder')}
            />
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={addStandalone}
              disabled={!newServer.trim() || saveMutation.isPending}
            >
              <PlusIcon className="h-4 w-4" />
              {t('common.add')}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-dark-700/40 pt-3">
          <span className="text-sm text-dark-400">
            {t('admin.profit.servers.monthlyTotal')}{' '}
            <span className="font-semibold text-dark-100">
              {formatWithCurrency((data?.monthly_total_kopeks ?? 0) / KOPEKS_IN_RUBLE, 0)}
            </span>
          </span>
          <button type="button" className="btn-primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
