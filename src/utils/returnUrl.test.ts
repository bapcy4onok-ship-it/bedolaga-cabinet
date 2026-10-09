import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReturnUrl, resolveReturnUrl, saveReturnUrl } from './returnUrl';

const KEY = 'auth_return_url';

// The suite runs in a plain node environment: stub just the window.location and
// sessionStorage that the helpers touch.
function stubBrowser(path: string, store = new Map<string, string>()) {
  const [pathname, search = ''] = path.split(/(?=\?)/);
  vi.stubGlobal('window', { location: { pathname, search } });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

describe('return URL after login', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubBrowser('/balance?from=post');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('saveReturnUrl', () => {
    it('saves the current URL with its query string by default', () => {
      saveReturnUrl();
      expect(store.get(KEY)).toBe('/balance?from=post');
    });

    it('saves an explicit path', () => {
      saveReturnUrl('/admin/tickets?status=open');
      expect(store.get(KEY)).toBe('/admin/tickets?status=open');
    });

    it('bouncing from the home page forgets a stale target', () => {
      store.set(KEY, '/referral');
      saveReturnUrl('/');
      expect(store.has(KEY)).toBe(false);
    });

    it('keeps the saved target when called on /login (guard re-render mid-redirect)', () => {
      store.set(KEY, '/referral');
      stubBrowser('/login', store);
      saveReturnUrl();
      saveReturnUrl('/LOGIN/');
      saveReturnUrl('/./login');
      saveReturnUrl('/auth/oauth/callback?code=x');
      expect(store.get(KEY)).toBe('/referral');
    });

    it('stores the target behind /tg instead of /tg itself', () => {
      saveReturnUrl('/tg?redirect=%2Fbalance%3Ffrom%3Dpost');
      expect(store.get(KEY)).toBe('/balance?from=post');
    });

    it('a /tg link without a target forgets a stale one', () => {
      store.set(KEY, '/referral');
      saveReturnUrl('/tg');
      expect(store.has(KEY)).toBe(false);
    });

    it('never stores an off-site URL', () => {
      saveReturnUrl('//evil.com');
      saveReturnUrl('/\\evil.com');
      saveReturnUrl('/\t/evil.com');
      saveReturnUrl('/tg?redirect=/%5Cevil.com');
      expect(store.has(KEY)).toBe(false);
    });
  });

  describe('resolveReturnUrl', () => {
    it('prefers router state over the saved URL', () => {
      store.set(KEY, '/referral');
      expect(resolveReturnUrl('/admin/tickets?status=open')).toBe('/admin/tickets?status=open');
    });

    it('uses the saved URL only when there is no router state', () => {
      store.set(KEY, '/referral');
      for (const from of [undefined, null, '']) {
        expect(resolveReturnUrl(from)).toBe('/referral');
      }
    });

    it('router state is final even when it leads home', () => {
      store.set(KEY, '/referral');
      for (const from of ['/', '/login', '/Login/', '/login?ref=abc', '/\\evil.com']) {
        expect(resolveReturnUrl(from)).toBe('/');
      }
    });

    it('defaults to the home page', () => {
      expect(resolveReturnUrl()).toBe('/');
    });

    it('does not consume the saved URL, so every login path gets the same target', () => {
      store.set(KEY, '/referral');
      expect(resolveReturnUrl()).toBe('/referral');
      expect(resolveReturnUrl()).toBe('/referral');
      expect(store.get(KEY)).toBe('/referral');
    });

    it('never returns to an auth entry point or a one-time-token page', () => {
      for (const from of [
        '/auth/oauth/callback?code=x',
        '/auth/telegram/callback',
        '/auto-login?token=t',
        '/verify-email?token=t',
        '/reset-password?token=t',
      ]) {
        expect(resolveReturnUrl(from)).toBe('/');
      }
    });

    it('recognises /login however react-router would spell it', () => {
      for (const from of [
        '/./login',
        '/%6Cogin',
        '/%2e/login',
        '/balance/../login',
        '/LOGIN//',
        '/./auto-login?token=t',
        '/x//../login',
        '/a/b//../../login',
        '/x//%2e%2e/login',
        '/x//../LOGIN/',
      ]) {
        expect(resolveReturnUrl(from)).toBe('/');
      }
    });

    it('returns to the Telegram link callback, which completes after login', () => {
      expect(resolveReturnUrl('/auth/link/telegram/callback?csrf_state=s&id=1')).toBe(
        '/auth/link/telegram/callback?csrf_state=s&id=1',
      );
    });

    it('goes straight to the target behind /tg and /auth/telegram', () => {
      expect(resolveReturnUrl('/tg?redirect=%2Freferral')).toBe('/referral');
      expect(resolveReturnUrl('/auth/telegram?redirect=/referral')).toBe('/referral');
      expect(resolveReturnUrl('/TG//?redirect=/referral')).toBe('/referral');
      expect(resolveReturnUrl('/%74g?redirect=%2Freferral')).toBe('/referral');
      expect(resolveReturnUrl('/tg?redirect=%2Ftg%3Fredirect%3D%252Freferral')).toBe('/referral');
      expect(resolveReturnUrl('/.//tg?redirect=%2Freferral')).toBe('/referral');
      expect(resolveReturnUrl('/tg')).toBe('/');
      expect(resolveReturnUrl('/tg?redirect=/login')).toBe('/');
      expect(resolveReturnUrl('/tg?redirect=/login%20')).toBe('/');
    });

    it('returns the path navigate() will actually land on', () => {
      expect(resolveReturnUrl('/./balance?from=post')).toBe('/balance?from=post');
      expect(resolveReturnUrl('/x//../balance')).toBe('/balance');
    });

    it('never returns an off-site URL, from router state or storage', () => {
      for (const evil of [
        '//evil.com',
        'https://evil.com/path',
        '/\\evil.com',
        '/\t/evil.com',
        '/tg?redirect=/%5Cevil.com',
      ]) {
        store.set(KEY, evil);
        expect(resolveReturnUrl(evil)).toBe('/');
      }
    });

    it('keeps URLs in the query string', () => {
      expect(resolveReturnUrl('/subscriptions/5?utm_referrer=https://t.me/x')).toBe(
        '/subscriptions/5?utm_referrer=https://t.me/x',
      );
    });

    it('returns the home page instead of throwing when storage is unavailable', () => {
      vi.stubGlobal('sessionStorage', {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      });
      expect(resolveReturnUrl()).toBe('/');
      expect(resolveReturnUrl('/referral')).toBe('/referral');
      expect(() => saveReturnUrl()).not.toThrow();
      expect(() => clearReturnUrl()).not.toThrow();
    });
  });

  it('clearReturnUrl forgets the target', () => {
    store.set(KEY, '/referral');
    clearReturnUrl();
    expect(store.has(KEY)).toBe(false);
    expect(resolveReturnUrl()).toBe('/');
  });
});
