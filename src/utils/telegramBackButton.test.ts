import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isBackButtonQueryEnabled } from './telegramBackButton';

describe('isBackButtonQueryEnabled', () => {
  it.each([
    [false, false, false],
    [false, true, false],
    // Inside Telegram before login: its 401 would hard-reload the Mini App to /login,
    // on every page load (the reload loop)
    [true, false, false],
    [true, true, true],
  ])('telegram=%s, authenticated=%s → %s', (isTelegram, isAuthenticated, enabled) => {
    expect(isBackButtonQueryEnabled({ isTelegram, isAuthenticated })).toBe(enabled);
  });
});

describe('wiring (merge guard)', () => {
  // This cabinet is merged by hand into a fork whose AppWithNavigator still fetches
  // with `enabled: isInTelegramWebApp()`: taking that file back would bring the reload
  // loop back with every unit test above still green.
  const source = readFileSync(new URL('../AppWithNavigator.tsx', import.meta.url), 'utf8');

  it("AppWithNavigator's subscriptions query is gated by isBackButtonQueryEnabled", () => {
    expect(source).toMatch(/enabled:\s*isBackButtonQueryEnabled\(/);
  });

  // A gate fed constants is no gate: `isAuthenticated: true` brings the reload loop back
  it("the gate gets the real flags: isInTelegramWebApp() and the auth store's isAuthenticated", () => {
    expect(source).toMatch(
      /enabled:\s*isBackButtonQueryEnabled\(\{\s*(isTelegram:\s*isInTelegramWebApp\(\),\s*isAuthenticated|isAuthenticated,\s*isTelegram:\s*isInTelegramWebApp\(\)),?\s*\}\)/,
    );
    expect(source.match(/\b(const|let|var)\s+isAuthenticated\b/g) ?? []).toHaveLength(1);
    expect(source).toMatch(
      /\bconst isAuthenticated = useAuthStore\(\((\w+)\) => \1\.isAuthenticated\);/,
    );
  });
});
