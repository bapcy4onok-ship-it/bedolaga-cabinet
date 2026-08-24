import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { DonorItem, SalesStatsParams } from '../../api/adminSalesStats';
import { salesStatsApi } from '../../api/adminSalesStats';
import { SALES_STATS } from '../../constants/salesStats';
import { useCurrency } from '../../hooks/useCurrency';
import { computeDelta, getPreviousPeriodParams } from '../../utils/period';
import {
  BanknotesIcon,
  GiftIcon,
  HeartbeatIcon,
  SparklesIcon,
  StarIcon,
  UsersIcon,
  WalletIcon,
} from '../../components/icons';
import { StatCard } from '../stats';

import { BreakdownList } from './BreakdownList';
import { SimpleAreaChart } from './SimpleAreaChart';
import { StackedBarChart } from './StackedBarChart';

interface DonationsTabProps {
  params: SalesStatsParams;
}

const MEDALS = ['🥇', '🥈', '🥉'];

const SOURCE_LABEL_KEYS: Record<string, string> = {
  menu: 'admin.salesStats.donations.fromMenu',
  topup_upsell: 'admin.salesStats.donations.fromUpsell',
};

// Цвет источника закреплён за слагом и передаётся в графики явно (colorByKey):
// иначе цвет зависел бы от позиции серии в алфавитном списке и разъезжался бы
// с легендой BreakdownList над графиком.
const SOURCE_COLORS: Record<string, string> = {
  menu: '#fb7185',
  topup_upsell: '#f59e0b',
};

function donorDisplay(d: DonorItem, anonymousLabel: string): string {
  if (d.donor_username) return `@${d.donor_username}`;
  if (d.donor_name) return d.donor_name;
  if (d.donor_telegram_id) return `ID ${d.donor_telegram_id}`;
  if (d.user_id) return `User#${d.user_id}`;
  return anonymousLabel;
}

