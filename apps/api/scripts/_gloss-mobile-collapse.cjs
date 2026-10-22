/**
 * מקפל את מילון המונחים בטלפון: מוצגים 5 מונחים, ומתחתיהם כפתור עם חץ
 * שפותח את השאר. בדסקטופ שום דבר לא משתנה.
 *
 * המימוש הוא CSS בלבד (תיבת סימון מוסתרת + label), בלי שורת JavaScript אחת:
 * ה-HTML נשמר בתוך `_elementor_data` דרך REST, וסקריפט שם הוא סיכון מיותר —
 * גם לסינון וגם לתחזוקה. checkbox + `~` נותן בדיוק את אותה התנהגות.
 *
 * הרצה: node -r dotenv/config scripts/_gloss-mobile-collapse.cjs [--apply]
 */
const { wp } = require('./_wp-lib.cjs');
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const CATEGORY = [3723, 3725, 3727, 3729, 3731, 3733, 3735, 3737, 3739, 3741];
/** כמה מונחים נשארים גלויים בטלפון. */
const VISIBLE = 5;
/** מתחת לרוחב הזה המילון הוא טור אחד — שם הגלילה נהיית בלתי נסבלת. */
const PHONE_MAX = 819;
/** סימן שהעמוד כבר טופל, כדי שהרצה חוזרת לא תכפיל את הכפתור. */
const MARK = 'galit-gloss__more-cb';

const CSS = `
.galit-gloss__more-cb{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.galit-gloss__more{display:none}
@media(max-width:${PHONE_MAX}px){
.galit-gloss__grid>.galit-gloss__item:nth-of-type(n+${VISIBLE + 1}){display:none}
.galit-gloss__more-cb:checked~.galit-gloss__grid>.galit-gloss__item{display:block}
.galit-gloss__more{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;
 margin-top:.75rem;padding:.75rem 1rem;cursor:pointer;user-select:none;background:var(--gl);
 border:1px solid #d7e8bd;border-radius:10px;font-size:.95rem;font-weight:700;color:var(--gd)}
.galit-gloss__more:hover{background:#e8f2d8}
.galit-gloss__more-cb:focus-visible~.galit-gloss__more{outline:2px solid var(--g);outline-offset:2px}
.galit-gloss__more-arw{width:0;height:0;border-left:5px solid transparent;
 border-right:5px solid transparent;border-top:6px solid var(--gd);transition:transform .2s ease}
.galit-gloss__more-cb:checked~.galit-gloss__more .galit-gloss__more-arw{transform:rotate(180deg)}
.galit-gloss__more-cb:checked~.galit-gloss__more .galit-gloss__more-open{display:none}
.galit-gloss__more-close{display:none}
.galit-gloss__more-cb:checked~.galit-gloss__more .galit-gloss__more-close{display:inline}
}
`.trim();

function walk(node, cb) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, cb));
  if (node && typeof node === 'object') {
    cb(node);
    if (Array.isArray(node.elements)) walk(node.elements, cb);
  }
}

function patch(html, pageId) {
  if (html.includes(MARK)) return { html, skipped: 'already patched' };

  const terms = (html.match(/<details class="galit-gloss__item">/g) || []).length;
  if (terms <= VISIBLE) return { html, skipped: `only ${terms} terms` };

  // 1. CSS — נכנס בסוף אותו <style> שכבר בווידג'ט.
  const styleEnd = html.lastIndexOf('</style>');
  if (styleEnd < 0) throw new Error(`page ${pageId}: no <style> block`);
  let out = html.slice(0, styleEnd) + '\n' + CSS + '\n' + html.slice(styleEnd);

  // 2. תיבת הסימון — לפני הרשת, כדי ש-`~` יגיע גם לרשת וגם לכפתור.
  const gridOpen = '<div class="galit-gloss__grid">';
  if (!out.includes(gridOpen)) throw new Error(`page ${pageId}: no grid`);
  const id = `galit-gloss-more-${pageId}`;
  out = out.replace(
    gridOpen,
    `<input type="checkbox" id="${id}" class="galit-gloss__more-cb">` + gridOpen,
  );

  // 3. הכפתור — אחרי סגירת הרשת, לפני סוף הסקשן.
  const gridClose = '</details></div>';
  const at = out.lastIndexOf(gridClose);
  if (at < 0) throw new Error(`page ${pageId}: no grid close`);
  const hidden = terms - VISIBLE;
  const label =
    `<label class="galit-gloss__more" for="${id}">` +
    `<span class="galit-gloss__more-open">הצג עוד ${hidden} מונחים</span>` +
    `<span class="galit-gloss__more-close">הצג פחות</span>` +
    `<span class="galit-gloss__more-arw" aria-hidden="true"></span>` +
    `</label>`;
  out = out.slice(0, at + gridClose.length) + label + out.slice(at + gridClose.length);

  return { html: out, terms, hidden };
}

(async () => {
  const { site, auth } = await wp();
  const backup = { when: new Date().toISOString(), pages: {} };
  const plan = [];

  for (const id of CATEGORY) {
    const r = await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`, {
      headers: { Authorization: auth },
    });
    const p = await r.json();
    const meta = String(p.meta._elementor_data || '');
    backup.pages[id] = meta;

    const tree = JSON.parse(meta);
    const widgets = [];
    walk(tree, (n) => {
      if (
        n.widgetType === 'html' &&
        typeof n.settings?.html === 'string' &&
        n.settings.html.includes('galit-gloss')
      ) {
        widgets.push(n);
      }
    });
    if (widgets.length !== 1) throw new Error(`page ${id}: expected 1 glossary widget, got ${widgets.length}`);

    const res = patch(widgets[0].settings.html, id);
    if (res.skipped) {
      console.log(`${id} ${String(p.title.raw).trim().padEnd(13)} SKIP (${res.skipped})`);
      continue;
    }
    widgets[0].settings.html = res.html;
    const next = JSON.stringify(tree);
    JSON.parse(next);
    console.log(
      `${id} ${String(p.title.raw).trim().padEnd(13)} ${res.terms} terms -> ${VISIBLE} visible, ` +
        `"הצג עוד ${res.hidden} מונחים"  (${meta.length} -> ${next.length} bytes)`,
    );
    plan.push({ id, next });
  }

  fs.writeFileSync('scripts/_gloss-mobile-backup.json', JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nbackup -> scripts/_gloss-mobile-backup.json (${Object.keys(backup.pages).length} pages)`);

  if (!APPLY) {
    console.log('\nDRY RUN — הרץ עם --apply כדי לכתוב');
    return;
  }

  for (const { id, next } of plan) {
    const w = await fetch(`${site}/wp-json/wp/v2/pages/${id}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: { _elementor_data: next } }),
    });
    console.log(`   POST ${id} -> ${w.status}`);
    if (!w.ok) throw new Error(await w.text());
  }

  const cc = await fetch(`${site}/wp-json/elementor/v1/cache`, {
    method: 'DELETE',
    headers: { Authorization: auth },
  });
  console.log(`elementor cache clear -> ${cc.status}`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
