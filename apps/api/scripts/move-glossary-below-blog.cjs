/**
 * מעביר את סקשן "מילון מונחים" בעמודי הקטגוריה כך שיישב **מתחת לסקשן הבלוג**.
 *
 *   cd apps/api
 *   DRY_RUN=1 npx railway run node scripts/move-glossary-below-blog.cjs   # תצוגה מקדימה
 *   npx railway run node scripts/move-glossary-below-blog.cjs             # כתיבה לאתר
 *
 * עמודי הקטגוריה בנויים ב-Elementor, ולכן התוכן שלהם לא יושב ב-post_content
 * אלא במטא `_elementor_data` (מערך JSON של סקשנים). הסקריפט מזיז את הסקשן
 * שמכיל את ווידג'ט ה-HTML של המילון אל אחרי סקשן הבלוג — בלי לגעת בתוכן,
 * בעיצוב או במזהי האלמנטים, כך שה-CSS הקיים של Elementor נשאר תקף.
 *
 * אידמפוטנטי: עמוד שבו המילון כבר יושב מיד אחרי הבלוג מדולג.
 * גיבוי: לפני כל כתיבה נשמר ה-`_elementor_data` המקורי ל-BACKUP_FILE.
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const DRY_RUN = process.env.DRY_RUN === '1';
const BACKUP_FILE = process.env.BACKUP_FILE || 'glossary-move-backup.json';

/**
 * עמודי הקטגוריה, ואיזה סקשן נחשב "סוף אזור הבלוג" בכל אחד.
 * `blogAfterHeading` — הכותרת שמזהה את סקשן הבלוג. `extraTrailingSections` —
 * כמה סקשנים נוספים אחריו שייכים לאותו אזור (בבנייה ירוקה ווידג'ט הפוסטים
 * יושב בסקשן נפרד אחרי הכותרת, ולכן המילון צריך לרדת מתחת לשניהם).
 */
const PAGES = [
  { id: 3723, label: 'בנייה ירוקה', extraTrailingSections: 1 },
  { id: 3725, label: 'ריח' },
  { id: 3727, label: 'קרינה' },
  { id: 3729, label: 'הדברה' },
  { id: 3731, label: 'ראדון' },
  { id: 3733, label: 'רעש' },
  { id: 3735, label: 'קרקע' },
  { id: 3737, label: 'מים' },
  { id: 3739, label: 'אויר' },
  { id: 3741, label: 'אסבסט' },
];

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
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`WP ${res.status} on ${path}: ${(data && data.message) || text.slice(0, 200)}`);
  return data;
}

/** מריץ fn על כל אלמנט בעץ (סקשנים, עמודות, ווידג'טים). */
function walk(els, fn) {
  for (const el of els || []) {
    fn(el);
    if (Array.isArray(el.elements)) walk(el.elements, fn);
  }
}

const hasGlossary = (section) => {
  let found = false;
  walk([section], (el) => {
    if (el.widgetType === 'html' && /galit-gloss/.test((el.settings && el.settings.html) || '')) found = true;
  });
  return found;
};

/** סקשן הבלוג = עוגן #blog, אחרת הסקשן האחרון שכותרתו מכילה "בלוג". */
function findBlogIndex(tree) {
  let byHeading = -1;
  tree.forEach((s, i) => {
    if (s.settings && s.settings._element_id === 'blog') byHeading = i;
  });
  if (byHeading >= 0) return byHeading;
  tree.forEach((s, i) => {
    let isBlog = false;
    walk([s], (el) => {
      if (el.widgetType === 'heading' && /בלוג/.test(String((el.settings && el.settings.title) || ''))) isBlog = true;
    });
    if (isBlog) byHeading = i;
  });
  return byHeading;
}

(async () => {
  const creds = await wpCreds();
  const backup = {};
  const summary = [];

  for (const cfg of PAGES) {
    const page = await wp(creds, `/wp/v2/pages/${cfg.id}?context=edit`);
    const rawData = page.meta && page.meta._elementor_data;
    if (!rawData) { summary.push(`SKIP  [${cfg.id}] ${cfg.label} — not an Elementor page`); continue; }

    let tree;
    try { tree = JSON.parse(rawData); } catch { summary.push(`SKIP  [${cfg.id}] ${cfg.label} — unparseable data`); continue; }

    const glossIdx = tree.findIndex(hasGlossary);
    const blogIdx = findBlogIndex(tree);
    if (glossIdx < 0) { summary.push(`SKIP  [${cfg.id}] ${cfg.label} — no glossary section`); continue; }
    if (blogIdx < 0) { summary.push(`SKIP  [${cfg.id}] ${cfg.label} — no blog section found`); continue; }

    // סוף אזור הבלוג (בבנייה ירוקה ווידג'ט הפוסטים בסקשן שאחרי הכותרת).
    const blogEnd = Math.min(blogIdx + (cfg.extraTrailingSections || 0), tree.length - 1);
    if (glossIdx === blogEnd + 1) {
      summary.push(`OK    [${cfg.id}] ${cfg.label} — glossary already below the blog section`);
      continue;
    }

    const next = tree.slice();
    const [glossSection] = next.splice(glossIdx, 1);
    // המילון ישב לפני הבלוג ⇒ אחרי ההסרה כל האינדקסים שאחריו זזו אחורה באחד,
    // ולכן blogEnd עצמו הוא כבר המיקום שמיד אחרי הבלוג.
    const target = glossIdx < blogEnd ? blogEnd : blogEnd + 1;
    next.splice(target, 0, glossSection);

    const serialized = JSON.stringify(next);
    if (JSON.parse(serialized).length !== tree.length) throw new Error(`section count changed on ${cfg.id}`);

    summary.push(
      `MOVE  [${cfg.id}] ${cfg.label} — glossary ${glossIdx} → ${target} (blog section ${blogIdx}${cfg.extraTrailingSections ? `+${cfg.extraTrailingSections}` : ''}), ${tree.length} sections`,
    );
    backup[cfg.id] = { label: cfg.label, elementorData: rawData };

    if (!DRY_RUN) {
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8');
      await wp(creds, `/wp/v2/pages/${cfg.id}`, {
        method: 'POST',
        body: JSON.stringify({ meta: { _elementor_data: serialized } }),
      });
      // אימות: קריאה חוזרת ובדיקה שהמילון אכן יושב אחרי הבלוג.
      const after = await wp(creds, `/wp/v2/pages/${cfg.id}?context=edit`);
      const afterTree = JSON.parse(after.meta._elementor_data);
      const g = afterTree.findIndex(hasGlossary);
      const b = findBlogIndex(afterTree);
      summary.push(`      verified: sections=${afterTree.length} glossary=${g} blog=${b} ${g > b ? '✓' : '✗ NOT BELOW'}`);
    }
  }

  console.log(summary.join('\n'));
  if (DRY_RUN) console.log('\nDRY_RUN — nothing written.');
  else console.log(`\nbackup written to ${BACKUP_FILE} (${Object.keys(backup).length} pages)`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
