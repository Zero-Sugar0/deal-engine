import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface ExternalPrincipal {
  issuer: string;
  subject: string;
  email?: string;
  claims: Record<string, unknown>;
}

export interface ExternalAuthProvider {
  verify(token: string): Promise<ExternalPrincipal>;
}

export interface JwtExternalAuthOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  algorithms?: string[];
}

export class JwtExternalAuthProvider implements ExternalAuthProvider {
  private readonly keys;

  constructor(private readonly options: JwtExternalAuthOptions) {
    this.keys = createRemoteJWKSet(new URL(options.jwksUrl));
  }

  async verify(token: string): Promise<ExternalPrincipal> {
    const verified = await jwtVerify(token, this.keys, {
      issuer: this.options.issuer,
      audience: this.options.audience,
      algorithms: this.options.algorithms ?? ['RS256'],
    });
    const payload = verified.payload as JWTPayload & { email?: unknown };
    if (!payload.sub || !payload.iss)
      throw new Error('External token is missing subject or issuer');
    return {
      issuer: payload.iss,
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      claims: payload as Record<string, unknown>,
    };
  }
}

export function externalAuthFromEnvironment():
  ExternalAuthProvider | undefined {
  const issuer = process.env.DEAL_AUTH_ISSUER;
  const audience = process.env.DEAL_AUTH_AUDIENCE;
  const jwksUrl = process.env.DEAL_AUTH_JWKS_URL;
  if (!issuer && !audience && !jwksUrl) return undefined;
  if (!issuer || !audience || !jwksUrl)
    throw new Error(
      'DEAL_AUTH_ISSUER, DEAL_AUTH_AUDIENCE, and DEAL_AUTH_JWKS_URL must be configured together',
    );
  return new JwtExternalAuthProvider({
    issuer,
    audience,
    jwksUrl,
    algorithms: (process.env.DEAL_AUTH_ALGORITHMS ?? 'RS256')
      .split(',')
      .filter(Boolean),
  });
}
