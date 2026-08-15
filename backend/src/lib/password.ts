import crypto from 'node:crypto';

const KEYLEN = 64;

/**
 * تجزئة كلمة مرور عبر scrypt (مدمج في Node — لا اعتماديات خارجية).
 * الصيغة المخزنة: scrypt$<salt-hex>$<derived-hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await derive(password, salt);
  return `scrypt$${salt}$${derived}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const derived = await derive(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function derive(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}
