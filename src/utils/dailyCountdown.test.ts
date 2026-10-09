import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import fa from '../locales/fa.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh.json';
import { dailyChargeCountdown, formatDailyCountdown, type CountdownUnits } from './dailyCountdown';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = Date.UTC(2026, 9, 8, 9, 30, 0);

// next_daily_charge_at `remaining` ms from NOW, as the API sends it (pydantic: Z for UTC),
// or without the zone, which the page reads as UTC as well
const chargeIn = (remaining: number) => new Date(NOW + remaining).toISOString();
const naive = (iso: string) => iso.slice(0, -1);

interface PauseUnits {
  subscription: { pause: CountdownUnits };
}

const unitsOf = (locale: PauseUnits): CountdownUnits => ({
  days: locale.subscription.pause.days,
  hours: locale.subscription.pause.hours,
  minutes: locale.subscription.pause.minutes,
});
const RU = unitsOf(ru); // дн. / ч / м
const EN = unitsOf(en); // d. / h / m

const label = (remaining: number, units = RU) =>
  formatDailyCountdown(dailyChargeCountdown(chargeIn(remaining), NOW), units);

// The page's countdown before reward tasks (Subscription.tsx up to round 3). It is right
// while the charge is less than a day away, which was the only case then.
function legacyCountdown(nextChargeAt: string, now: number, units: CountdownUnits) {
  const nextChargeStr = nextChargeAt.endsWith('Z') ? nextChargeAt : `${nextChargeAt}Z`;
  const totalMs = 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(0, new Date(nextChargeStr).getTime() - now);
  const progress = Math.min(100, ((totalMs - remainingMs) / totalMs) * 100);
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const text =
    hours > 0 ? `${hours}${units.hours} ${minutes}${units.minutes}` : `${minutes}${units.minutes}`;
  return { text, progress };
}

describe('dailyChargeCountdown + formatDailyCountdown: under a day, as before', () => {
  it('label and bar are exactly the old ones for every charge less than a day away', () => {
    const samples = [0, 1, 59 * 1000, HOUR - 1, HOUR, 5 * HOUR + 7 * MINUTE, DAY - MINUTE, DAY - 1];
    for (let remaining = 0; remaining < DAY; remaining += 7 * MINUTE + 13 * 1000) {
      samples.push(remaining);
    }
    for (const remaining of samples) {
      for (const nextChargeAt of [chargeIn(remaining), naive(chargeIn(remaining))]) {
        for (const units of [RU, EN]) {
          const countdown = dailyChargeCountdown(nextChargeAt, NOW);
          const legacy = legacyCountdown(nextChargeAt, NOW, units);
          expect(countdown.days, nextChargeAt).toBe(0);
          expect(formatDailyCountdown(countdown, units), nextChargeAt).toBe(legacy.text);
          expect(countdown.progress, nextChargeAt).toBe(legacy.progress);
        }
      }
    }
  });

  it('«5ч 7м» with hours left, «42м» in the last hour', () => {
    expect(label(5 * HOUR + 7 * MINUTE + 30 * 1000)).toBe('5ч 7м');
    expect(label(42 * MINUTE + 59 * 1000)).toBe('42м');
    expect(label(5 * HOUR + 7 * MINUTE, EN)).toBe('5h 7m');
  });

  it('the bar fills as the charge nears: 25% six hours into the day, full at the charge', () => {
    expect(dailyChargeCountdown(chargeIn(18 * HOUR), NOW).progress).toBe(25);
    expect(dailyChargeCountdown(chargeIn(0), NOW).progress).toBe(100);
  });

  it('a charge already due shows 0 minutes and a full bar', () => {
    expect(dailyChargeCountdown(chargeIn(-3 * HOUR), NOW)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      progress: 100,
    });
    expect(label(-3 * HOUR)).toBe('0м');
  });
});

