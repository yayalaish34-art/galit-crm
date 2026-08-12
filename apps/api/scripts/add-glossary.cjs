/**
 * מוסיף בלוק "מילון מונחים" לעמוד שירות באתר, באותו מבנה ועיצוב של העמודים
 * שכבר יש בהם מילון.
 *
 *   cd apps/api
 *   PAGE_ID=4822 DRY_RUN=1 npx railway run node scripts/add-glossary.cjs   # תצוגה מקדימה
 *   PAGE_ID=4822 npx railway run node scripts/add-glossary.cjs             # כתיבה לאתר
 *
 * למה התבנית נשלפת מהאתר ולא כתובה כאן: ה-CSS של המילון מוטמע בתוך התוכן של
 * כל עמוד. העתקה שלו לקוד הייתה מתיישנת ברגע שמישהו יעדכן את העיצוב, ולכן
 * הסקריפט קורא את ה-<style> מעמוד קיים (TEMPLATE_PAGE_ID) ומרכיב סביבו מונחים
 * חדשים — כך כל מילון שנוצר כאן זהה ויזואלית לקיימים, גם אחרי שינוי עיצוב.
 *
 * הסקריפט אידמפוטנטי: עמוד שכבר יש בו galit-gloss מדולג ולא נדרס.
 */
const crypto = require('crypto');
const { Client } = require('pg');

const TEMPLATE_PAGE_ID = Number(process.env.TEMPLATE_PAGE_ID || 4802);
const TERM_COUNT = Number(process.env.TERM_COUNT || 12);
const DRY_RUN = process.env.DRY_RUN === '1';

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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** מנסח את המונחים לעמוד. מקבל את טקסט העמוד כדי שהמונחים יהיו של *השירות הזה*. */
async function draftTerms(title, pageText) {
  const system = [
    'אתה עורך תוכן מקצועי של "גלית — החברה לאיכות הסביבה", מעבדה מוסמכת ISO 17025',
    'לבדיקות וניטור סביבתיים בישראל. אתה כותב מילון מונחים לעמוד שירות באתר.',
    '',
    'כללים:',
    `- ${TERM_COUNT} מונחים, בעברית, שרלוונטיים ספציפית לשירות של העמוד הזה.`,
    '- מונח = 1-4 מילים. בלי ראשי תיבות לועזיים בלי הסבר.',
    '- הסבר = 2-4 משפטים. מסביר את המונח, ומחבר אותו להקשר של השירות בעמוד.',
    '',
    '- רק מונחים *מקצועיים* — משהו שהלקוח ייתקל בו בתהליך הבדיקה, בדוח או ברגולציה,',
    '  ולא יודע מה זה. שיטות דיגום, סוגי בדיקה, פרמטרים, גופים מפקחים, מסמכים.',
    '- אסור לרשום ביטויים שיווקיים או יכולות של החברה כ"מונח" ("ציוד מתקדם",',
    '  "שירות מקצועי", "צוות מנוסה") — אלה לא מונחים ואין להם מה לחפש במילון.',
    '- אסור לרשום מונח שההסבר שלו הוא הגדרת מילון רגילה של מילה יומיומית ("ספא").',
    '',
    '- דיוק לפני שיווק. אל תמציא מספרים, ערכי סף, תקנים, חוקים או שמות מעבדות.',
    '- אם נדרש ערך מספרי שאינך בטוח בו — נסח כללית ("ערך סף שנקבע ברגולציה").',
    '- אל תכתוב טענות משפטיות (כמו "קביל בבית משפט") אלא אם הן מופיעות במפורש',
    '  בתוכן העמוד שקיבלת.',
    '- בלי ייעוץ רפואי ובלי הבטחות תוצאה.',
    '- סדר את המונחים מהבסיסי למתקדם, כמו שקורא חדש בתחום היה לומד אותם.',
    '- בלי HTML ובלי Markdown — טקסט נקי בלבד.',
  ].join('\n');

  const user = [
    `שם העמוד: ${title}`,
    '',
    'תוכן העמוד (לצורך הקשר):',
    pageText.slice(0, 3500),
    '',
    'החזר JSON בלבד: {"terms":[{"term":"...","definition":"..."}]}',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const terms = (parsed.terms || []).filter((t) => t && t.term && t.definition);
  if (terms.length < 6) throw new Error(`got only ${terms.length} terms`);
  return terms;
}

function buildSection(css, title, terms) {
  const items = terms
    .map(
      (t) =>
        `<details class="galit-gloss__item">\n` +
        `<summary><span class="galit-gloss__term">${esc(t.term)}</span><span class="galit-gloss__ico" aria-hidden="true"></span></summary>\n` +
        `<div class="galit-gloss__body">\n<p>${esc(t.definition)}</p>\n</div>\n</details>`,
    )
    .join('\n');
  return (
    `<section class="galit-gloss" dir="rtl">\n<style>${css}</style>\n` +
    `<div class="galit-gloss__head">\n<h2>מילון מונחים</h2>\n` +
    `<p class="galit-gloss__sub">מושגים מקצועיים שכדאי להכיר בנושא ${esc(title)}</p>\n` +
    `<p class="galit-gloss__hint"><span class="galit-gloss__count">${terms.length} מונחים</span>לחצו על מונח כדי לפתוח את ההסבר</p>\n</div>\n` +
    `<div class="galit-gloss__grid">\n${items}\n</div>\n</section>`
  );
}

(async () => {
  const pageId = Number(process.env.PAGE_ID);
  if (!pageId) throw new Error('PAGE_ID is required');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing — run via `railway run`');

  const creds = await wpCreds();

  // ה-CSS הקנוני, מהעמוד שמשמש תבנית.
  const tpl = await wp(creds, `/wp/v2/pages/${TEMPLATE_PAGE_ID}?context=edit`);
  const css = /<style>([\s\S]*?)<\/style>/.exec(tpl.content.raw)?.[1];
  if (!css) throw new Error(`no <style> found on template page ${TEMPLATE_PAGE_ID}`);

  const page = await wp(creds, `/wp/v2/pages/${pageId}?context=edit`);
  const title = strip(page.title.raw || page.title.rendered);
  const raw = page.content.raw || '';
  if (raw.includes('galit-gloss')) {
    console.log(`SKIP  [${pageId}] ${title} — already has a glossary`);
    return;
  }

  const terms = await draftTerms(title, strip(raw));
  const section = buildSection(css, title, terms);

  console.log(`\n=== [${pageId}] ${title} — ${terms.length} terms ===`);
  for (const t of terms) console.log(`  • ${t.term}: ${t.definition.slice(0, 90)}…`);

  if (DRY_RUN) {
    console.log('\nDRY_RUN — nothing written.');
    return;
  }

  await wp(creds, `/wp/v2/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ content: `${raw}\n\n${section}` }),
  });
  console.log(`\nWROTE [${pageId}] ${title} (content ${raw.length} -> ${raw.length + section.length + 2} chars)`);
  console.log('link:', decodeURIComponent(page.link));
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
