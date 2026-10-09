import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapApp, type AppBootstrapDeps, type TelegramLaunchSdk } from './bootstrap';

/**
 * The startup order is what keeps a startapp deep link (t.me/<bot>/<app>?startapp=tasks)
 * from looping or getting lost: the param must be the URL before the auth bootstrap and
 * the first render, once per launch. The suite runs in a plain node environment: the
 * window, its history and sessionStorage are stubbed, the start param step is the real
 * utils/startParam, everything else is a fake that logs its call (and the URL it saw).
 */

// Raw init data as Telegram sends it: every launch is signed anew (auth_date + hash).
function initData(hash: string): string {
  return `user=%7B%22id%22%3A1%7D&chat_type=sender&auth_date=1760000000&signature=sig-${hash}&hash=${hash}`;
}

interface Launch {
  startParam?: string;
  initData?: string;
}

// The launch params Telegram puts in the URL hash of a launch's first page load.
function launchHash({ startParam, initData: data }: Launch): string {
  const params = new URLSearchParams({ tgWebAppData: data ?? '', tgWebAppVersion: '8.0' });
  if (startParam) params.set('tgWebAppStartParam', startParam);
  return `#${params.toString()}`;
}

interface Page {
  location: { pathname: string; search: string; hash: string };
}

interface LoadOptions {
  /** Mobile clients: the WebView bridge marks every page load as Telegram. */
  bridge?: boolean;
  /** Some sandboxed WebViews refuse history writes. */
  replaceStateThrows?: boolean;
}

/**
 * A browser tab. Every load() is a full page load: a fresh window (no HMR flag yet) and
 * the tab's sessionStorage carried over, like a reload or a hard redirect.
 */
function openTab(log: string[]) {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });

  return {
    load(url: string, { bridge = false, replaceStateThrows = false }: LoadOptions = {}): Page {
      const start = new URL(url, 'https://cabinet.example');
      const location = { pathname: start.pathname, search: start.search, hash: start.hash };
      const history = {
        state: { idx: 0, key: 'k0' } as unknown,
        replaceState: (_state: unknown, _unused: string, target: string) => {
          if (replaceStateThrows) throw new DOMException('blocked', 'SecurityError');
          log.push(`replaceState ${target}`);
          const next = new URL(target, start);
          location.pathname = next.pathname;
          location.search = next.search;
          location.hash = next.hash;
        },
      };
      const win: Record<string, unknown> = { location, history };
      if (bridge) win.TelegramWebviewProxy = { postEvent: () => {} };
      vi.stubGlobal('window', win);
      return { location };
    },
  };
}

// The SDK hands the same launch params back on every page load of a launch.
function sdkFor(
  launch: Launch,
  log: string[],
  overrides: Partial<TelegramLaunchSdk> = {},
): TelegramLaunchSdk {
  return {
    init: () => log.push('init'),
    restoreInitData: () => log.push('restoreInitData'),
    retrieveLaunchParams: () => ({ tgWebAppStartParam: launch.startParam }),
    retrieveRawInitData: () => launch.initData,
    ...overrides,
  };
}

function depsFor(page: Page, sdk: TelegramLaunchSdk, log: string[]): AppBootstrapDeps {
  const url = () => page.location.pathname + page.location.search;
  return {
    sdk,
    clearStaleSessionIfNeeded: (fresh) => log.push(`clearStaleSession ${fresh}`),
    applyTelegramLanguage: () => log.push('applyTelegramLanguage'),
    mountTelegramUi: () => log.push('mountTelegramUi'),
    initializeAuth: async () => {
      log.push(`initializeAuth at ${url()}`);
    },
    startBackgroundTasks: () => log.push('startBackgroundTasks'),
    render: () => log.push(`render at ${url()}`),
  };
}

// Telegram setup of a page load that applies nothing, then the app at `url`.
function telegramLoadAt(url: string, data: string): string[] {
  return [
    'init',
    'restoreInitData',
    `clearStaleSession ${data}`,
    'applyTelegramLanguage',
    'mountTelegramUi',
    `initializeAuth at ${url}`,
    'startBackgroundTasks',
    `render at ${url}`,
  ];
}

