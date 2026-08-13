/**
 * מסיר את "מילון מונחים" מעמודי השירות הבודדים — המילון אמור להופיע רק
 * בעמודי הקטגוריה הכלליים (ראו move-glossary-below-blog.cjs).
 *
 *   cd apps/api
 *   DRY_RUN=1 npx railway run node scripts/remove-glossary-from-service-pages.cjs
 *   npx railway run node scripts/remove-glossary-from-service-pages.cjs
 *
 * מטפל בשני המקומות שבהם מילון יכול לשבת:
 *   • post_content — הבלוק ‎<section class="galit-gloss">…</section>‎
 *   • _elementor_data — סקשן שמכיל ווידג'ט HTML עם galit-gloss
 *
 * עמודי הקטגוריה (KEEP_PAGES) מדולגים תמיד. לפני כל כתיבה נשמר גיבוי מלא של
 * התוכן/הנתונים המקוריים ל-BACKUP_FILE, כך שההסרה הפיכה.
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const DRY_RUN = process.env.DRY_RUN === '1';
const BACKUP_FILE = process.env.BACKUP_FILE || 'glossary-removal-backup.json';
/** עמודי הקטגוריה הכלליים — אלה היחידים שבהם המילון נשאר. */
const KEEP_PAGES = new Set([3723, 3725, 3727, 3729, 3731, 3733, 3735, 3737, 3739, 3741]);
/**
 * מתחת לכמות התווים הזו התוכן שנשאר אחרי ההסרה נחשב "ריק". יש עמודים
 * (למשל 6540/6544) שכל התוכן שלהם *הוא* המילון — הסרה שם משאירה עמוד לבן
 * באוויר, ולכן הם מדולגים ומדווחים במקום להתרוקן.
 */
const MIN_REMAINING_CHARS = 200;

function decryptSecret(encoded) {
  const [ivHex, encHex] = String(encoded).split(':');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

async function wpCreds() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();
  const v = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  return {
    siteUrl: String(v.siteUrl).replace(/\/$/, ''),
    auth: 'Basic ' + Buffer.from(`${v.username}:${decryptSecret(v.appPasswordEnc)}`).toString('base64'),
  };
}

async function wp(creds, path, init) {
  const res = await fetch(`${creds.siteUrl}/wp-json${path}`, {
    ...init,
    headers: { Authorization: creds.auth, 'Content-Type': 'application/json; charset=utf-8', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  if (!res.ok) throw new Error(`WP ${res.status} on ${path}: ${(data && data.message) || text.slice(0, 200)}`);
  return data;
}

/**
 * חותך את בלוק המילון מתוך HTML. סופר תגיות section מקוננות במקום לחתוך עד
 * סוף המחרוזת, כדי שתוכן שנוסף *אחרי* המילון (אם יש) לא ייעלם איתו.
 */
function stripGlossaryBlock(html) {
  const start = html.indexOf('<section class="galit-gloss"');
  if (start < 0) return { changed: false, html };
  const open = /<\s*section\b/gi;
  const close = /<\s*\/\s*section\s*>/gi;
  let depth = 0;
  let pos = start;
  let end = -1;
  while (pos < html.length) {
    open.lastIndex = pos;
    close.lastIndex = pos;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) break;
    if (o && o.index < c.index) { depth++; pos = o.index + o[0].length; continue; }
    depth--;
    pos = c.index + c[0].length;
    if (depth === 0) { end = pos; break; }
  }
  if (end < 0) return { changed: false, html, error: 'unbalanced <section>' };
  const cleaned = (html.slice(0, start) + html.slice(end)).replace(/\s+$/, '');
  return { changed: true, html: cleaned };
}

const sectionHasGlossary = (section) => {
  let found = false;
  (function walk(els) {
    for (const el of els || []) {
      if (el.widgetType === 'html' && /galit-gloss/.test((el.settings && el.settings.html) || '')) found = true;
      if (Array.isArray(el.elements)) walk(el.elements);
    }
  })([section]);
  return found;
};

(async () => {
  const creds = await wpCreds();
  const backup = {};
  let scanned = 0, hits = 0, written = 0;

  let pageNum = 1;
  const targets = [];
  for (;;) {
    const batch = await wp(creds, `/wp/v2/pages?context=edit&per_page=100&page=${pageNum}&status=publish,draft,private,pending`);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const p of batch) {
      scanned++;
      const raw = (p.content && p.content.raw) || '';
      const elem = (p.meta && p.meta._elementor_data) || '';
      const inContent = raw.includes('galit-gloss');
      const inElementor = elem.includes('galit-gloss');
      if (!inContent && !inElementor) continue;
      hits++;
      if (KEEP_PAGES.has(p.id)) continue;
      targets.push({ id: p.id, title: String(p.title.raw || '').trim(), link: decodeURIComponent(p.link), raw, elem, inContent, inElementor });
    }
    if (batch.length < 100) break;
    pageNum++;
  }

  console.log(`scanned ${scanned} pages · ${hits} have a glossary · ${targets.length} to clean (category pages kept)\n`);

  const wouldEmpty = [];

  for (const t of targets) {
    const changes = {};
    let note = [];

    if (t.inContent) {
      const r = stripGlossaryBlock(t.raw);
      if (r.error) {
        console.log(`WARN  [${t.id}] ${t.title} — ${r.error}, skipped content`);
      } else if (r.changed) {
        const remaining = r.html.replace(/<[^>]+>/g, '').trim().length;
        if (remaining < MIN_REMAINING_CHARS && !t.inElementor) {
          // כל התוכן של העמוד הוא המילון — הסרה תשאיר עמוד ריק באוויר.
          wouldEmpty.push({ ...t, remaining });
          console.log(`HOLD  [${t.id}] ${t.title} — content is glossary-only (${remaining} chars would remain) — SKIPPED`);
          continue;
        }
        changes.content = r.html;
        note.push(`content ${t.raw.length}→${r.html.length}`);
      }
    }

    if (t.inElementor) {
      const tree = JSON.parse(t.elem);
      const kept = tree.filter((s) => !sectionHasGlossary(s));
      if (kept.length !== tree.length) {
        changes.meta = { _elementor_data: JSON.stringify(kept) };
        note.push(`elementor ${tree.length}→${kept.length} sections`);
      }
    }

    if (!Object.keys(changes).length) { console.log(`SKIP  [${t.id}] ${t.title} — nothing removable`); continue; }

    console.log(`CLEAN [${t.id}] ${t.title} — ${note.join(', ')}`);
    backup[t.id] = { title: t.title, link: t.link, content: t.inContent ? t.raw : null, elementorData: t.inElementor ? t.elem : null };

    if (!DRY_RUN) {
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8');
      await wp(creds, `/wp/v2/pages/${t.id}`, { method: 'POST', body: JSON.stringify(changes) });
      written++;
    }
  }

  if (wouldEmpty.length) {
    console.log(`\n⚠ ${wouldEmpty.length} page(s) skipped — the glossary IS their entire content, removing it leaves a blank page:`);
    for (const t of wouldEmpty) console.log(`   [${t.id}] ${t.title}\n       ${t.link}`);
  }

  if (DRY_RUN) console.log(`\nDRY_RUN — nothing written (${targets.length - wouldEmpty.length} pages would be cleaned).`);
  else console.log(`\ncleaned ${written} pages · backup written to ${BACKUP_FILE}`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
