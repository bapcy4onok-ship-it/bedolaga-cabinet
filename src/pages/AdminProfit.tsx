import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ProfitCategory, ProfitExpense, ProfitParams } from '../api/adminProfit';
import { profitApi } from '../api/adminProfit';
import { SALES_STATS } from '../constants/salesStats';
import { useCurrency } from '../hooks/useCurrency';
import { computeDelta, getMonthToDateRange, getPreviousPeriodParams } from '../utils/period';
import { AdminBackButton } from '../components/admin/AdminBackButton';
import { ArrowDownIcon, BanknotesIcon, PercentIcon, WalletIcon } from '../components/icons';
import { BreakdownList } from '../components/sales-stats/BreakdownList';
import { StatCard } from '../components/stats';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  ExpenseCategoryCard,
  ExpenseFormDialog,
  KOPEKS_IN_RUBLE,
  ProfitPeriodSelector,
  ProfitSharesCard,
  ServerCostsDialog,
} from '../components/profit';

interface EditorState {
  category: ProfitCategory;
  expense: ProfitExpense | null;
}

export default function AdminProfit() {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();

  const [period, setPeriod] = useState<{ days?: number; startDate?: string; endDate?: string }>(
    () => getMonthToDateRange(),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [serversOpen, setServersOpen] = useState(false);

  const params: ProfitParams = useMemo(
    () => ({ days: period.days, start_date: period.startDate, end_date: period.endDate }),
    [period.days, period.startDate, period.endDate],
  );

  const isValidPeriod = period.days !== undefined || (!!period.startDate && !!period.endDate);

  const {
    data: report,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['profit', 'summary', params],
    queryFn: () => profitApi.getSummary(params),
    staleTime: SALES_STATS.STALE_TIME,
    enabled: isValidPeriod,
    placeholderData: keepPreviousData,
  });

  // Сырые строки нужны форме правки: в отчёте лежит уже посчитанная доля за
  // период, а редактировать надо исходную сумму.
  const { data: expenses = [] } = useQuery({
    queryKey: ['profit', 'expenses'],
    queryFn: () => profitApi.listExpenses(),
    staleTime: SALES_STATS.STALE_TIME,
  });

  const prevParams = useMemo(() => getPreviousPeriodParams(period), [period]);
  const { data: prevReport } = useQuery({
    queryKey: ['profit', 'summary', prevParams],
    queryFn: () => profitApi.getSummary(prevParams as ProfitParams),
    staleTime: SALES_STATS.STALE_TIME,
    enabled: isValidPeriod && prevParams !== null,
  });

  // prevParams === null («всё время») — сравнивать не с чем.
  const deltas = useMemo(() => {
    if (!report || !prevReport || !prevParams) return null;
    return {
      revenue: computeDelta(report.revenue.total_kopeks, prevReport.revenue.total_kopeks),
      expenses: computeDelta(report.expenses.total_kopeks, prevReport.expenses.total_kopeks),
      profit: computeDelta(report.net_profit_kopeks, prevReport.net_profit_kopeks),
    };
  }, [report, prevReport, prevParams]);

  const money = useCallback(
    (kopeks: number) => formatWithCurrency(kopeks / KOPEKS_IN_RUBLE, 0),
    [formatWithCurrency],
  );

  const groupsByCategory = useMemo(() => {
    const map = new Map(report?.expenses.groups.map((g) => [g.category, g]) ?? []);
    return map;
  }, [report]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<ProfitCategory, ProfitExpense[]>();
    for (const expense of expenses) {
      const bucket = map.get(expense.category) ?? [];
      bucket.push(expense);
      map.set(expense.category, bucket);
    }
    return map;
  }, [expenses]);

  const revenueItems = useMemo(() => {
    if (!report) return [];
    const { donations_kopeks: donations, donations_upsell_kopeks: upsell } = report.revenue;
    return [
      {
        key: 'gateway',
        label: t('admin.profit.revenue.gateway'),
        value: report.revenue.gateway_kopeks,
        color: '#34d399',
      },
      {
        key: 'gifts',
        label: t('admin.profit.revenue.gifts'),
        value: report.revenue.gifts_kopeks,
        color: '#818cf8',
      },
      {
        key: 'donations',
        label: t('admin.profit.revenue.donations'),
        value: donations,
        color: '#fb7185',
        // Надбавки при пополнении приходят внутри платежа за баланс — без подписи
        // не видно, почему пожертвований больше, чем донатов через кнопку.
        hint:
          upsell > 0
            ? t('admin.profit.revenue.donationsHint', {
                upsell: money(upsell),
                standalone: money(donations - upsell),
              })
            : undefined,
      },
    ].filter((item) => item.value > 0);
  }, [report, t, money]);

  const expenseItems = useMemo(() => {
    if (!report) return [];
    return report.expenses.groups.map((group) => ({
      key: group.category,
      label: t(CATEGORY_META[group.category].labelKey),
      value: group.total_kopeks,
      color: CATEGORY_META[group.category].color,
    }));
  }, [report, t]);

  const shareItems = useMemo(
    () =>
      (report?.expenses.groups ?? []).flatMap((group) =>
        group.items.filter((item) => item.is_share),
      ),
    [report],
  );

  const profitTone =
    (report?.net_profit_kopeks ?? 0) >= 0 ? ('success' as const) : ('error' as const);

  return (
    <div className="animate-fade-in space-y-4 overflow-hidden">
      <div className="flex items-center gap-3">
        <AdminBackButton />
        <div>
          <h1 className="text-xl font-bold text-dark-100 sm:text-2xl">{t('admin.profit.title')}</h1>
          <p className="text-sm text-dark-400">{t('admin.profit.subtitle')}</p>
        </div>
      </div>

      <ProfitPeriodSelector value={period} onChange={setPeriod} />

      {isError && (
        <div className="rounded-xl bg-error-500/10 px-4 py-3 text-sm text-error-400">
          {t('admin.profit.loadError')}
        </div>
      )}

      {/* Итоговые карточки */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('admin.profit.summary.revenue')}
          value={isLoading ? '...' : money(report?.revenue.total_kopeks ?? 0)}
          icon={<BanknotesIcon className="h-5 w-5" />}
          tone="success"
          delta={deltas?.revenue}
        />
        <StatCard
          label={t('admin.profit.summary.expenses')}
          value={isLoading ? '...' : money(report?.expenses.total_kopeks ?? 0)}
          icon={<ArrowDownIcon className="h-5 w-5" />}
          tone="warning"
          delta={deltas?.expenses}
          subValue={
            report && report.expenses.estimated_kopeks > 0
              ? t('admin.profit.estimatedPart', { amount: money(report.expenses.estimated_kopeks) })
              : undefined
          }
        />
        <StatCard
          label={t('admin.profit.summary.net')}
          value={isLoading ? '...' : money(report?.net_profit_kopeks ?? 0)}
          icon={<WalletIcon className="h-5 w-5" />}
          tone={profitTone}
          delta={deltas?.profit}
        />
        <StatCard
          label={t('admin.profit.summary.margin')}
          value={isLoading ? '...' : `${report?.margin_percent ?? 0}%`}
          icon={<PercentIcon className="h-5 w-5" />}
          tone="accent"
        />
      </div>

      {/* Из чего сложился доход и куда ушли деньги */}
      <div className="grid gap-3 lg:grid-cols-2">
        <BreakdownList
          title={t('admin.profit.revenue.title')}
          items={revenueItems}
          valueFormatter={money}
        />
        <BreakdownList
          title={t('admin.profit.expenses.title')}
          items={expenseItems}
          valueFormatter={money}
        />
      </div>

      {report && report.revenue.manual_topup_kopeks > 0 && (
        <p className="px-1 text-xs text-dark-500">
          {t('admin.profit.manualNote', { amount: money(report.revenue.manual_topup_kopeks) })}
        </p>
      )}

      {/* Доли от прибыли: сколько кому причитается с того, что осталось */}
      {report && shareItems.length > 0 && (
        <ProfitSharesCard
          profitBeforeShares={report.profit_before_shares_kopeks}
          shares={shareItems}
          sharesTotal={report.shares_total_kopeks}
          percentTotal={report.shares_percent_total}
          netProfit={report.net_profit_kopeks}
        />
      )}

      {/* Расходы по категориям */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map((category) => (
          <ExpenseCategoryCard
            key={category}
            category={category}
            group={groupsByCategory.get(category)}
            expenses={expensesByCategory.get(category) ?? []}
            onAdd={() => setEditor({ category, expense: null })}
            onEdit={(expense) => setEditor({ category, expense })}
            onOpenServers={category === 'server' ? () => setServersOpen(true) : undefined}
          />
        ))}
      </div>

      {/* Курс, по которому пересчитаны валютные расходы */}
      {report && (
        <p className="px-1 text-xs text-dark-500">
          {report.fx.source === 'fallback'
            ? t('admin.profit.fxFallback')
            : t('admin.profit.fxNote', {
                usd: report.fx.rates.USD?.toFixed(2) ?? '—',
                eur: report.fx.rates.EUR?.toFixed(2) ?? '—',
              })}
        </p>
      )}

      {editor && (
        <ExpenseFormDialog
          open
          onClose={() => setEditor(null)}
          category={editor.category}
          expense={editor.expense}
        />
      )}

      <ServerCostsDialog open={serversOpen} onClose={() => setServersOpen(false)} />
    </div>
  );
}
