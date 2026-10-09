import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ProfitCategory,
  ProfitCurrency,
  ProfitExpense,
  ProfitExpenseWrite,
  ProfitKind,
} from '../../api/adminProfit';
import { PROFIT_CURRENCIES, profitApi } from '../../api/adminProfit';
import { getApiErrorMessage } from '../../utils/api-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/Dialog';
import { DateField } from '../DateField';

import { CATEGORY_META } from './constants';

interface ExpenseFormDialogProps {
  open: boolean;
  onClose: () => void;
  category: ProfitCategory;
  /** null — создание новой строки. */
  expense: ProfitExpense | null;
}

interface FormState {
  kind: ProfitKind;
  title: string;
  groupName: string;
  link: string;
  amount: string;
  currency: ProfitCurrency;
  /** Процент от прибыли — только для kind='share'. */
  percent: string;
  spentAt: string;
  periodStart: string;
  periodEnd: string;
  startedAt: string;
  endedAt: string;
  isActive: boolean;
  notes: string;
  /** Разовый расход задан интервалом счёта, а не одной датой. */
  asBill: boolean;
}

const CURRENCY_SIGNS: Record<ProfitCurrency, string> = { RUB: '₽', USD: '$', EUR: '€' };

const KIND_HINT: Record<ProfitKind, string> = {
  once: 'Once',
  monthly: 'Monthly',
  share: 'Share',
};

const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');
const toIso = (date: string): string | null => (date ? `${date}T00:00:00` : null);

