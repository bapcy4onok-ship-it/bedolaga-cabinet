import { describe, expect, it } from 'vitest';
import { getSafeRedirectPath } from './safeRedirect';

describe('getSafeRedirectPath', () => {
  it('returns / for empty values', () => {
    expect(getSafeRedirectPath(null)).toBe('/');
    expect(getSafeRedirectPath(undefined)).toBe('/');
    expect(getSafeRedirectPath('')).toBe('/');
  });

  it('keeps plain absolute in-app paths', () => {
    expect(getSafeRedirectPath('/')).toBe('/');
    expect(getSafeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(getSafeRedirectPath('/sub/page?tab=devices&x=1')).toBe('/sub/page?tab=devices&x=1');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(getSafeRedirectPath('//evil.com')).toBe('/');
    expect(getSafeRedirectPath('https://evil.com/path')).toBe('/');
    expect(getSafeRedirectPath('http://evil.com')).toBe('/');
  });

  it('rejects non-path schemes', () => {
    expect(getSafeRedirectPath('javascript:alert(1)')).toBe('/');
    expect(getSafeRedirectPath('data:text/html,x')).toBe('/');
  });

  it('rejects URL-encoded host smuggling', () => {
    expect(getSafeRedirectPath('%2F%2Fevil.com')).toBe('/');
    expect(getSafeRedirectPath('/redirect%3A%2F%2Fevil.com')).toBe('/');
  });

  it('rejects malformed percent-encoding instead of throwing', () => {
    expect(getSafeRedirectPath('/%E0%A4%A')).toBe('/');
  });

  it('rejects backslash and TAB/LF/CR forms that browsers resolve off-site', () => {
    expect(getSafeRedirectPath('/\\evil.com')).toBe('/');
    expect(getSafeRedirectPath('/\\/evil.com')).toBe('/');
    expect(getSafeRedirectPath('/\t/evil.com')).toBe('/');
    expect(getSafeRedirectPath('/\n/evil.com')).toBe('/');
    expect(getSafeRedirectPath('/\r/evil.com')).toBe('/');
    expect(getSafeRedirectPath('/%5C%5Cevil.com')).toBe('/');
    expect(getSafeRedirectPath('/%09/evil.com')).toBe('/');
  });

  it('rejects unpaired UTF-16 surrogates, which the history API refuses', () => {
    expect(getSafeRedirectPath('/\uDC00')).toBe('/');
    expect(getSafeRedirectPath('/"\uD800')).toBe('/');
    expect(getSafeRedirectPath('/news?q=\uD800x')).toBe('/');
    expect(getSafeRedirectPath('/news/\uD83D\uDE00')).toBe('/news/\uD83D\uDE00');
  });

  it('keeps URLs and stray percent signs in the query string', () => {
    expect(getSafeRedirectPath('/subscriptions/5?utm_referrer=https://t.me/x')).toBe(
      '/subscriptions/5?utm_referrer=https://t.me/x',
    );
    expect(getSafeRedirectPath('/balance/top-up/result?ret=https%3A%2F%2Fpsp.example')).toBe(
      '/balance/top-up/result?ret=https%3A%2F%2Fpsp.example',
    );
    expect(getSafeRedirectPath('/balance?code=AB%')).toBe('/balance?code=AB%');
  });
});
