import { applyLaunchStartParam } from './utils/startParam';

/** The @telegram-apps/sdk-react calls the bootstrap makes. */
export interface TelegramLaunchSdk {
  init: () => void;
  restoreInitData: () => void;
  retrieveLaunchParams: () => { tgWebAppStartParam?: string };
  retrieveRawInitData: () => string | undefined;
}

export interface AppBootstrapDeps {
  sdk: TelegramLaunchSdk;
  /** utils/token: drops the stored session when another Telegram user opened the app. */
  clearStaleSessionIfNeeded: (freshInitData: string | null) => void;
  /** i18n: adopts the Telegram client language on first run. */
  applyTelegramLanguage: () => void;
  /** Mini App components (theme, swipes, closing, back button, viewport), then miniAppReady(). */
  mountTelegramUi: () => void;
  /** useAuthStore.getState().initialize() */
  initializeAuth: () => Promise<unknown>;
  /** Startup work that doesn't read the URL: backend liveness check, logo preload. */
  startBackgroundTasks: () => void;
  /** The first render of the app. */
  render: () => void;
}

// Set on the window once the SDK is initialised: Vite HMR re-runs main.tsx in the same
// window, and the SDK must not be initialised (nor the start param applied) twice.
const HMR_KEY = '__tg_sdk_initialized';

/**
 * The cabinet's startup sequence. It lives here, not inline in main.tsx, so that its
 * ORDER is covered by tests (bootstrap.test.ts): main.tsx calls it once with the real
 * SDK calls, stores and render; the tests pass fakes.
 *
 * 1. Inside Telegram, once per window: SDK init → restore init data → drop another
 *    Telegram user's stale session → the launch's start param becomes the current
 *    URL → client language → Mini App mounts.
 * 2. Auth bootstrap: after init(), so CloudStorage-backed refresh-token recovery can
 *    run inside initialize(); after the start param, so the route guards and the
 *    login return URL already see the target page.
 * 3. Backend liveness check and logo preload, then the first render (the router reads
 *    the URL here).
 *
 * A failing Telegram step costs at most the rest of the Telegram setup, never the auth
 * bootstrap or the render; a failing start param step costs nothing else at all.
 */
export function bootstrapApp(deps: AppBootstrapDeps): void {
  const { sdk } = deps;
  const globals = window as unknown as Record<string, unknown>;

  // Only initialize Telegram SDK when running inside Telegram
  const isTelegramEnv =
    !!globals.TelegramWebviewProxy ||
    window.location.hash.includes('tgWebApp') ||
    window.location.search.includes('tgWebApp');

  const alreadyInitialized = globals[HMR_KEY] === true;

  if (isTelegramEnv && !alreadyInitialized) {
    globals[HMR_KEY] = true;

    try {
      sdk.init();
      sdk.restoreInitData();

      deps.clearStaleSessionIfNeeded(sdk.retrieveRawInitData() || null);

      // startapp deep links (t.me/<bot>/<app>?startapp=tasks) open their page by becoming
      // the initial URL, before the router mounts and auth bootstraps: the route guards
      // and the login return URL then carry it through a login. Once per launch, so a
      // reload keeps the user where they are (see utils/startParam).
      try {
        applyLaunchStartParam({
          startParam: sdk.retrieveLaunchParams().tgWebAppStartParam,
          initData: sdk.retrieveRawInitData(),
        });
      } catch {}

      // Adopt the user's Telegram client language on first run (no explicit choice yet).
      deps.applyTelegramLanguage();

      deps.mountTelegramUi();
    } catch {}
  } else if (!isTelegramEnv) {
    // Outside Telegram — still clear stale session tokens if any
    deps.clearStaleSessionIfNeeded(null);
  }

  // Bootstrap auth after the Telegram SDK is initialised so CloudStorage-backed
  // refresh-token recovery can run inside initialize() (launch params + CloudStorage
  // are only available post-init()).
  void deps.initializeAuth();

  deps.startBackgroundTasks();

  deps.render();
}
