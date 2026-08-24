import type { SalesStatsParams } from '../api/adminSalesStats';

/** Period-over-period change shown on a StatCard. */
export type PeriodDelta = { percent: number; trend: 'up' | 'down' | 'stable' };

/** Local calendar date as YYYY-MM-DD. Deliberately not toISOString(), which
 * converts to UTC first and shifts the day on negative offsets. */
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD → local midnight of that day. `new Date('2026-08-24')` would parse
 * the bare date as UTC instead. */
function fromLocalISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Calendar-day arithmetic in local time — DST-safe, unlike adding 86 400 000 ms. */
function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** UTC calendar date as YYYY-MM-DD. For windows the backend derives from its own
 * clock, where the UTC day — not the browser's — is the unit that has to line up. */
function toUtcISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** First day of the current month → today, as local YYYY-MM-DD strings.
 * Used as the default sales-stats window ("this month so far"). */
export function getMonthToDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  return {
    startDate: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: toLocalISODate(now),
  };
}

/** True when the period is exactly "from the 1st of the current month to today". */
export function isMonthToDate(period: {
  days?: number;
  startDate?: string;
  endDate?: string;
}): boolean {
  if (period.days !== undefined) return false;
  const mtd = getMonthToDateRange();
  return period.startDate === mtd.startDate && period.endDate === mtd.endDate;
}

/**
 * Same-length window immediately before the selected one, for period-over-period
 * deltas. Returns null for "all time" — nothing meaningful to compare against.
 *
 * Expressed as plain YYYY-MM-DD dates, the same units the current window uses:
 * the backend treats both bounds as inclusive and stretches end_date to 23:59:59
 * of that day. So the previous window must END THE DAY BEFORE the current one
 * starts — handing it the current start would swallow that whole first day into
 * both windows and inflate the "previous" side. Dates (not Date.now() instants)
 * also keep the query key stable, so returning to the tab doesn't refetch.
 */
export function getPreviousPeriodParams(period: {
  days?: number;
  startDate?: string;
  endDate?: string;
}): SalesStatsParams | null {
  if (period.startDate && period.endDate) {
    const start = fromLocalISODate(period.startDate);
    const end = fromLocalISODate(period.endDate);
    // Both bounds are inclusive, so a one-day range is 1 calendar day long.
    const lengthDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(lengthDays - 1));
    return {
      start_date: toLocalISODate(prevStart),
      end_date: toLocalISODate(prevEnd),
    };
  }
  if (period.days !== undefined && period.days > 0) {
    // This window is the one case the backend builds from its OWN clock, in UTC:
    // start = UTC midnight of (now − days), end = now. So the previous window has
    // to be stepped back in UTC calendar days too. Local ones slide the boundary a
    // full day whenever the browser's date and the UTC date disagree (evening in
    // Moscow, morning in Los Angeles), which either double-counts a day or leaves
    // a day belonging to neither window.
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    // Subtracting whole days keeps the UTC clock time, so the start lands on
    // today's UTC date minus the day count — UTC has no DST to shift it.
    const today = now.getUTCDate();
    // Current window covers UTC dates [today − days .. today]: days + 1 calendar
    // days, the last one partial. The previous mirrors that length and ends the
    // day before the current one starts.
    const prevStart = Date.UTC(year, month, today - 2 * period.days - 1);
    const prevEnd = Date.UTC(year, month, today - period.days - 1);
    return {
      start_date: toUtcISODate(prevStart),
      end_date: toUtcISODate(prevEnd),
    };
  }
  return null;
}

export function computeDelta(current: number, previous: number): PeriodDelta | null {
  if (previous === 0) return current === 0 ? null : { percent: 100, trend: 'up' };
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  return { percent, trend: percent > 0 ? 'up' : percent < 0 ? 'down' : 'stable' };
}
