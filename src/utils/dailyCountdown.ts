const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** A daily tariff charges every 24 h: the countdown bar spans one such period. */
const DAY_MS = 24 * HOUR_MS;

export interface DailyChargeCountdown {
  /** Whole days left: 0 while the charge is less than a day away. */
  days: number;
  /** Hours left past the whole days, 0–23. */
  hours: number;
  /** Minutes left past the whole hours, 0–59. */
  minutes: number;
  /** How much of the 24 h before the charge has passed, in percent, within [0, 100]. */
  progress: number;
}

/**
 * The «До следующего списания» countdown of a daily tariff (Subscription page).
 *
 * The next charge is normally less than a day away, but a reward task postpones it by
 * the days it gives, so it can be days away. The days are then counted on their own,
 * like the bot's «3д 22ч 5мин», and the 24 h bar stays empty until the last day
 * instead of going negative.
 *
 * `nextChargeAt` is the API's next_daily_charge_at; a timestamp without the Z is UTC.
 */
export function dailyChargeCountdown(nextChargeAt: string, now: number): DailyChargeCountdown {
  const iso = nextChargeAt.endsWith('Z') ? nextChargeAt : `${nextChargeAt}Z`;
  const remainingMs = Math.max(0, new Date(iso).getTime() - now);
  return {
    days: Math.floor(remainingMs / DAY_MS),
    hours: Math.floor((remainingMs % DAY_MS) / HOUR_MS),
    minutes: Math.floor((remainingMs % HOUR_MS) / MINUTE_MS),
    progress: Math.min(100, Math.max(0, ((DAY_MS - remainingMs) / DAY_MS) * 100)),
  };
}

/** Unit labels, i.e. t('subscription.pause.days' | '.hours' | '.minutes'). */
export interface CountdownUnits {
  days: string;
  hours: string;
  minutes: string;
}

/**
 * The countdown's label: «3дн. 22ч 5м» from a day on; under a day it is unchanged,
 * «5ч 7м», and «7м» in the last hour.
 */
export function formatDailyCountdown(
  { days, hours, minutes }: Pick<DailyChargeCountdown, 'days' | 'hours' | 'minutes'>,
  units: CountdownUnits,
): string {
  if (days > 0) return `${days}${units.days} ${hours}${units.hours} ${minutes}${units.minutes}`;
  if (hours > 0) return `${hours}${units.hours} ${minutes}${units.minutes}`;
  return `${minutes}${units.minutes}`;
}
