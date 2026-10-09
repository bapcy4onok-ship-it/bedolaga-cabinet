import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  init,
  restoreInitData,
  retrieveLaunchParams,
  retrieveRawInitData,
  mountMiniApp,
  miniAppReady,
  mountViewport,
  expandViewport,
  mountSwipeBehavior,
  disableVerticalSwipes,
  mountClosingBehavior,
  disableClosingConfirmation,
  mountBackButton,
  bindThemeParamsCssVars,
  bindViewportCssVars,
  requestFullscreen,
  isFullscreen,
} from '@telegram-apps/sdk-react';
import { clearStaleSessionIfNeeded } from './utils/token';
import { bootstrapApp } from './bootstrap';
import { installEncodingSurrogateGuard } from './utils/installEncodingSurrogateGuard';
import { useAuthStore } from './store/auth';
import { AppWithNavigator } from './AppWithNavigator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initLogoPreload } from './api/branding';
import { checkBackendOnStartup } from './api/health';
import { getCachedFullscreenEnabled, isTelegramMobile } from './hooks/useTelegramSDK';
import { applyTelegramLanguage } from './i18n';
import './styles/globals.css';

// Harden the global encoders against lone UTF-16 surrogates (truncated emoji in
// backend names/remarks) BEFORE anything renders or fetches — otherwise such a
// string crashes any encodeURI/encodeURIComponent/btoa path on iOS WebKit,
// including qrcode.react's internal encodeURI. See installEncodingSurrogateGuard.
installEncodingSurrogateGuard();

// Polyfill Object.hasOwn for older iOS/Android WebViews (Safari < 15.4, old Chrome).
// @telegram-apps/sdk v3 depends on valibot which uses Object.hasOwn internally.
// Without this, init() throws LaunchParamsRetrieveError on affected devices.
// See: https://github.com/Telegram-Mini-Apps/tma.js/issues/683
if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Object as any).hasOwn = (obj: object, prop: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(obj, prop);
}

// Each mount in its own try/catch so one failure doesn't block others.
// mountMiniApp() internally mounts themeParams in SDK v3,
// so we don't call mountThemeParams() separately to avoid ConcurrentCallError.
function mountTelegramUi(): void {
  try {
    mountMiniApp();
  } catch {}
  try {
    bindThemeParamsCssVars();
  } catch {}
  try {
    mountSwipeBehavior();
    disableVerticalSwipes();
  } catch {}
  try {
    mountClosingBehavior();
    disableClosingConfirmation();
  } catch {}
  try {
    mountBackButton();
  } catch {}
  // Viewport must be mounted before requesting fullscreen
  mountViewport()
    .then(() => {
      bindViewportCssVars();
      expandViewport();

      // Auto-enter fullscreen if enabled in settings (mobile only)
      if (getCachedFullscreenEnabled() && isTelegramMobile()) {
        if (!isFullscreen()) {
          requestFullscreen();
        }
      }
    })
    .catch(() => {});

  miniAppReady();
}

function startBackgroundTasks(): void {
  // In parallel with auth bootstrap, eagerly check backend liveness so a dead
  // backend paints the ServiceUnavailableScreen immediately instead of flashing
  // the /login page first.
  void checkBackendOnStartup();

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => initLogoPreload());
  } else {
    setTimeout(initLogoPreload, 100);
  }
}

function renderApp(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary level="app">
        <QueryClientProvider client={queryClient}>
          <AppWithNavigator />
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// Telegram SDK and the startapp param first, then the auth bootstrap, then the first
// render. The order is what keeps a startapp deep link from looping or getting lost,
// so it lives in bootstrap.ts, under test.
bootstrapApp({
  sdk: { init, restoreInitData, retrieveLaunchParams, retrieveRawInitData },
  clearStaleSessionIfNeeded,
  applyTelegramLanguage,
  mountTelegramUi,
  initializeAuth: () => useAuthStore.getState().initialize(),
  startBackgroundTasks,
  render: renderApp,
});
