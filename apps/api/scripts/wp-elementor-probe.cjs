/**
 * שלב 2 של הבדיקה: האם אפשר לכתוב _elementor_data דרך REST meta (בדיקת no-op
 * על טיוטה — כותב בחזרה את אותו ערך בדיוק ומוודא שלא השתנה), ומיפוי מבנה
 * הסקשנים של 4 עמודי הקטגוריה כדי לאתר את סקשן הבלוג.
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const DRAFT_TEST_PAGE = 13418; // טיוטה של עמוד הבית — לא פוגע בכלום
const CATEGORY_PAGES = [3731, 3727, 3737, 3735];
const OUT = process.env.OUT_FILE || 'elementor-structure.json';

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
  return { status: res.status, data, text };
}

/** תקציר רקורסיבי של עץ אלמנטים: מה יש בכל סקשן עליון. */
function summarize(el) {
  const out = {
    id: el.id,
    type: el.elType,
    widget: el.widgetType || undefined,
  };
  const s = el.settings || {};
  const textBits = [];
  for (const key of ['title', 'editor', 'anchor', 'html', 'text', 'title_text']) {
    if (typeof s[key] === 'string' && s[key].trim()) textBits.push(`${key}=${s[key].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  }
  if (s._element_id) textBits.push(`#${s._element_id}`);
  if (textBits.length) out.text = textBits.join(' | ');
  if (Array.isArray(el.elements) && el.elements.length) out.children = el.elements.map(summarize);
  return out;
}

(async () => {
  const creds = await wpCreds();
  const report = { writeTest: null, pages: [] };

  // ── בדיקת כתיבה no-op על הטיוטה ──
  const draft = await wp(creds, `/wp/v2/pages/${DRAFT_TEST_PAGE}?context=edit`);
  const originalData = draft.data && draft.data.meta && draft.data.meta._elementor_data;
  if (typeof originalData === 'string' && originalData.length > 10) {
    const write = await wp(creds, `/wp/v2/pages/${DRAFT_TEST_PAGE}`, {
      method: 'POST',
      body: JSON.stringify({ meta: { _elementor_data: originalData } }),
    });
    const reread = await wp(creds, `/wp/v2/pages/${DRAFT_TEST_PAGE}?context=edit`);
    const after = reread.data && reread.data.meta && reread.data.meta._elementor_data;
    report.writeTest = {
      draftPage: DRAFT_TEST_PAGE,
      originalLen: originalData.length,
      writeStatus: write.status,
      afterLen: after ? after.length : null,
      identical: after === originalData,
      parseOk: (() => { try { JSON.parse(after); return true; } catch { return false; } })(),
    };
  } else {
    report.writeTest = { draftPage: DRAFT_TEST_PAGE, error: 'no _elementor_data on draft', status: draft.status };
  }
  console.log('writeTest:', JSON.stringify(report.writeTest));

  // ── מבנה 4 עמודי הקטגוריה ──
  for (const id of CATEGORY_PAGES) {
    const p = await wp(creds, `/wp/v2/pages/${id}?context=edit`);
    const raw = p.data && p.data.meta && p.data.meta._elementor_data;
    if (!raw) { report.pages.push({ id, error: 'no elementor data' }); continue; }
    let tree;
    try { tree = JSON.parse(raw); } catch (e) { report.pages.push({ id, error: 'parse failed' }); continue; }
    report.pages.push({
      id,
      title: String(p.data.title.raw || '').trim(),
      editMode: p.data.meta._elementor_edit_mode,
      dataLen: raw.length,
      sections: tree.map(summarize),
    });
    console.log(`page ${id}: ${tree.length} top-level sections, data ${raw.length} chars`);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('wrote', OUT);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