const H1 = initData('h1');
const H2 = initData('h2');
const TASKS_H1: Launch = { startParam: 'tasks', initData: H1 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bootstrapApp inside Telegram', () => {
  it('a startapp deep link becomes the URL before the auth bootstrap and the first render', () => {
    const log: string[] = [];
    const page = openTab(log).load(`/${launchHash(TASKS_H1)}`);

    bootstrapApp(depsFor(page, sdkFor(TASKS_H1, log), log));

    expect(log).toEqual([
      'init',
      'restoreInitData',
      `clearStaleSession ${H1}`,
      'replaceState /tasks',
      'applyTelegramLanguage',
      'mountTelegramUi',
      'initializeAuth at /tasks',
      'startBackgroundTasks',
      'render at /tasks',
    ]);
    expect(page.location).toEqual({ pathname: '/tasks', search: '', hash: '' });
  });

  it('every supported param, e.g. a «Продлить» link, is applied the same way', () => {
    const log: string[] = [];
    const launch = { startParam: 'renew_7', initData: H1 };
    const page = openTab(log).load(`/${launchHash(launch)}`, { bridge: true });

    bootstrapApp(depsFor(page, sdkFor(launch, log), log));

    expect(log).toContain('initializeAuth at /subscriptions/7/renew');
    expect(log[log.length - 1]).toBe('render at /subscriptions/7/renew');
  });

  it('without a start param the order is the same and the URL stays', () => {
    const log: string[] = [];
    const launch = { initData: H1 };
    const page = openTab(log).load(`/balance${launchHash(launch)}`);

    bootstrapApp(depsFor(page, sdkFor(launch, log), log));

    expect(log).toEqual(telegramLoadAt('/balance', H1));
  });

  const failingStartParamSteps: Array<[string, LoadOptions, Partial<TelegramLaunchSdk>]> = [
    [
      'the launch params cannot be read',
      {},
      {
        retrieveLaunchParams: () => {
          throw new Error('LaunchParamsRetrieveError');
        },
      },
    ],
    ['the history write is refused', { replaceStateThrows: true }, {}],
  ];

  it.each(
    failingStartParamSteps,
  )('a failing start param step skips nothing else: %s', (_case, load, sdkOverrides) => {
    const log: string[] = [];
    const page = openTab(log).load(`/${launchHash(TASKS_H1)}`, load);

    expect(() =>
      bootstrapApp(depsFor(page, sdkFor(TASKS_H1, log, sdkOverrides), log)),
    ).not.toThrow();

    expect(log).toEqual(telegramLoadAt('/', H1));
  });

  it('a failing SDK init skips the rest of the Telegram setup, never the auth bootstrap or the render', () => {
    const log: string[] = [];
    const page = openTab(log).load(`/${launchHash(TASKS_H1)}`, { bridge: true });
    const sdk = sdkFor(TASKS_H1, log, {
      init: () => {
        throw new Error('init failed');
      },
    });

    expect(() => bootstrapApp(depsFor(page, sdk, log))).not.toThrow();

    expect(log).toEqual(['initializeAuth at /', 'startBackgroundTasks', 'render at /']);
  });

  it('once per launch, through the wiring: reloads of the launch keep the current page', () => {
    const log: string[] = [];
    const tab = openTab(log);

    let page = tab.load(`/${launchHash(TASKS_H1)}`, { bridge: true });
    bootstrapApp(depsFor(page, sdkFor(TASKS_H1, log), log));
    expect(page.location.pathname).toBe('/tasks');

    // A 401 hard-redirect to /login, then Telegram reloading the page after the user
    // moved on: the SDK hands the same launch back from its sessionStorage each time
    for (const url of ['/login', '/balance?tab=history']) {
      log.length = 0;
      page = tab.load(url, { bridge: true });
      bootstrapApp(depsFor(page, sdkFor(TASKS_H1, log), log));
      expect(log).toEqual(telegramLoadAt(url, H1));
    }

    // A new launch in the same tab applies its param again
    log.length = 0;
    const next = { startParam: 'tasks', initData: H2 };
    page = tab.load(`/balance${launchHash(next)}`, { bridge: true });
    bootstrapApp(depsFor(page, sdkFor(next, log), log));
    expect(log).toContain('replaceState /tasks');
    expect(log[log.length - 1]).toBe('render at /tasks');
  });

  it('HMR: a second run in the same window inits nothing again, but bootstraps auth and renders', () => {
    const log: string[] = [];
    // The bridge keeps the window recognisable as Telegram after the launch hash is gone
    const page = openTab(log).load(`/${launchHash(TASKS_H1)}`, { bridge: true });
    const deps = depsFor(page, sdkFor(TASKS_H1, log), log);
    bootstrapApp(deps);

    log.length = 0;
    page.location.pathname = '/balance';
    bootstrapApp(deps);

    expect(log).toEqual([
      'initializeAuth at /balance',
      'startBackgroundTasks',
      'render at /balance',
    ]);
  });

  it.each([
    ['the WebView bridge (mobile clients)', '/', true],
    ['launch params in the hash (Desktop, Web)', '/#tgWebAppData=x&tgWebAppVersion=8.0', false],
    ['launch params in the query', '/?tgWebAppData=x&tgWebAppVersion=8.0', false],
  ])('recognises Telegram by %s', (_case, url, bridge) => {
    const log: string[] = [];
    const page = openTab(log).load(url, { bridge });

    bootstrapApp(depsFor(page, sdkFor({ initData: H1 }, log), log));

    expect(log[0]).toBe('init');
  });
});

