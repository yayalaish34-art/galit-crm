/**
 * יוצר פופאפ הסכמת עוגיות (cookie consent) ב-Elementor על galit.co.il.
 * צבע: ירוק זית (#7A9D2E) — עיצוב מותאם לאתר.
 * שפה: עברית, כיוון RTL.
 * גודל: קומפקטי, מוצג בתחתית המסך.
 * תדירות: פעם אחת בלבד (Elementor מטפל בזה עם cookie משלו).
 *
 * הרצה:
 *   cd apps/api
 *   DRY_RUN=1 npx railway run node scripts/wp-cookie-consent-popup.cjs   # תצוגה מקדימה
 *   npx railway run node scripts/wp-cookie-consent-popup.cjs             # כתיבה לאתר
 */
const { wp } = require('./_wp-lib.cjs');

const DRY_RUN = process.env.DRY_RUN === '1';
const KIT_ID = 7842;
const GREEN = '#7A9D2E';
const POPUP_TITLE = 'Cookie Consent - הסכמת עוגיות';

// --- צבעים ---
const TEXT_COLOR = '#ffffff';
const BTN_BG = '#ffffff';
const BTN_TEXT = '#4f6e12';
const BTN2_BG = 'transparent';
const BTN2_TEXT = '#e8f5c8';

