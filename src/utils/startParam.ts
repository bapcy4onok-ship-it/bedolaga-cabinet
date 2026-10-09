/**
 * Telegram Mini App start params → in-app pages.
 *
 * Text links and buttons outside private-chat web_app buttons can only enter the
 * Mini App via `t.me/<bot>/<app>?startapp=<param>` deep links: admin ticket
 * notifications in group/channel chats (bot issue #2988), the bot's rich main-menu
 * «Продлить» links, channel posts about «Задания». Telegram delivers the param as
 * `tgWebAppStartParam`.
 *
 * The app bootstrap (bootstrap.ts, run by main.tsx) turns it into the INITIAL URL,
 * before the router mounts and auth bootstraps, so the route guards, saveReturnUrl()
 * and the Login page carry the target through a login like any other protected URL.
 * Access is still decided by each route's own guard (e.g. `PermissionRoute`).
 *
 * Once per launch: the SDK keeps the launch params in sessionStorage, so every
 * reload of the same launch (a hard redirect to /login, a chunk-load reload,
 * Telegram's «Reload») would otherwise send the user back to the target — away from
 * where they were, and into a reload loop when that page hard-redirects again.
 */

interface StartParamRoute {
  re: RegExp;
  to: (match: RegExpExecArray) => string;
}

const START_PARAM_ROUTES: readonly StartParamRoute[] = [
  // Admin ticket notification buttons in group chats (bot issue #2988).
  { re: /^admin_ticket_(\d+)$/, to: (match) => `/admin/tickets/${match[1]}` },
  // «Продлить» links for expired subscriptions in the bot's rich main menu.
  { re: /^renew_(\d+)$/, to: (match) => `/subscriptions/${match[1]}/renew` },
  { re: /^subscriptions$/, to: () => '/subscriptions' },
  // Paid-trial «Активировать триал» link in the bot's rich main menu — the
  // dashboard renders TrialOfferCard with the pay-and-activate flow.
  { re: /^trial$/, to: () => '/' },
  // «Задания» (free subscription days) — e.g. a channel post linking
  // t.me/<bot>/<app>?startapp=tasks straight to the task list.
  { re: /^tasks$/, to: () => '/tasks' },
];

/** The in-app path a start param leads to; null for a missing or unknown param. */
export function resolveStartParam(startParam: string | null | undefined): string | null {
  if (!startParam) return null;
  for (const { re, to } of START_PARAM_ROUTES) {
    const match = re.exec(startParam);
    if (match) return to(match);
  }
  return null;
}

/**
 * Identifies one Mini App launch: Telegram signs the init data of every launch anew
 * (its `hash`, or the third-party `signature`, covers `auth_date`), while a reload
 * of the same launch gets the same init data back from the SDK's sessionStorage.
 */
export function launchIdOf(rawInitData: string | null | undefined): string | null {
  if (!rawInitData) return null;
  try {
    const params = new URLSearchParams(rawInitData);
    return params.get('hash') || params.get('signature') || rawInitData;
  } catch {
    return rawInitData;
  }
}

// sessionStorage, like the SDK's own launch params: Telegram Web/Desktop iframes can
// share it between launches, which is why the value is the launch id, not a flag
const APPLIED_LAUNCH_KEY = 'start_param_applied_launch';

function readAppliedLaunch(): string | null {
  try {
    return sessionStorage.getItem(APPLIED_LAUNCH_KEY);
  } catch {
    return null;
  }
}

function rememberAppliedLaunch(launchId: string): void {
  try {
    sessionStorage.setItem(APPLIED_LAUNCH_KEY, launchId);
  } catch {
    // Storage blocked: a reload re-applies the param (best effort, no crash)
  }
}

export interface LaunchStartParam {
  /** `tgWebAppStartParam` of the launch params. */
  startParam?: string | null;
  /** Raw init data of the launch (retrieveRawInitData()). */
  initData?: string | null;
}

/**
 * Makes the launch's start param the current URL — once per launch, BEFORE the
 * router mounts. Returns the target path when the param was applied (even if the URL
 * already was the target), otherwise null: no or unknown param, or this launch's
 * param was already applied by an earlier page load.
 */
export function applyLaunchStartParam({ startParam, initData }: LaunchStartParam): string | null {
  const target = resolveStartParam(startParam);
  if (!target) return null;

  const launchId = launchIdOf(initData);
  if (launchId) {
    if (readAppliedLaunch() === launchId) return null;
    rememberAppliedLaunch(launchId);
  }

  const { pathname, search } = window.location;
  if (pathname + search !== target) {
    // Same as the navigate(target, { replace: true }) this replaces: the launch hash
    // is dropped (the SDK keeps the launch params in sessionStorage and the
    // navigation entry), the history entry and its state are kept.
    window.history.replaceState(window.history.state, '', target);
  }
  return target;
}
