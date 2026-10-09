import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLaunchStartParam, launchIdOf, resolveStartParam } from './startParam';

const KEY = 'start_param_applied_launch';

// Raw init data as Telegram sends it: every launch is signed anew (auth_date + hash).
function initData(hash: string): string {
  return `user=%7B%22id%22%3A1%7D&chat_instance=-1&chat_type=sender&auth_date=1760000000&signature=sig-${hash}&hash=${hash}`;
}

interface FakeBrowser {
  store: Map<string, string>;
  replaceState: ReturnType<typeof vi.fn>;
  location: { pathname: string; search: string };
}

// The suite runs in a plain node environment: stub just the window.location,
// window.history and sessionStorage the helper touches. replaceState moves the
// fake location like a browser does.
function stubBrowser(path: string, storage: 'ok' | 'throws' = 'ok'): FakeBrowser {
  const [pathname, search = ''] = path.split(/(?=\?)/);
  const location = { pathname, search };
  const history = { state: { idx: 0, key: 'k0' } as unknown };
  const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
    const [nextPath, nextSearch = ''] = url.split(/(?=\?)/);
    location.pathname = nextPath;
    location.search = nextSearch;
  });
  vi.stubGlobal('window', { location, history: Object.assign(history, { replaceState }) });

  const store = new Map<string, string>();
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  vi.stubGlobal(
    'sessionStorage',
    storage === 'ok'
      ? {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
          removeItem: (key: string) => store.delete(key),
        }
      : { getItem: fail, setItem: fail, removeItem: fail },
  );
  return { store, replaceState, location };
}

// A full page load at `path` in the same tab: the location changes, sessionStorage stays.
function reloadAt(browser: FakeBrowser, path: string): void {
  const [pathname, search = ''] = path.split(/(?=\?)/);
  browser.location.pathname = pathname;
  browser.location.search = search;
}

describe('resolveStartParam', () => {
  it.each([
    ['admin_ticket_5', '/admin/tickets/5'],
    ['admin_ticket_123456', '/admin/tickets/123456'],
    ['renew_7', '/subscriptions/7/renew'],
    ['subscriptions', '/subscriptions'],
    ['trial', '/'],
    ['tasks', '/tasks'],
  ])('%s → %s', (param, target) => {
    expect(resolveStartParam(param)).toBe(target);
  });

  it.each([
    [undefined],
    [null],
    [''],
    ['unknown'],
    ['TASKS'],
    ['tasks2'],
    [' tasks'],
    ['tasks\n'],
    ['admin_ticket_'],
    ['admin_ticket_5x'],
    ['admin_ticket_5?x=1'],
    ['renew_'],
    ['renew_-1'],
    ['renew_7/../../admin'],
    ['//evil.com'],
    ['https://evil.com'],
  ])('unknown or garbage %j → null', (param) => {
    expect(resolveStartParam(param)).toBeNull();
  });
});

describe('launchIdOf', () => {
  it('uses the hash of the init data', () => {
    expect(launchIdOf(initData('abc'))).toBe('abc');
  });

  it('falls back to the signature, then to the whole raw string', () => {
    expect(launchIdOf('auth_date=1&signature=sig-1')).toBe('sig-1');
    expect(launchIdOf('auth_date=1&user=x')).toBe('auth_date=1&user=x');
  });

  it('has no id without init data', () => {
    expect(launchIdOf(undefined)).toBeNull();
    expect(launchIdOf(null)).toBeNull();
    expect(launchIdOf('')).toBeNull();
  });
});