// ── עוזרי Elementor ────────────────────────────────────────────────────────
function uid() {
  const chars = 'abcdef0123456789';
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── תוכן הפופאפ כ-HTML widget ──────────────────────────────────────────────
const POPUP_HTML = `
<style>
.galit-cookie{direction:rtl;text-align:right;font-family:inherit;padding:0}
.galit-cookie p{margin:0 0 14px;font-size:14.5px;line-height:1.65;color:${TEXT_COLOR}}
.galit-cookie-btns{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.galit-cookie-accept{background:${BTN_BG};color:${BTN_TEXT};border:none;padding:9px 22px;border-radius:6px;font-size:14.5px;font-weight:700;cursor:pointer;transition:opacity .2s}
.galit-cookie-accept:hover{opacity:.88}
.galit-cookie-policy{color:${BTN2_TEXT};font-size:13px;text-decoration:underline;cursor:pointer;background:none;border:none;padding:4px}
</style>

<div class="galit-cookie">
  <p>
    אנו משתמשים בעוגיות (Cookies) לשיפור חוויית הגלישה, לניתוח תנועה ולהתאמת תכנים.
    המשך הגלישה מהווה הסכמה לשימוש בהם.
  </p>
  <div class="galit-cookie-btns">
    <button class="galit-cookie-accept" id="galit-cookie-ok">אישור וסגירה</button>
    <button class="galit-cookie-policy" onclick="window.open('/privacy-policy','_self')">מדיניות פרטיות</button>
  </div>
</div>

<script>
(function(){
  var STORE_KEY = 'galit_cookie_consent';
  function closePopup(){
    // Elementor Pro popup close API
    try{ jQuery(document).trigger('elementor/popup/hide'); }catch(e){}
    // fallback — hide the modal DOM node
    var m = document.querySelector('.elementor-popup-modal');
    if(m) m.style.setProperty('display','none','important');
  }
  // כבר הסכים — סגור מיד
  if(localStorage.getItem(STORE_KEY)){
    document.addEventListener('DOMContentLoaded', closePopup);
    closePopup();
  }
  document.addEventListener('click', function(e){
    if(e.target && e.target.id === 'galit-cookie-ok'){
      localStorage.setItem(STORE_KEY,'1');
      closePopup();
    }
  });
})();
<\/script>
`.trim();

// ── מבנה Elementor של הפופאפ ───────────────────────────────────────────────
function buildPopupData() {
  const sectionId = uid();
  const colId = uid();
  const widgetId = uid();

  return JSON.stringify([
    {
      id: sectionId,
      elType: 'section',
      isInner: false,
      settings: {
        layout: 'full_width',
        background_background: 'classic',
        background_color: GREEN,
        padding: { top: '20', right: '28', bottom: '20', left: '28', unit: 'px', isLinked: false },
        padding_mobile: { top: '16', right: '16', bottom: '16', left: '16', unit: 'px', isLinked: false },
      },
      elements: [
        {
          id: colId,
          elType: 'column',
          settings: { _column_size: 100, content_position: 'middle' },
          elements: [
            {
              id: widgetId,
              elType: 'widget',
              widgetType: 'html',
              settings: { html: POPUP_HTML },
            },
          ],
        },
      ],
    },
  ]);
}

// ── הגדרות הפופאפ (מיקום, כניסה, תדירות) ────────────────────────────────
const POPUP_PAGE_SETTINGS = {
  // מיקום: תחתית המסך
  placement: 'bottom-center',
  // אנימציה
  entrance_animation: 'slideInUp',
  entrance_animation_duration: { size: 0.4, unit: 'em' },
  exit_animation: 'slideOutDown',
  // רוחב קומפקטי
  width: { size: 100, unit: '%' },
  height: 'auto',
  // שכבה ואפקט overlay
  overlay: 'no',
  close_button_delay: 0,
  // תדירות — פעם אחת
  a11y_navigation: 'yes',
};

// ── תנאי הצגה (כל האתר) ──────────────────────────────────────────────────
const DISPLAY_CONDITIONS = [
  { id: 'include', type: 'general', operator: 'include' }
];

// ── Trigger — page_load עם 700ms השהיה ───────────────────────────────────
const TRIGGERS = [
  { id: 'page-load', delay: 700 }
];

async function call(site, auth, path, init = {}) {
  const res = await fetch(`${site}/wp-json${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: res.status, data, raw: text };
}

(async () => {
  const { site, auth } = await wp();
  console.log(`\nSite: ${site}`);

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] לא נכתב כלום — נראה מה היה נשלח:');
    console.log('  popup data (first 300 chars):', buildPopupData().slice(0, 300));
    console.log('  conditions:', JSON.stringify(DISPLAY_CONDITIONS));
    console.log('  triggers:', JSON.stringify(TRIGGERS));
    return;
  }

  // ── 1. חפש אם יש כבר פופאפ עוגיות ────────────────────────────────────
  const existing = await call(site, auth, '/wp/v2/elementor_library?search=cookie&per_page=20');
  const found = Array.isArray(existing.data)
    ? existing.data.find(p => String(p.title?.rendered || '').toLowerCase().includes('cookie'))
    : null;

  // ── 2. צור / עדכן ────────────────────────────────────────────────────────
  const body = JSON.stringify({
    title: POPUP_TITLE,
    status: 'publish',
    meta: {
      _elementor_template_type: 'popup',
      _elementor_data: buildPopupData(),
      _elementor_page_settings: POPUP_PAGE_SETTINGS,
      _elementor_conditions: DISPLAY_CONDITIONS,
      _elementor_triggers: TRIGGERS,
    },
  });

  let result;
  if (found) {
    console.log(`\nמצאתי פופאפ קיים (ID=${found.id}) — מעדכן...`);
    result = await call(site, auth, `/wp/v2/elementor_library/${found.id}`, { method: 'POST', body });
  } else {
    console.log('\nיוצר פופאפ חדש...');
    result = await call(site, auth, '/wp/v2/elementor_library', { method: 'POST', body });
  }

  if (result.status >= 300) {
    console.error('נכשל:', result.status, result.raw.slice(0, 400));
    process.exit(1);
  }
  const popupId = result.data?.id;
  console.log(`\nפופאפ ${found ? 'עודכן' : 'נוצר'} — ID: ${popupId}`);

  // ── 3. נקה מטמון Elementor ─────────────────────────────────────────────
  console.log('\nמנקה מטמון Elementor...');
  const cache = await call(site, auth, '/elementor/v1/clear-cache', { method: 'POST', body: '{}' });
  console.log('cache clear:', cache.status, String(cache.data?.status || cache.raw).slice(0, 100));

  // ── 4. הוסף CSS גלובלי לקיט אם צריך ─────────────────────────────────
  // (הפופאפ עצמו מכיל את ה-CSS — שלב זה הוא אופציונלי)

  console.log('\n✓ הפופאפ מוכן!');
  console.log(`  עריכה: ${site}/wp-admin/post.php?post=${popupId}&action=elementor`);
  console.log('\nאם הפופאפ לא מופיע — יש לוודא ב-wp-admin → Elementor → Popups');
  console.log('שתנאי ההצגה כוללים "כל האתר" ו-Trigger = "טעינת עמוד".');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
