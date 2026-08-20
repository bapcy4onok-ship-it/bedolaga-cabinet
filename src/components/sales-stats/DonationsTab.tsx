import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { DonorItem, SalesStatsParams } from '../../api/adminSalesStats';
import { salesStatsApi } from '../../api/adminSalesStats';
import { SALES_STATS } from '../../constants/salesStats';
import { useCurrency } from '../../hooks/useCurrency';
import { BanknotesIcon, StarIcon, UsersIcon } from '../../components/icons';
import { StatCard } from '../stats';

interface DonationsTabProps {
  params: SalesStatsParams;
}

const MEDALS = ['🥇', '🥈', '🥉'];

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

  const avgPerDonor = useMemo(() => {
    if (!data || data.donors_count === 0) return 0;
    return data.total_amount_kopeks / data.donors_count;
  }, [data]);

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('admin.salesStats.donations.totalAmount')}
          value={formatWithCurrency(data.total_amount_kopeks / SALES_STATS.KOPEKS_DIVISOR, 0)}
          icon={<BanknotesIcon className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label={t('admin.salesStats.donations.donorsCount')}
          value={data.donors_count}
          icon={<UsersIcon className="h-5 w-5" />}
          tone="neutral"
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
          icon={<BanknotesIcon className="h-5 w-5" />}
          tone="neutral"
        />
        <StatCard
          label={t('admin.salesStats.donations.fromUpsell')}
          value={formatWithCurrency(
            (data.by_source?.topup_upsell ?? 0) / SALES_STATS.KOPEKS_DIVISOR,
            0,
          )}
          icon={<BanknotesIcon className="h-5 w-5" />}
          tone="accent"
        />
      </div>

      <div className="bento-card">
        <h4 className="mb-3 text-sm font-semibold text-dark-200">
          {t('admin.salesStats.donations.funnelTitle')}
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-dark-100">{data.upsell_funnel?.shown ?? 0}</div>
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
            <div className="text-lg font-bold text-rose-400">
              {data.upsell_funnel?.applied ?? 0}
            </div>
            <div className="text-xs text-dark-400">
              {t('admin.salesStats.donations.funnelApplied')}
            </div>
          </div>
        </div>
      </div>

      <div className="bento-card">
        <h4 className="mb-3 text-sm font-semibold text-dark-200">
          {t('admin.salesStats.donations.topSponsors')}
        </h4>
        {data.top_donors.length === 0 ? (
          <div className="py-6 text-center text-sm text-dark-400">{t('common.noData')}</div>
        ) : (
          <div className="space-y-2.5">
            {data.top_donors.map((donor, index) => (
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
