import crypto from 'node:crypto';
import { config } from '../config';

// AES-256-GCM لتشفير أسرار العملاء (توكن Meta API + مفاتيح OpenAI) أثناء التخزين.
// المفتاح مشتق من SECRET_KEY (مستقل عن JWT) — يُحفظ في .env فقط ولا يُشارك أبدًا.
const key = crypto.createHash('sha256').update(config.secretKey).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !encB64) throw new Error('تنسيق سر مشفر غير صالح');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
}
