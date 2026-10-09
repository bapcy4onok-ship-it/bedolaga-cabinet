import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthRange, getMonthToDateRange, isMonthToDate, matchedMonth } from './period';

describe('period', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a month-to-date range with zero-padded local dates', () => {
    vi.setSystemTime(new Date(2026, 2, 5));
    expect(getMonthToDateRange()).toEqual({ startDate: '2026-03-01', endDate: '2026-03-05' });
  });

  it('recognises the current month-to-date period', () => {
    vi.setSystemTime(new Date(2026, 6, 13));
    expect(isMonthToDate({ startDate: '2026-07-01', endDate: '2026-07-13' })).toBe(true);
  });

  it('rejects day-based and mismatched periods', () => {
    vi.setSystemTime(new Date(2026, 6, 13));
    expect(isMonthToDate({ days: 30 })).toBe(false);
    expect(isMonthToDate({ startDate: '2026-07-01', endDate: '2026-07-12' })).toBe(false);
    expect(isMonthToDate({})).toBe(false);
  });
  it('builds a full calendar month for a past month', () => {
    vi.setSystemTime(new Date(2026, 7, 25));
    expect(getMonthRange(2026, 6)).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });

  it('clips the current month at today instead of running into the future', () => {
    vi.setSystemTime(new Date(2026, 7, 25));
    expect(getMonthRange(2026, 7)).toEqual({ startDate: '2026-08-01', endDate: '2026-08-25' });
  });

  it('handles February in a leap year', () => {
    vi.setSystemTime(new Date(2028, 5, 1));
    expect(getMonthRange(2028, 1)).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });

  it('recognises a period that is exactly a calendar month', () => {
    vi.setSystemTime(new Date(2026, 7, 25));
    expect(matchedMonth({ startDate: '2026-07-01', endDate: '2026-07-31' })).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it('treats the default month-to-date period as the current month', () => {
    vi.setSystemTime(new Date(2026, 7, 25));
    expect(matchedMonth(getMonthToDateRange())).toEqual({ year: 2026, month: 7 });
  });

  it('does not treat day presets or partial ranges as a month', () => {
    vi.setSystemTime(new Date(2026, 7, 25));
    expect(matchedMonth({ days: 30 })).toBeNull();
    expect(matchedMonth({ startDate: '2026-07-05', endDate: '2026-07-31' })).toBeNull();
    expect(matchedMonth({ startDate: '2026-07-01', endDate: '2026-07-20' })).toBeNull();
  });
});
