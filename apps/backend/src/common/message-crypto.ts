import * as crypto from 'crypto';

/**
 * Transparent at-rest encryption for chat message content.
 *
 * The backend encrypts `messages.content` before writing to the database and
 * decrypts it when reading, so both the web and desktop clients keep sending
 * and receiving plaintext while the stored column never holds readable text.
 *
 * Envelope format: `enc:v1:<base64 iv>:<base64 auth tag>:<base64 ciphertext>`
 * (AES-256-GCM). Legacy plaintext rows are returned untouched so existing data
 * keeps working; they are encrypted again the next time they are written.
 */

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;
let warnedAboutFallback = false;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (raw) {
    let key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      const hexKey = Buffer.from(raw, 'hex');
      if (hexKey.length === 32) key = hexKey;
    }
    if (key.length !== 32) {
      // Accept any passphrase by deriving a 32-byte key from it.
      key = crypto.createHash('sha256').update(raw).digest();
    }
    cachedKey = key;
    return cachedKey;
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      '[message-crypto] MESSAGE_ENCRYPTION_KEY is not set. Deriving an encryption key ' +
        'from JWT_SECRET for development. Set MESSAGE_ENCRYPTION_KEY in production and ' +
        'keep it backed up — losing it makes encrypted messages unrecoverable.',
    );
  }

  const fallback = process.env.JWT_SECRET || 'synch-cc-insecure-dev-crypto-key';
  cachedKey = crypto.createHash('sha256').update(fallback).digest();
  return cachedKey;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptContent(plain: string | null | undefined): string | null | undefined {
  if (plain === null || plain === undefined) return plain;
  if (isEncrypted(plain)) return plain;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv, tag, ciphertext].map((part) => part.toString('base64')).join(':')
  );
}

export function decryptContent(stored: string | null | undefined): string | null | undefined {
  if (stored === null || stored === undefined) return stored;
  if (!isEncrypted(stored)) return stored;

  try {
    const parts = stored.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return stored;

    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  } catch (error) {
    console.error('[message-crypto] Failed to decrypt message content:', error);
    return stored;
  }
}
