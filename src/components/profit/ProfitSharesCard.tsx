import { useTranslation } from 'react-i18next';

import type { ProfitExpenseItem } from '../../api/adminProfit';
import { useCurrency } from '../../hooks/useCurrency';

import { KOPEKS_IN_RUBLE } from './constants';

interface ProfitSharesCardProps {
  /** Прибыль после всех расходов, но до долей — база, от которой берётся процент. */
  profitBeforeShares: number;
  shares: ProfitExpenseItem[];
  sharesTotal: number;
  percentTotal: number;
  /** Что остаётся в деле после выплаты долей. */
  netProfit: number;
}

/**
 * Раскладка «прибыль → доли → остаток».
 *
 * Отдельным блоком, а не строчкой в списке расходов: доля — не трата, а способ
 * поделить заработанное, и человеку важно видеть саму базу, от которой считался
 * процент. В списке категорий доли тоже есть — там они как расход, здесь как ответ
 * на вопрос «сколько мне причитается».
 */
export function ProfitSharesCard({
  profitBeforeShares,
  shares,
  sharesTotal,
  percentTotal,
  netProfit,
}: ProfitSharesCardProps) {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();

  const money = (kopeks: number) => formatWithCurrency(kopeks / KOPEKS_IN_RUBLE, 0);
  const atLoss = profitBeforeShares <= 0;

  return (
    <div className="bento-card">
      <h4 className="mb-3 text-sm font-semibold text-dark-200">{t('admin.profit.shares.title')}</h4>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-dark-400">{t('admin.profit.shares.base')}</span>
          <span
            className={`font-semibold ${profitBeforeShares >= 0 ? 'text-dark-100' : 'text-error-400'}`}
          >
            {money(profitBeforeShares)}
          </span>
        </div>

        <div className="space-y-1.5 border-y border-dark-700/40 py-2">
          {shares.map((share, index) => (
            <div
              key={share.id ?? `share-${index}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-dark-200">{share.title}</span>
                <span className="shrink-0 rounded-full bg-accent-500/15 px-2 py-0.5 text-xs font-medium text-accent-400">
                  {share.percent}%
                </span>
              </span>
              <span className="shrink-0 font-medium text-dark-100">
                −{money(share.period_amount_kopeks)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-dark-400">
            {t('admin.profit.shares.remainder')}
            {percentTotal > 0 && (
              <span className="ml-1.5 text-xs text-dark-500">
                {t('admin.profit.shares.remainderPercent', {
                  percent: Math.round((100 - percentTotal) * 10) / 10,
                })}
              </span>
            )}
          </span>
          <span
            className={`font-semibold ${netProfit >= 0 ? 'text-success-400' : 'text-error-400'}`}
          >
            {money(netProfit)}
          </span>
        </div>
      </div>

      {atLoss && sharesTotal === 0 && (
        <p className="mt-3 text-xs text-warning-400">{t('admin.profit.shares.lossHint')}</p>
      )}
      {percentTotal > 100 && (
        <p className="mt-3 text-xs text-error-400">
          {t('admin.profit.shares.overHundred', { percent: percentTotal })}
        </p>
      )}
    </div>
  );
}