export function DonationsTab({ params }: DonationsTabProps) {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-stats', 'donations', params],
    queryFn: () => salesStatsApi.getDonations(params),
    staleTime: SALES_STATS.STALE_TIME,
    placeholderData: keepPreviousData,
  });

  // Окно той же длины перед выбранным — для сравнения «собрано за период».
  // Для «всего времени» сравнивать не с чем: prevParams === null, запрос не уходит.
  const prevParams = useMemo(
    () =>
      getPreviousPeriodParams({
        days: params.days,
        startDate: params.start_date,
        endDate: params.end_date,
      }),
    [params.days, params.start_date, params.end_date],
  );

  // Без keepPreviousData: при смене периода данные прошлого окна должны исчезнуть,
  // иначе дельта на мгновение считается против чужого окна.
  const { data: prevData } = useQuery({
    queryKey: ['sales-stats', 'donations', prevParams],
    queryFn: () => salesStatsApi.getDonations(prevParams as SalesStatsParams),
    staleTime: SALES_STATS.STALE_TIME,
    enabled: prevParams !== null,
  });

  // prevParams === null («всё время»): сравнивать не с чем, дельту не показываем.
  const deltas = useMemo(() => {
    if (!data || !prevData || !prevParams) return null;
    return {
      total: computeDelta(data.total_amount_kopeks, prevData.total_amount_kopeks),
      count: computeDelta(data.donations_count ?? 0, prevData.donations_count ?? 0),
    };
  }, [data, prevData, prevParams]);

  const avgPerDonor = useMemo(() => {
    if (!data || data.donors_count === 0) return 0;
    return data.total_amount_kopeks / data.donors_count;
  }, [data]);

  const formatValue = useCallback((v: number) => formatWithCurrency(v), [formatWithCurrency]);

  const sourceLabel = useCallback(
    (source: string) =>
      SOURCE_LABEL_KEYS[source]
        ? t(SOURCE_LABEL_KEYS[source])
        : t('admin.salesStats.donations.otherSource', { source }),
    [t],
  );

  // Подписи серий графика: сам ключ серии остаётся слагом из БД.
  const sourceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const source of Object.keys(data?.by_source ?? {})) {
      labels[source] = sourceLabel(source);
    }
    for (const item of data?.daily_by_source ?? []) {
      labels[item.source] = sourceLabel(item.source);
    }
    return labels;
  }, [data?.by_source, data?.daily_by_source, sourceLabel]);

  const sourceItems = useMemo(
    () =>
      Object.entries(data?.by_source ?? {}).map(([source, amount]) => ({
        key: source,
        label: sourceLabel(source),
        value: amount / SALES_STATS.KOPEKS_DIVISOR,
        color: SOURCE_COLORS[source],
      })),
    [data?.by_source, sourceLabel],
  );

  const dailyData = useMemo(
    () =>
      (data?.daily ?? []).map((item) => ({
        date: item.date,
        value: item.amount_kopeks / SALES_STATS.KOPEKS_DIVISOR,
      })),
    [data?.daily],
  );

  const dailyBySourceData = useMemo(
    () =>
      (data?.daily_by_source ?? []).map((item) => ({
        date: item.date,
        key: item.source,
        value: item.amount_kopeks / SALES_STATS.KOPEKS_DIVISOR,
      })),
    [data?.daily_by_source],
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-dark-800/30" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <div className="py-8 text-center text-error-400">{t('admin.salesStats.loadError')}</div>;
  }

  const anonymousLabel = t('admin.salesStats.donations.anonymous');
  const countLabel = t('admin.salesStats.donations.donationsCount');
  const topDonors = data.top_donors ?? [];

  const menuCount = data.by_source_count?.menu ?? 0;
  const upsellCount = data.by_source_count?.topup_upsell ?? 0;

  const funnelShown = data.upsell_funnel?.shown ?? 0;
  const funnelApplied = data.upsell_funnel?.applied ?? 0;
  // Без показов конверсии не существует — «0.0%» читалось бы как «никто не согласился».
  const hasConversion = funnelShown > 0;
  const funnelConversion = hasConversion
    ? `${((funnelApplied / funnelShown) * 100).toFixed(1)}%`
    : t('common.noData');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
        <StatCard
          label={t('admin.salesStats.donations.totalAmount')}
          value={formatWithCurrency(data.total_amount_kopeks / SALES_STATS.KOPEKS_DIVISOR, 0)}
          icon={<BanknotesIcon className="h-5 w-5" />}
          tone="accent"
          delta={deltas?.total}
        />
        <StatCard
          label={countLabel}
          value={data.donations_count ?? 0}
          icon={<HeartbeatIcon className="h-5 w-5" />}
          tone="success"
          delta={deltas?.count}
        />
        <StatCard
          label={t('admin.salesStats.donations.donorsCount')}
          value={data.donors_count}
          icon={<UsersIcon className="h-5 w-5" />}
          tone="neutral"
        />
        <StatCard
          label={t('admin.salesStats.donations.avgDonation')}
          value={formatWithCurrency((data.avg_donation_kopeks ?? 0) / SALES_STATS.KOPEKS_DIVISOR)}
          icon={<SparklesIcon className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label={t('admin.salesStats.donations.avgPerDonor')}
          value={formatWithCurrency(avgPerDonor / SALES_STATS.KOPEKS_DIVISOR)}
          icon={<StarIcon className="h-5 w-5" />}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label={t('admin.salesStats.donations.fromMenu')}
          value={formatWithCurrency((data.by_source?.menu ?? 0) / SALES_STATS.KOPEKS_DIVISOR, 0)}
          subValue={t('admin.salesStats.donations.donationsCountWithValue', {
            count: menuCount,
          })}
          icon={<GiftIcon className="h-5 w-5" />}
          tone="neutral"
        />
        <StatCard
          label={t('admin.salesStats.donations.fromUpsell')}
          value={formatWithCurrency(
            (data.by_source?.topup_upsell ?? 0) / SALES_STATS.KOPEKS_DIVISOR,
            0,
          )}
          subValue={t('admin.salesStats.donations.donationsCountWithValue', {
            count: upsellCount,
          })}
          icon={<WalletIcon className="h-5 w-5" />}
          tone="accent"
        />
      </div>

      <BreakdownList
        title={t('admin.salesStats.donations.bySource')}
        items={sourceItems}
        valueFormatter={formatValue}
      />

      <p className="px-1 text-xs leading-relaxed text-dark-500">
        {t('admin.salesStats.donations.upsellNote')}
      </p>

      <SimpleAreaChart
        data={dailyData}
        title={t('admin.salesStats.donations.dailyChart')}
        chartId="donations-daily"
        valueLabel={t('admin.salesStats.donations.amount')}
      />

      <StackedBarChart
        data={dailyBySourceData}
        title={t('admin.salesStats.donations.dailyBySource')}
        valueFormatter={formatValue}
        keyLabels={sourceLabels}
        colorByKey={SOURCE_COLORS}
      />

      <div className="bento-card">
        <h4 className="mb-3 text-sm font-semibold text-dark-200">
          {t('admin.salesStats.donations.funnelTitle')}
        </h4>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div>
            <div className="text-lg font-bold text-dark-100">{funnelShown}</div>
            <div className="text-xs text-dark-400">
              {t('admin.salesStats.donations.funnelShown')}
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-dark-100">
              {data.upsell_funnel?.accepted ?? 0}
            </div>
            <div className="text-xs text-dark-400">
              {t('admin.salesStats.donations.funnelAccepted')}
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-rose-400">{funnelApplied}</div>
            <div className="text-xs text-dark-400">
              {t('admin.salesStats.donations.funnelApplied')}
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-dark-400">
              {data.upsell_funnel?.declined ?? 0}
            </div>
            <div className="text-xs text-dark-400">
              {t('admin.salesStats.donations.funnelDeclined')}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-dark-700/40 pt-3">
          <span className="text-xs text-dark-400">
            {t('admin.salesStats.donations.funnelConversion')}
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              hasConversion ? 'text-rose-400' : 'text-dark-400'
            }`}
          >
            {funnelConversion}
          </span>
        </div>
      </div>

      <div className="bento-card">
        <h4 className="mb-3 text-sm font-semibold text-dark-200">
          {t('admin.salesStats.donations.topSponsors')}
        </h4>
        {topDonors.length === 0 ? (
          <div className="py-6 text-center text-sm text-dark-400">{t('common.noData')}</div>
        ) : (
          <div className="space-y-2.5">
            {topDonors.map((donor, index) => (
              <div
                key={donor.donor_telegram_id ?? donor.user_id ?? index}
                className="flex items-center gap-3"
              >
                <span className="w-6 shrink-0 text-center text-sm tabular-nums text-dark-400">
                  {index < MEDALS.length ? MEDALS[index] : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-dark-200">
                  {donorDisplay(donor, anonymousLabel)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-dark-500">
                  ×{donor.donations_count}
                </span>
                <span className="shrink-0 text-sm font-semibold text-rose-400">
                  {formatWithCurrency(donor.total_kopeks / SALES_STATS.KOPEKS_DIVISOR, 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