describe('dailyChargeCountdown + formatDailyCountdown: a charge days away (reward task)', () => {
  // A daily row charged 2 h ago gets a 3-day reward: the next charge moves 3 days on, to
  // 94 h away. The old code showed «94ч 5м» and a bar of scaleX(-2.9), i.e. empty.
  const POSTPONED = 3 * DAY + 22 * HOUR + 5 * MINUTE + 30 * 1000;

  it('days, hours and minutes, like the bot («3д 22ч 5мин»)', () => {
    expect(dailyChargeCountdown(chargeIn(POSTPONED), NOW)).toEqual({
      days: 3,
      hours: 22,
      minutes: 5,
      progress: 0,
    });
    expect(label(POSTPONED)).toBe('3дн. 22ч 5м');
    expect(label(POSTPONED, EN)).toBe('3d. 22h 5m');
    expect(formatDailyCountdown(dailyChargeCountdown(naive(chargeIn(POSTPONED)), NOW), RU)).toBe(
      '3дн. 22ч 5м',
    );
  });

  it('a timestamp without the zone is UTC in any browser time zone', () => {
    // 12:30 without a zone is 12:30 UTC, 3 h after NOW (09:30 UTC). Read as local time it
    // would be off by the zone's offset, which UTC (the usual CI zone) cannot show: the
    // check runs in Moscow (UTC+3), and fails rather than passes if the zone did not apply.
    const savedTz = process.env.TZ;
    process.env.TZ = 'Europe/Moscow';
    try {
      expect(new Date('2026-10-08T12:30:00').getTime(), 'TZ took effect').toBe(NOW);
      expect(dailyChargeCountdown('2026-10-08T12:30:00', NOW)).toMatchObject({
        days: 0,
        hours: 3,
        minutes: 0,
      });
      expect(dailyChargeCountdown('2026-10-12T12:30:00', NOW)).toMatchObject({
        days: 4,
        hours: 3,
        minutes: 0,
      });
    } finally {
      if (savedTz === undefined) delete process.env.TZ;
      else process.env.TZ = savedTz;
    }
  });

  it('from a whole day on: «1дн. 0ч 0м» exactly a day ahead, «23ч 59м» a minute less', () => {
    expect(label(DAY)).toBe('1дн. 0ч 0м');
    expect(label(DAY - MINUTE)).toBe('23ч 59м');
    expect(label(10 * DAY + 3 * MINUTE)).toBe('10дн. 0ч 3м');
  });

  it('the bar stays within [0, 100]: empty while the charge is a day or more away', () => {
    for (let remaining = -3 * DAY; remaining <= 10 * DAY; remaining += 37 * MINUTE) {
      const { progress } = dailyChargeCountdown(chargeIn(remaining), NOW);
      expect(progress, `${remaining} ms`).toBeGreaterThanOrEqual(0);
      expect(progress, `${remaining} ms`).toBeLessThanOrEqual(100);
      if (remaining >= DAY) expect(progress, `${remaining} ms`).toBe(0);
    }
    expect(dailyChargeCountdown(chargeIn(POSTPONED), NOW).progress).toBe(0);
  });
});

describe('unit labels', () => {
  // The page calls t('subscription.pause.days') without a count: that needs the base
  // key, next to the plural forms the paused view uses
  it.each<[string, PauseUnits]>([
    ['ru', ru],
    ['en', en],
    ['zh', zh],
    ['fa', fa],
  ])('%s has subscription.pause.days, .hours and .minutes', (_lang, locale) => {
    const { days, hours, minutes } = locale.subscription.pause;
    for (const unit of [days, hours, minutes]) {
      expect(typeof unit).toBe('string');
      expect(unit.trim()).not.toBe('');
    }
  });
});

describe('wiring (merge guard)', () => {
  // Subscription.tsx comes from upstream and is merged by hand: taking its daily block
  // back would bring the hours-only label and the negative bar back with every test
  // above still green
  const page = readFileSync(new URL('../pages/Subscription.tsx', import.meta.url), 'utf8');

  it('the next-charge block of Subscription.tsx takes its label and its bar from these helpers', () => {
    expect(page).toMatch(
      /const countdown = dailyChargeCountdown\(\s*subscription\.next_daily_charge_at,\s*Date\.now\(\),?\s*\)/,
    );
    expect(page).toMatch(
      /formatDailyCountdown\(countdown, \{\s*days: t\('subscription\.pause\.days'\),\s*hours: t\('subscription\.pause\.hours'\),\s*minutes: t\('subscription\.pause\.minutes'\),?\s*\}\)/,
    );
    expect(page).toMatch(/transform: `scaleX\(\$\{countdown\.progress \/ 100\}\)`/);
  });
});