describe('bootstrapApp outside Telegram', () => {
  it('nothing Telegram runs and nothing is applied: the web cabinet keeps its URL', () => {
    const log: string[] = [];
    const page = openTab(log).load('/subscriptions?startapp=tasks');
    // A tripwire SDK: it would even have a param, but must not be asked at all
    const sdk: TelegramLaunchSdk = {
      init: () => log.push('sdk.init'),
      restoreInitData: () => log.push('sdk.restoreInitData'),
      retrieveLaunchParams: () => {
        log.push('sdk.retrieveLaunchParams');
        return { tgWebAppStartParam: 'tasks' };
      },
      retrieveRawInitData: () => {
        log.push('sdk.retrieveRawInitData');
        return H1;
      },
    };

    bootstrapApp(depsFor(page, sdk, log));

    expect(log).toEqual([
      'clearStaleSession null',
      'initializeAuth at /subscriptions?startapp=tasks',
      'startBackgroundTasks',
      'render at /subscriptions?startapp=tasks',
    ]);
  });
});

describe('wiring (merge guard)', () => {
  // This cabinet is merged by hand into a fork whose main.tsx still initialises the SDK
  // inline and whose AppWithNavigator still has a StartParamNavigator (it navigates to
  // the param after the first render, on every page load: the reload loop). Taking
  // either file back from there would undo the order tested above with every test in
  // this file still green.
  const SRC = fileURLToPath(new URL('./', import.meta.url));
  const read = (file: string) => readFileSync(join(SRC, file), 'utf8');

  // src-relative paths of the app's .ts/.tsx sources (tests left out)
  const sourcesIn = (dir: string): string[] =>
    readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return sourcesIn(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it('main.tsx starts the app through bootstrapApp, once', () => {
    expect(read('main.tsx').match(/\bbootstrapApp\(/g) ?? []).toHaveLength(1);
  });

  // main.tsx's code without comments (they mention init() and the like), split into the
  // object literal passed to bootstrapApp({ … }) and everything else
  function mainTsx(): { deps: string; rest: string } {
    const code = read('main.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const call = code.indexOf('bootstrapApp({');
    expect(call, 'main.tsx calls bootstrapApp({ … })').toBeGreaterThanOrEqual(0);
    const open = call + 'bootstrapApp('.length;
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) {
        return { deps: code.slice(open, i + 1), rest: code.slice(0, open) + code.slice(i + 1) };
      }
    }
    throw new Error('the bootstrapApp({ … }) object is not closed');
  }

  // The fork's main.tsx bootstraps auth with a module-level initialize() call. Kept next
  // to bootstrapApp by a merge, it bootstraps auth a second time (two refresh attempts at
  // once), and before init() and the start param when it comes first
  it('the auth bootstrap runs only as the initializeAuth dependency', () => {
    const { deps, rest } = mainTsx();
    expect(`${deps}${rest}`.match(/\.initialize\(/g) ?? []).toHaveLength(1);
    expect(deps).toMatch(
      /\binitializeAuth:\s*\(\)\s*=>\s*useAuthStore\.getState\(\)\.initialize\(\)\s*[,}]/,
    );
  });

  // The fork's main.tsx also runs init() and restoreInitData() inline, under the same HMR
  // flag: kept by a merge, the SDK is set up outside bootstrapApp's order, and the flag
  // it sets first makes bootstrapApp skip its Telegram setup, the start param included
  it('main.tsx never inits the SDK itself: init and restoreInitData only reach bootstrapApp', () => {
    const { deps, rest } = mainTsx();
    expect(deps).toMatch(
      /\bsdk:\s*\{\s*init,\s*restoreInitData,\s*retrieveLaunchParams,\s*retrieveRawInitData,?\s*\}/,
    );
    expect(`${deps}${rest}`).not.toMatch(
      /\b(init|restoreInitData|retrieveLaunchParams|retrieveRawInitData)\s*\(/,
    );
  });

  it('nothing but utils/startParam.ts and bootstrap.ts reads the start param', () => {
    const readers = sourcesIn('').filter((file) =>
      /tgWebAppStartParam|StartParamNavigator/.test(read(file)),
    );
    expect(readers.sort()).toEqual(['bootstrap.ts', 'utils/startParam.ts']);
  });
});
