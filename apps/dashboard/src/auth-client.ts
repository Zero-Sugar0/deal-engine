import { createAuthClient } from 'better-auth/react';

const configuredApiUrl = import.meta.env.VITE_DEAL_API_URL?.trim();
const sessionTokenKey = 'deal.better-auth.session-token';

// Production uses same-origin rewrites so Better Auth cookies belong to the
// dashboard domain. The override remains useful for local development and
// self-hosted deployments with their own proxy.
export const dealApiUrl = (
  import.meta.env.PROD
    ? window.location.origin
    : configuredApiUrl || 'https://deal-engine.up.railway.app'
).replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: dealApiUrl,
  fetchOptions: { credentials: 'include' },
});

// Direct API deployments can be on a different origin from the dashboard.
// Better Auth cookies remain the primary session mechanism; this short-lived
// browser-session fallback carries the token returned by sign-in/sign-up so
// the DEAL API can still authenticate the next request when cross-site cookie
// delivery is unavailable.
export function getDealSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(sessionTokenKey);
  } catch {
    return null;
  }
}

export function setDealSessionToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(sessionTokenKey, token);
    else window.sessionStorage.removeItem(sessionTokenKey);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
