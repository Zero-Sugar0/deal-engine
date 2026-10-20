import { createAuthClient } from 'better-auth/react';

const configuredApiUrl = import.meta.env.VITE_DEAL_API_URL?.trim();

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