function initialState(category: ProfitCategory, expense: ProfitExpense | null): FormState {
  if (expense) {
    return {
      kind: expense.kind,
      title: expense.title,
      groupName: expense.group_name ?? '',
      link: expense.link ?? '',
      amount: String(expense.amount),
      currency: expense.currency,
      percent: expense.percent != null ? String(expense.percent) : '',
      spentAt: toDateInput(expense.spent_at),
      periodStart: toDateInput(expense.period_start),
      periodEnd: toDateInput(expense.period_end),
      startedAt: toDateInput(expense.started_at),
      endedAt: toDateInput(expense.ended_at),
      isActive: expense.is_active,
      notes: expense.notes ?? '',
      asBill: Boolean(expense.period_start && expense.period_end),
    };
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  return {
    kind: CATEGORY_META[category].defaultKind,
    title: '',
    groupName: '',
    link: '',
    amount: '',
    currency: 'RUB',
    percent: '',
    spentAt: todayIso,
    periodStart: '',
    periodEnd: '',
    startedAt: '',
    endedAt: '',
    isActive: true,
    notes: '',
    asBill: category === 'cdn',
  };
}

export function ExpenseFormDialog({ open, onClose, category, expense }: ExpenseFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const meta = CATEGORY_META[category];

  const kindOptions: ProfitKind[] = meta.allowsShare
    ? ['once', 'monthly', 'share']
    : ['once', 'monthly'];

  const [form, setForm] = useState<FormState>(() => initialState(category, expense));
  const [error, setError] = useState<string | null>(null);

  // Диалог не размонтируется между открытиями, поэтому состояние формы
  // сбрасывается явно — иначе «добавить» открылось бы с прошлыми значениями.
  useEffect(() => {
    if (open) {
      setForm(initialState(category, expense));
      setError(null);
    }
  }, [open, category, expense]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: (payload: ProfitExpenseWrite) =>
      expense ? profitApi.updateExpense(expense.id, payload) : profitApi.createExpense(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profit'] });
      onClose();
    },
    onError: (err: unknown) => setError(getApiErrorMessage(err, t('common.error'))),
  });

  const amountNumber = Number(form.amount.replace(',', '.'));
  const percentNumber = Number(form.percent.replace(',', '.'));
  const isShare = form.kind === 'share';
  const isMonthlyOrShare = isShare || form.kind === 'monthly';
  // Счёт за интервал задаётся обоими концами: с одним заполненным бэкенд
  // ответит 422, а раньше такая строка сохранялась и не попадала ни в один отчёт.
  const billDatesOk =
    !(form.kind === 'once' && form.asBill) || (!!form.periodStart && !!form.periodEnd);
  const canSubmit =
    form.title.trim().length > 0 &&
    billDatesOk &&
    (isShare
      ? Number.isFinite(percentNumber) && percentNumber > 0 && percentNumber <= 100
      : Number.isFinite(amountNumber) && amountNumber >= 0);

  const titleLabel = useMemo(() => {
    const perCategory: Partial<Record<ProfitCategory, string>> = {
      server: t('admin.profit.form.titleServer'),
      ads: t('admin.profit.form.titleAds'),
      cdn: t('admin.profit.form.titleCdn'),
      personal: t('admin.profit.form.titlePersonal'),
      partner: t('admin.profit.form.titlePartner'),
      staff: t('admin.profit.form.titleStaff'),
      ai: t('admin.profit.form.titleAi'),
    };
    return perCategory[category] ?? t('admin.profit.form.title');
  }, [category, t]);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const isMonthly = form.kind === 'monthly';
    // Доля и месячный расход живут окном действия, разовый — датой траты.
    const useWindow = isMonthly || isShare;
    const useBill = !useWindow && form.asBill;

    mutation.mutate({
      category,
      kind: form.kind,
      title: form.title.trim(),
      group_name: meta.hasGroup ? form.groupName.trim() || null : null,
      link: meta.hasLink ? form.link.trim() || null : null,
      amount: isShare ? 0 : amountNumber,
      currency: form.currency,
      percent: isShare ? percentNumber : null,
      spent_at: !useWindow && !useBill ? toIso(form.spentAt) : null,
      period_start: useBill ? toIso(form.periodStart) : null,
      period_end: useBill ? toIso(form.periodEnd) : null,
      started_at: useWindow ? toIso(form.startedAt) : null,
      ended_at: useWindow ? toIso(form.endedAt) : null,
      is_active: form.isActive,
      node_uuid: expense?.node_uuid ?? null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expense ? t('admin.profit.form.editTitle') : t('admin.profit.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t(meta.labelKey)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
              {error}
            </div>
          )}

          {/* Разовый / ежемесячный */}
          <div>
            <span className="label">{t('admin.profit.form.kind')}</span>
            <div className={`grid gap-2 ${kindOptions.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {kindOptions.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => set('kind', kind)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    form.kind === kind
                      ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
                      : 'border-dark-700/50 bg-dark-800/50 text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {t(`admin.profit.form.kind_${kind}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-dark-500">
              {t(`admin.profit.form.kind${KIND_HINT[form.kind]}Hint`)}
            </p>
          </div>

          {/* Название */}
          <div>
            <label className="label" htmlFor="profit-title">
              {titleLabel}
            </label>
            <input
              id="profit-title"
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('admin.profit.form.titlePlaceholder')}
              autoFocus
            />
          </div>

          {/* Хостинг / провайдер */}
          {meta.hasGroup && (
            <div>
              <label className="label" htmlFor="profit-group">
                {category === 'cdn'
                  ? t('admin.profit.form.provider')
                  : t('admin.profit.form.hosting')}
              </label>
              <input
                id="profit-group"
                className="input"
                value={form.groupName}
                onChange={(e) => set('groupName', e.target.value)}
                placeholder={
                  category === 'cdn'
                    ? t('admin.profit.form.providerPlaceholder')
                    : t('admin.profit.form.hostingPlaceholder')
                }
              />
              <p className="mt-1.5 text-xs text-dark-500">{t('admin.profit.form.groupHint')}</p>
            </div>
          )}

          {/* Ссылка на канал */}
          {meta.hasLink && (
            <div>
              <label className="label" htmlFor="profit-link">
                {t('admin.profit.form.link')}
              </label>
              <input
                id="profit-link"
                className="input"
                value={form.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://t.me/channel"
              />
            </div>
          )}

          {/* Процент от прибыли — вместо суммы */}
          {isShare ? (
            <div>
              <label className="label" htmlFor="profit-percent">
                {t('admin.profit.form.percent')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profit-percent"
                  className="input w-32"
                  inputMode="decimal"
                  value={form.percent}
                  onChange={(e) => set('percent', e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="20"
                />
                <span className="text-lg text-dark-400">%</span>
              </div>
              <p className="mt-1.5 text-xs text-dark-500">{t('admin.profit.form.percentHint')}</p>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="profit-amount">
                {form.kind === 'monthly'
                  ? t('admin.profit.form.amountMonthly')
                  : t('admin.profit.form.amount')}
              </label>
              <div className="flex gap-2">
                <input
                  id="profit-amount"
                  className="input flex-1"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="0"
                />
                <div className="flex shrink-0 gap-1">
                  {PROFIT_CURRENCIES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => set('currency', code)}
                      className={`w-11 rounded-xl border text-sm font-medium transition-colors ${
                        form.currency === code
                          ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
                          : 'border-dark-700/50 bg-dark-800/50 text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      {CURRENCY_SIGNS[code]}
                    </button>
                  ))}
                </div>
              </div>
              {form.currency !== 'RUB' && (
                <p className="mt-1.5 text-xs text-dark-500">
                  {form.kind === 'monthly'
                    ? t('admin.profit.form.fxLiveHint')
                    : t('admin.profit.form.fxSnapshotHint')}
                </p>
              )}
            </div>
          )}

          {/* Даты: доля и месячный расход задаются окном действия */}
          {isMonthlyOrShare ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">{t('admin.profit.form.startedAt')}</span>
                <DateField
                  value={form.startedAt}
                  onChange={(v) => set('startedAt', v)}
                  max={form.endedAt || undefined}
                  placeholder={t('admin.profit.form.always')}
                />
              </div>
              <div>
                <span className="label">{t('admin.profit.form.endedAt')}</span>
                <DateField
                  value={form.endedAt}
                  onChange={(v) => set('endedAt', v)}
                  min={form.startedAt || undefined}
                  placeholder={t('admin.profit.form.stillActive')}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-dark-300">
                <input
                  type="checkbox"
                  checked={form.asBill}
                  onChange={(e) => set('asBill', e.target.checked)}
                  className="h-4 w-4 rounded border-dark-600 bg-dark-800 accent-accent-500"
                />
                {t('admin.profit.form.asBill')}
              </label>

              {form.asBill ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="label">{t('admin.profit.form.billFrom')}</span>
                    <DateField
                      value={form.periodStart}
                      onChange={(v) => set('periodStart', v)}
                      max={form.periodEnd || undefined}
                    />
                  </div>
                  <div>
                    <span className="label">{t('admin.profit.form.billTo')}</span>
                    <DateField
                      value={form.periodEnd}
                      onChange={(v) => set('periodEnd', v)}
                      min={form.periodStart || undefined}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <span className="label">{t('admin.profit.form.spentAt')}</span>
                  <DateField value={form.spentAt} onChange={(v) => set('spentAt', v)} />
                </div>
              )}
              <p className="text-xs text-dark-500">{t('admin.profit.form.billHint')}</p>
            </div>
          )}

          {/* Заметка */}
          <div>
            <label className="label" htmlFor="profit-notes">
              {t('admin.profit.form.notes')}
            </label>
            <textarea
              id="profit-notes"
              className="input min-h-[72px] resize-y"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder={t('admin.profit.form.notesPlaceholder')}
            />
          </div>

          {/* Активна */}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-dark-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-dark-600 bg-dark-800 accent-accent-500"
            />
            {t('admin.profit.form.isActive')}
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleSubmit}
              disabled={!canSubmit || mutation.isPending}
            >
              {mutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
