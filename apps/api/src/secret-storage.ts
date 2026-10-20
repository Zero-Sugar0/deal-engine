import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const algorithm = 'aes-256-gcm';

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/**
 * Encrypts a provider key for storage. The returned value contains no
 * plaintext and is safe to persist in the database, but it is still only
 * useful while the server's credential-encryption secret is available.
 */
export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(
    '.',
  );
}

export function decryptSecret(payload: string, secret: string): string {
  const [encodedIv, encodedTag, encodedCiphertext] = payload.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext)
    throw new Error('Encrypted credential has an invalid format');
  const decipher = createDecipheriv(
    algorithm,
    keyFromSecret(secret),
    decode(encodedIv),
  );
  decipher.setAuthTag(decode(encodedTag));
  return Buffer.concat([
    decipher.update(decode(encodedCiphertext)),
    decipher.final(),
  ]).toString('utf8');
}

export function credentialKeyHint(value: string): string {
  const suffix = value.slice(-4);
  return `••••${suffix}`;
}
