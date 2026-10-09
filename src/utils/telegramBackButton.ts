export interface BackButtonQueryContext {
  /** isInTelegramWebApp(): the back button only exists inside the Telegram Mini App. */
  isTelegram: boolean;
  /** useAuthStore's isAuthenticated. */
  isAuthenticated: boolean;
}

/**
 * Whether TelegramBackButton (AppWithNavigator) may fetch the subscriptions list it
 * uses to pick the Back target.
 *
 * Not outside Telegram: the cabinet still loads on the web and needs no back button.
 * Not before login: the component sits outside the route guards, and a 401 makes the
 * API client wipe the session (its CloudStorage copy too) and hard-reload to /login.
 * Before login that reload repeats on every page load: the Mini App reload loop.
 * Until the data arrives the back button's defaults stay fail-closed.
 */
export function isBackButtonQueryEnabled({
  isTelegram,
  isAuthenticated,
}: BackButtonQueryContext): boolean {
  return isTelegram && isAuthenticated;
}
