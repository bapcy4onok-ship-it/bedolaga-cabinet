import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProfitCategory, ProfitExpense, ProfitExpenseGroup } from '../../api/adminProfit';
import { profitApi } from '../../api/adminProfit';
import { useCurrency } from '../../hooks/useCurrency';
import { useNativeDialog } from '../../platform/hooks/useNativeDialog';
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from '../icons';

import { CATEGORY_META, KOPEKS_IN_RUBLE, groupColor } from './constants';

interface ExpenseCategoryCardProps {
  category: ProfitCategory;
  group: ProfitExpenseGroup | undefined;
  /** Сырые строки этой категории — из них берётся то, что уходит в форму правки. */
  expenses: ProfitExpense[];
  onAdd: () => void;
  onEdit: (expense: ProfitExpense) => void;
  /** Открыть редактор серверов — только у категории «серверы». */
  onOpenServers?: () => void;
}

export function ExpenseCategoryCard({
  category,
  group,
  expenses,
  onAdd,
  onEdit,
  onOpenServers,
}: ExpenseCategoryCardProps) {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const dialog = useNativeDialog();

  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[category];
  const total = group?.total_kopeks ?? 0;
  const items = group?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: profitApi.deleteExpense,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profit'] }),
  });

  const handleDelete = async (item: { id: number | null; title: string }) => {
    if (item.id === null) return;
    const confirmed = await dialog.confirm(
      t('admin.profit.confirmDelete', { title: item.title }),
      t('common.delete'),
    );
    if (confirmed) deleteMutation.mutate(item.id);
  };

  const money = (kopeks: number) => formatWithCurrency(kopeks / KOPEKS_IN_RUBLE, 0);

  return (
    <div className="bento-card !p-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <span
          className="h-8 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-dark-100">{t(meta.labelKey)}</div>
          <div className="text-xs text-dark-500">
            {items.length > 0
              ? t('admin.profit.itemsCount', { count: items.length })
              : t('admin.profit.noEntries')}
            {group && group.estimated_kopeks > 0 && (
              <span className="ml-1.5 text-warning-400">
                · {t('admin.profit.estimatedPart', { amount: money(group.estimated_kopeks) })}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-base font-semibold text-dark-100">{money(total)}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-dark-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-dark-700/40 p-4">
          {/* Разбивка по хостингам/провайдерам — цвет закреплён за именем группы */}
          {group && group.subgroups.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {group.subgroups.map((subgroup) => (
                <span
                  key={subgroup.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dark-700/50 bg-dark-800/60 px-2.5 py-1 text-xs"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: groupColor(subgroup.name, subgroup.color) }}
                  />
                  <span className="text-dark-300">{subgroup.name}</span>
                  <span className="font-medium text-dark-100">{money(subgroup.total_kopeks)}</span>
                </span>
              ))}
            </div>
          )}

          {items.length === 0 && (
            <p className="py-2 text-sm text-dark-500">{t('admin.profit.emptyHint')}</p>
          )}

          <div className="space-y-1.5">
            {items.map((item, index) => {
              const editable = item.id !== null;
              const raw = editable ? expenses.find((e) => e.id === item.id) : undefined;

              return (
                <div
                  key={item.id ?? `${item.source}-${index}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-dark-800/40"
                >
                  {item.group_name && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: groupColor(item.group_name, item.color) }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-dark-200">{item.title}</span>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-dark-500 transition-colors hover:text-accent-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-dark-500">
                      {item.is_share && (
                        <span className="text-accent-400">
                          {t('admin.profit.shareOf', { percent: item.percent ?? 0 })}
                        </span>
                      )}
                      {item.kind === 'monthly' &&
                        (() => {
                          // Регулярные расходы считаются целыми месяцами, поэтому
                          // рядом с «500 ₽ в месяц» полезно видеть, за сколько
                          // месяцев набежала сумма периода.
                          const months =
                            item.full_amount_kopeks > 0
                              ? Math.round(item.period_amount_kopeks / item.full_amount_kopeks)
                              : 1;
                          const amount = money(item.full_amount_kopeks);
                          return (
                            <span>
                              {months > 1
                                ? t('admin.profit.monthlyTimes', { amount, count: months })
                                : t('admin.profit.monthlyOf', { amount })}
                            </span>
                          );
                        })()}
                      {item.is_estimate && (
                        <span className="text-warning-400">
                          {t('admin.profit.estimateOf', {
                            days: item.uncovered_days ?? 0,
                          })}
                        </span>
                      )}
                      {item.source === 'withdrawal' && (
                        <span>
                          {t('admin.profit.payoutsCount', { count: item.payouts_count ?? 0 })}
                        </span>
                      )}
                      {item.currency !== 'RUB' && (
                        <span>
                          {(item.amount_minor / 100).toLocaleString()} {item.currency}
                        </span>
                      )}
                      {item.spent_at && item.source === 'manual' && item.kind === 'once' && (
                        <span>{new Date(item.spent_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-dark-100">
                    {money(item.period_amount_kopeks)}
                  </span>
                  {editable && raw && (
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => onEdit(raw)}
                        className="rounded-lg p-1.5 text-dark-500 transition-colors hover:bg-dark-700 hover:text-dark-200"
                        aria-label={t('common.edit')}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-lg p-1.5 text-dark-500 transition-colors hover:bg-error-500/10 hover:text-error-400"
                        aria-label={t('common.delete')}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {category === 'server' && onOpenServers && (
              <button type="button" className="btn-secondary" onClick={onOpenServers}>
                <ServerIcon className="h-4 w-4" />
                {t('admin.profit.servers.manage')}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onAdd}>
              <PlusIcon className="h-4 w-4" />
              {t('admin.profit.addEntry')}
            </button>
          </div>

          {category === 'partner' && (
            <p className="text-xs text-dark-500">{t('admin.profit.partnerAutoHint')}</p>
          )}
        </div>
      )}
    </div>
  );
}
