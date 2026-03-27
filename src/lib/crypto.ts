/**
 * Server-side AES-256-GCM encryption/decryption.
 * Uses ENCRYPTION_KEY from .env (NOT exposed to client).
 * Only import this in API routes / server code.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'launcherfuego-salt-v1';

function getKey(): Buffer {
  const passphrase = process.env.ENCRYPTION_KEY;
  if (!passphrase) throw new Error('ENCRYPTION_KEY not set in .env');
  return scryptSync(passphrase, SALT, 32);
}

export function encryptData(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptData(ciphertext: string): string {
  if (!ciphertext) return '';
  try {
    const key = getKey();
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    if (!ivHex || !authTagHex || !encrypted) return '';

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}
