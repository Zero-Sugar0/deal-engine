import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import type { Auth, BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.BETTER_AUTH_SECRET;

if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error(
    'BETTER_AUTH_SECRET must be configured with at least 32 characters in production',
  );
}

const authSecret =
  configuredSecret ?? 'local-better-auth-secret-change-me-32-characters';
const baseURL =
  process.env.BETTER_AUTH_URL ||
  process.env.DEAL_API_URL ||
  `http://localhost:${process.env.DEAL_PORT ?? '3000'}`;

function configuredOrigins(): string[] {
  const dashboardOrigins = (process.env.DEAL_DASHBOARD_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [
    baseURL,
    ...dashboardOrigins,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ].filter((origin): origin is string => Boolean(origin && origin !== '*'));
}

export const betterAuthIssuer = 'better-auth';

type DealAuthOptions = BetterAuthOptions & {
  defaultCookieAttributes: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'none';
  };
};

export function createDealAuth(pool: Pool): Auth<DealAuthOptions> {
  const options: DealAuthOptions = {
    appName: 'deal',
    database: pool,
    baseURL,
    basePath: '/api/auth',
    secret: authSecret,
    trustedOrigins: configuredOrigins(),
    plugins: [
      dash({
        apiUrl: process.env.BETTER_AUTH_API_URL,
        kvUrl: process.env.BETTER_AUTH_KV_URL,
        apiKey: process.env.BETTER_AUTH_API_KEY,
      }),
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification:
        process.env.DEAL_AUTH_REQUIRE_EMAIL_VERIFICATION === 'true',
    },
    advanced: {
      useSecureCookies: isProduction,
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    },
  };

  return betterAuth(options);
}

export type DealAuth = ReturnType<typeof createDealAuth>;
