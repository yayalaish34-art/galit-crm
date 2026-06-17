import * as crypto from 'crypto';

// ── AES-256-CBC encryption helpers (shared) ──
// Used for SMTP passwords and Microsoft Graph refresh tokens.
const ENC_ALGO = 'aes-256-cbc';

function getEncKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'change-me-now';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENC_ALGO, getEncKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptSecret(encoded: string): string {
  const [ivHex, encHex] = encoded.split(':');
  if (!ivHex || !encHex) return '';
  const decipher = crypto.createDecipheriv(ENC_ALGO, getEncKey(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}
