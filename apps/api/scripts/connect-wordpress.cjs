/**
 * חיבור חד-פעמי של האתר (וורדפרס) ל-CRM: כותב את פרטי הגישה לטבלת SystemSetting
 * תחת המפתח 'wordpress', בדיוק במבנה ש-BlogService.getCredentials קורא.
 *
 * הסיסמה מוצפנת עם אותו AES-256-CBC של common/crypto.util (מפתח = sha256 של JWT_SECRET),
 * ולכן חייבים להריץ עם משתני הסביבה של הפרודקשן:
 *
 *   cd apps/api && WP_APP_PASSWORD='...' npx railway run node scripts/connect-wordpress.cjs
 *
 * הסיסמה מגיעה מ-WP_APP_PASSWORD בלבד — לא נשמרת בקוד.
 */
const crypto = require('crypto');
const { Client } = require('pg');

const SITE_URL = process.env.WP_SITE_URL || 'https://galit.co.il';
const USERNAME = process.env.WP_USERNAME || 'admin_haim';
const CATEGORY_ID = Number(process.env.WP_CATEGORY_ID || 226);
const APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

function encryptSecret(plain) {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'change-me-now').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

(async () => {
  if (!APP_PASSWORD) throw new Error('WP_APP_PASSWORD is required');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing — run via `railway run`');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing — run via `railway run`');

  const value = {
    siteUrl: SITE_URL.replace(/\/$/, ''),
    username: USERNAME,
    appPasswordEnc: encryptSecret(APP_PASSWORD),
    categoryId: CATEGORY_ID,
  };

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(
    `INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
     VALUES ($1, $2, now(), now())
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()`,
    ['wordpress', JSON.stringify(value)],
  );
  const check = await client.query(`SELECT "key", "updatedAt" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();

  console.log('saved:', check.rows[0]);
  console.log('site:', value.siteUrl, '| user:', value.username, '| category:', value.categoryId);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
