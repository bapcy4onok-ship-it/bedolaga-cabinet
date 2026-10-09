function hasUnsafePathChar(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    // backslash, C0 controls (TAB/LF/CR among them), DEL
    if (code === 0x5c || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// The history API refuses a URL with an unpaired UTF-16 surrogate, even on our origin.
// (Not encodeURIComponent: installEncodingSurrogateGuard makes it lenient.)
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    }
  }
  return false;
}

// Any origin works as the base: all that matters is whether the result stays on it.
const PARSE_BASE = 'https://cabinet.invalid';

/**
 * Normalise a user-supplied redirect / returnTo URL down to a safe in-app path.
 *
 * Returns the input unchanged when it is a plain absolute path (`/foo/bar`).
 * Returns `/` otherwise — for protocol-relative URLs (`//evil.com`), absolute
 * URLs (`https://…`), exotic schemes (`javascript:`, `data:`), or anything
 * that smuggles a host through URL encoding (`%2F%2Fevil.com`).
 *
 * Even with react-router's navigate() — which only treats inputs as paths
 * and won't trigger an external nav — pasted absolute URLs would still
 * produce ugly path artifacts. Centralising the check matches what
 * TelegramRedirect already did and gives every returnTo entry the same
 * shape.
 *
 * Not quite "only paths", though: browsers read `\` as `/` and drop TAB/LF/CR
 * while parsing, so `/\evil.com` resolves to another origin, and react-router's
 * push() falls back to location.assign() when pushState refuses it. Those
 * characters are rejected outright, and the final word goes to the same URL
 * parser the browser uses.
 */
export function getSafeRedirectPath(url: string | null | undefined): string {
  if (!url || hasLoneSurrogate(url)) return '/';
  // The query and hash may carry anything (URLs, stray '%'); only the path decides
  // where the browser goes.
  const path = url.split(/[?#]/, 1)[0];
  // Only allow relative paths starting with /
  if (!path.startsWith('/') || path.startsWith('//') || hasUnsafePathChar(path)) {
    return '/';
  }
  // Catch the encoded forms (//evil.com → %2F%2Fevil.com, scheme://…)
  try {
    const decoded = decodeURIComponent(path);
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.includes('://') ||
      hasUnsafePathChar(decoded)
    ) {
      return '/';
    }
  } catch {
    return '/';
  }
  try {
    if (new URL(url, PARSE_BASE).origin !== PARSE_BASE) return '/';
  } catch {
    return '/';
  }
  return url;
}
