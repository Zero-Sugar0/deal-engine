import { CompactSign, compactVerify, importPKCS8, importSPKI } from 'jose';

export interface SkillSigningPayload {
  registryId: string;
  organizationId: string;
  name: string;
  version: string;
  contentHash: string;
  bundleHash: string;
  descriptor: unknown;
  manifest: unknown;
}

export interface SkillSignerOptions {
  privateKeyPem?: string;
  publicKeyPem?: string;
  keyId?: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalSigningPayload(payload: unknown): string {
  return JSON.stringify(canonicalize(payload));
}

function pem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

export function skillSignaturePayload(
  input: SkillSigningPayload,
): Record<string, unknown> {
  return {
    type: 'deal-skill-artifact',
    registryId: input.registryId,
    organizationId: input.organizationId,
    name: input.name,
    version: input.version,
    contentHash: input.contentHash,
    bundleHash: input.bundleHash,
    descriptor: input.descriptor,
    manifest: input.manifest,
  };
}

/** Ed25519 signer for registry attestations. It never loads or executes artifacts. */
export class SkillSigner {
  readonly keyId: string;
  readonly algorithm = 'EdDSA';
  readonly publicKeyPem?: string;
  private readonly privateKeyPem?: string;

  constructor(options: SkillSignerOptions = {}) {
    this.privateKeyPem = options.privateKeyPem?.trim() || undefined;
    this.publicKeyPem = options.publicKeyPem
      ? pem(options.publicKeyPem)
      : undefined;
    this.keyId = options.keyId?.trim() || 'deal-skill-key-1';
  }

  get configured(): boolean {
    return Boolean(this.privateKeyPem && this.publicKeyPem);
  }

  private async privateKey() {
    if (!this.privateKeyPem)
      throw new Error('Skill signing private key is not configured');
    return importPKCS8(pem(this.privateKeyPem), 'Ed25519');
  }

  private async publicKey(publicKeyPem = this.publicKeyPem) {
    if (!publicKeyPem)
      throw new Error('Skill signing public key is not configured');
    return importSPKI(publicKeyPem, 'Ed25519');
  }

  async sign(payload: SkillSigningPayload): Promise<string> {
    const body = canonicalSigningPayload(skillSignaturePayload(payload));
    return new CompactSign(new TextEncoder().encode(body))
      .setProtectedHeader({ alg: 'EdDSA', typ: 'DEAL-SKILL', kid: this.keyId })
      .sign(await this.privateKey());
  }

  async verify(
    signature: string,
    payload: SkillSigningPayload,
    options: { publicKeyPem?: string; keyId?: string } = {},
  ): Promise<boolean> {
    try {
      const verified = await compactVerify(
        signature,
        await this.publicKey(options.publicKeyPem),
      );
      const actual = new TextDecoder().decode(verified.payload);
      return (
        verified.protectedHeader.alg === 'EdDSA' &&
        verified.protectedHeader.typ === 'DEAL-SKILL' &&
        verified.protectedHeader.kid === (options.keyId ?? this.keyId) &&
        actual === canonicalSigningPayload(skillSignaturePayload(payload))
      );
    } catch {
      return false;
    }
  }
}
