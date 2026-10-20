import { createAuthClient } from 'better-auth/react';

export const dealApiUrl = (
  import.meta.env.VITE_DEAL_API_URL || 'https://deal-engine.up.railway.app'
).replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: dealApiUrl,
  fetchOptions: { credentials: 'include' },
});
