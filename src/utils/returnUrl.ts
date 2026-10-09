import { createPath, resolvePath } from 'react-router';
import { getSafeRedirectPath } from './safeRedirect';

/**
 * Where to send the user after login.
 *
 * Auth guards pass the page they bounced from in router state AND save it here,
 * because full-page login flows (OAuth providers, the Telegram widget redirect)
 * come back without router state.
 *
 * Reading never clears the saved URL: several login paths can finish on the same
 * page (the isAuthenticated effect plus the handler that logged in), and a
 * read-and-clear would hand '/' to whichever of them runs second.
 */
const RETURN_URL_KEY = 'auth_return_url';
const PARSE_BASE = 'https://cabinet.invalid';

// Public login entry points and one-time-token pages: logging in never leads back
// there. /auth/link/... is not one of them — it is protected and completes after login.
const AUTH_ENTRY =
  /^\/(?:login|auto-login|tg|verify-email|reset-password|auth\/(?:telegram|oauth))(?:\/|$)/i;
// TelegramRedirect (/tg, /auth/telegram) only forwards to its ?redirect= target.
const TELEGRAM_REDIRECT = /^\/(?:tg|auth\/telegram)\/*$/i;

// Storage can be unavailable (site data blocked); a missing return URL is not worth a crash.
function readSaved(): string | null {
  try {
    return sessionStorage.getItem(RETURN_URL_KEY);
  } catch {
    return null;
  }
}

function writeSaved(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(RETURN_URL_KEY);
    else sessionStorage.setItem(RETURN_URL_KEY, value);
  } catch {
    // ignore
  }
}

// Where navigate() really lands: react-router collapses '//' and resolves '.' and '..'
// first, then the browser resolves '%2e' segments. Checking the raw string instead
// lets /./login or /x//../login slip past AUTH_ENTRY.
function canonical(path: string): string {
  const url = new URL(createPath(resolvePath(path)), PARSE_BASE);
  return getSafeRedirectPath(url.pathname + url.search + url.hash);
}

// The pathname of a canonical path as react-router matches it: /%6Cogin is /login.
function routeOf(path: string): string {
  const { pathname } = new URL(path, PARSE_BASE);
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** The page a safe in-app path leads to once the user is logged in; '/' if none. */
function destinationOf(path: string): string {
  let target = canonical(path);
  // A TelegramRedirect URL can wrap another one; follow a few hops at most
  for (let hop = 0; hop < 3 && TELEGRAM_REDIRECT.test(routeOf(target)); hop++) {
    const redirect = new URL(target, PARSE_BASE).searchParams.get('redirect');
    target = canonical(getSafeRedirectPath(redirect));
  }
  return AUTH_ENTRY.test(routeOf(target)) ? '/' : target;
}

/** Remember `path` (default: the current URL); a path that leads nowhere forgets a stale target. */
export function saveReturnUrl(path?: string): void {
  if (path === undefined && typeof window === 'undefined') return;
  const target = getSafeRedirectPath(path ?? window.location.pathname + window.location.search);
  const route = routeOf(canonical(target));
  // A guard can re-render while window.location already reads /login: keep the target
  if (AUTH_ENTRY.test(route) && !TELEGRAM_REDIRECT.test(route)) return;
  const destination = destinationOf(target);
  writeSaved(destination === '/' ? null : destination);
}

/**
 * Router-state `from` when there is one — it is this navigation's own intent, so it
 * wins even when it leads home — otherwise the saved URL.
 */
export function resolveReturnUrl(stateFrom?: string | null): string {
  return destinationOf(getSafeRedirectPath(stateFrom || readSaved()));
}

/** Forget the saved URL once the user has been sent there. */
export function clearReturnUrl(): void {
  writeSaved(null);
}