describe('applyLaunchStartParam', () => {
  let browser: FakeBrowser;

  beforeEach(() => {
    browser = stubBrowser('/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes the target the current URL, keeping the history state', () => {
    expect(applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') })).toBe('/tasks');
    expect(browser.replaceState).toHaveBeenCalledTimes(1);
    expect(browser.replaceState).toHaveBeenCalledWith({ idx: 0, key: 'k0' }, '', '/tasks');
    expect(browser.location.pathname).toBe('/tasks');
    expect(browser.store.get(KEY)).toBe('h1');
  });

  it('maps every supported param to its page', () => {
    applyLaunchStartParam({ startParam: 'admin_ticket_5', initData: initData('h1') });
    expect(browser.location.pathname).toBe('/admin/tickets/5');
    applyLaunchStartParam({ startParam: 'renew_7', initData: initData('h2') });
    expect(browser.location.pathname).toBe('/subscriptions/7/renew');
  });

  it('applies once per launch: a reload of the same launch keeps the current page', () => {
    const launch = { startParam: 'tasks', initData: initData('h1') };
    expect(applyLaunchStartParam(launch)).toBe('/tasks');

    // 401 → safeRedirectToLogin() hard-reloads to /login; the SDK hands the same
    // launch params back from sessionStorage
    reloadAt(browser, '/login');
    expect(applyLaunchStartParam(launch)).toBeNull();
    expect(browser.location.pathname).toBe('/login');

    // The user moved on and Telegram reloads the page
    reloadAt(browser, '/balance?tab=history');
    expect(applyLaunchStartParam(launch)).toBeNull();
    expect(browser.location).toEqual({ pathname: '/balance', search: '?tab=history' });
    expect(browser.replaceState).toHaveBeenCalledTimes(1);
  });

  it('a new launch in the same tab applies its param again', () => {
    applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') });
    reloadAt(browser, '/balance');

    // Telegram Web/Desktop iframes can share sessionStorage between launches
    expect(applyLaunchStartParam({ startParam: 'tasks', initData: initData('h2') })).toBe('/tasks');
    expect(browser.location.pathname).toBe('/tasks');
    expect(browser.store.get(KEY)).toBe('h2');

    reloadAt(browser, '/');
    expect(applyLaunchStartParam({ startParam: 'subscriptions', initData: initData('h3') })).toBe(
      '/subscriptions',
    );
    expect(browser.location.pathname).toBe('/subscriptions');
  });

  it('already on the target: no history write, but the launch counts as applied', () => {
    reloadAt(browser, '/tasks');
    expect(applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') })).toBe('/tasks');
    expect(browser.replaceState).not.toHaveBeenCalled();

    reloadAt(browser, '/referral');
    expect(applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') })).toBeNull();
    expect(browser.location.pathname).toBe('/referral');
  });

  it('drops the query string of the launch URL, even on the target path', () => {
    reloadAt(browser, '/?tgWebAppStartParam=tasks');
    applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') });
    expect(browser.location).toEqual({ pathname: '/tasks', search: '' });

    reloadAt(browser, '/?tgWebAppStartParam=trial');
    expect(applyLaunchStartParam({ startParam: 'trial', initData: initData('h2') })).toBe('/');
    expect(browser.location).toEqual({ pathname: '/', search: '' });
    expect(browser.replaceState).toHaveBeenCalledTimes(2);
  });

  it('nothing happens without a start param or with an unknown one', () => {
    for (const startParam of [undefined, null, '', 'unknown', 'admin_ticket_x']) {
      expect(applyLaunchStartParam({ startParam, initData: initData('h1') })).toBeNull();
    }
    expect(browser.replaceState).not.toHaveBeenCalled();
    expect(browser.store.size).toBe(0);
    expect(browser.location.pathname).toBe('/');
  });

  it('storage throwing: still applies the param, without throwing', () => {
    browser = stubBrowser('/', 'throws');
    expect(() =>
      applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') }),
    ).not.toThrow();
    reloadAt(browser, '/');
    expect(applyLaunchStartParam({ startParam: 'tasks', initData: initData('h1') })).toBe('/tasks');
    expect(browser.location.pathname).toBe('/tasks');
  });

  it('without init data there is no launch id: applied best effort, nothing stored', () => {
    expect(applyLaunchStartParam({ startParam: 'tasks' })).toBe('/tasks');
    expect(browser.location.pathname).toBe('/tasks');
    expect(browser.store.size).toBe(0);
  });
});
