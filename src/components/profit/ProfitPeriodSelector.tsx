import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getMonthRange, matchedMonth } from '../../utils/period';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { DateField } from '../DateField';

interface Period {
  days?: number;
  startDate?: string;
  endDate?: string;
}

interface ProfitPeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
}

const DAY_PRESETS = [7, 30, 90] as const;

/**
 * Переключатель периода для отчёта по прибыли.
 *
 * Отличается от селектора в статистике продаж помесячным шагом: прибыль
 * считают и заполняют месяцами, и нужно уметь открыть конкретный прошлый
 * месяц, а не только «последние N дней».
 */
export function ProfitPeriodSelector({ value, onChange }: ProfitPeriodSelectorProps) {
  const { t, i18n } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);

  const now = new Date();
  const matched = matchedMonth(value);
  // Когда выбран не месяц, стрелки всё равно должны откуда-то шагать — от текущего.
  const shown = matched ?? { year: now.getFullYear(), month: now.getMonth() };
  const isCurrentMonth = shown.year === now.getFullYear() && shown.month === now.getMonth();

  const monthLabel = new Date(shown.year, shown.month, 1).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
  });

  const goToMonth = (year: number, month: number) => {
    setShowCustom(false);
    onChange({ days: undefined, ...getMonthRange(year, month) });
  };

  const step = (delta: number) => {
    const target = new Date(shown.year, shown.month + delta, 1);
    goToMonth(target.getFullYear(), target.getMonth());
  };

  const buttonClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-accent-500/20 text-accent-400'
        : 'bg-dark-800/50 text-dark-400 hover:bg-dark-700/50 hover:text-dark-300'
    }`;

  const arrowClass =
    'flex h-8 w-8 items-center justify-center rounded-lg text-dark-400 transition-colors hover:bg-dark-700/50 hover:text-dark-200 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Помесячный шаг */}
      <div
        className={`flex items-center gap-0.5 rounded-lg p-0.5 ${
          matched && !showCustom ? 'bg-accent-500/15' : 'bg-dark-800/50'
        }`}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          className={arrowClass}
          aria-label={t('admin.profit.period.prevMonth')}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goToMonth(shown.year, shown.month)}
          className={`min-w-[8.5rem] px-2 text-sm font-medium capitalize transition-colors ${
            matched && !showCustom ? 'text-accent-400' : 'text-dark-300 hover:text-dark-100'
          }`}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          // Вперёд от текущего месяца некуда: там пустой отчёт.
          disabled={isCurrentMonth}
          className={arrowClass}
          aria-label={t('admin.profit.period.nextMonth')}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {DAY_PRESETS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => {
            setShowCustom(false);
            onChange({ days });
          }}
          className={buttonClass(!showCustom && value.days === days)}
        >
          {t('admin.profit.period.lastDays', { count: days })}
        </button>
      ))}

      <button
        type="button"
        onClick={() => {
          setShowCustom(false);
          onChange({ days: 0 });
        }}
        className={buttonClass(!showCustom && value.days === 0)}
      >
        {t('admin.profit.period.all')}
      </button>

      <button
        type="button"
        onClick={() => setShowCustom((prev) => !prev)}
        className={buttonClass(showCustom)}
      >
        {t('admin.profit.period.custom')}
      </button>

      {showCustom && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <DateField
            value={value.startDate || ''}
            onChange={(v) => onChange({ ...value, days: undefined, startDate: v })}
            max={value.endDate}
            placeholder={t('admin.profit.period.from')}
          />
          <span className="text-dark-500">{'—'}</span>
          <DateField
            value={value.endDate || ''}
            onChange={(v) => onChange({ ...value, days: undefined, endDate: v })}
            min={value.startDate}
            placeholder={t('admin.profit.period.to')}
          />
        </div>
      )}
    </div>
  );
}
