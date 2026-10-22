/**
 * Section renderers for the "asbestos" design pattern used across galit.co.il
 * service pages — a hero strip, a "למה לבחור" column, a grid of 6 service-type
 * cards, 5 numbered how-it-works steps, a compliance/ISO pair, a FAQ accordion,
 * a two-column deliverable with image, and an orange-gradient closing CTA.
 *
 * The reference page is 6785 (סקר אסבסט). This module just renders — the content
 * (headings, bullets, FAQ answers) is produced by an AI call per page.
 */

const CTA_PHONE_DISPLAY = '1-700-50-50-54';
const CTA_PHONE_HREF = 'tel:1700505054';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Render inline rich text — the AI returns plain text per paragraph; we accept
// basic <strong> tags inline and treat the rest as plain text.
function rich(s) {
  // Allow <strong> only; strip everything else that might sneak in.
  return String(s ?? '')
    .replace(/<(?!\/?strong\b)[^>]+>/gi, '')
    .replace(/&(?!#?\w+;)/g, '&amp;');
}

function paragraphs(ps) {
  return (ps || []).map((p) => `<p>${rich(p)}</p>`).join('');
}

function bullets(items) {
  return (items || []).length
    ? `<ul>${(items || []).map((b) => `<li><p>${rich(b)}</p></li>`).join('')}</ul>`
    : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 0 — Hero with brand chip, headings, intro paragraphs, CTA
// ─────────────────────────────────────────────────────────────────────────────

function sectionHero(hero, palette) {
  const h = hero;
  return (
    `<div style="background: linear-gradient(135deg,${palette.heroFrom} 0%,${palette.heroVia} 50%,${palette.heroTo} 100%); border-radius: 20px; padding: 44px 28px 36px; text-align:center; box-shadow: 0 12px 40px ${palette.heroShadow}; margin-top:12px;">` +
      `<div style="display:inline-block; margin-bottom:14px; padding:6px 16px; background:#fff; border-radius:999px; font-size:13px; font-weight:700; color:${palette.chipColor}; box-shadow:0 2px 10px ${palette.heroShadow};">${esc(h.chip || 'גלית · איכות הסביבה · משנת 1998')}</div>` +
      `<div style="max-width:860px; margin:0 auto;">` +
        `<h2>${esc(h.h2)}</h2>` +
        (h.h3 ? `<h3>${esc(h.h3)}</h3>` : '') +
        (h.h4 ? `<h4>${esc(h.h4)}</h4>` : '') +
        paragraphs(h.paragraphs) +
        (h.ctaQuestion ? `<h3>${esc(h.ctaQuestion)}</h3>` : '') +
        (h.ctaLead ? `<p>${rich(h.ctaLead)}</p>` : '') +
      `</div>` +
      `<a href="${CTA_PHONE_HREF}" style="display:inline-flex; align-items:center; gap:8px; margin-top:18px; padding:14px 28px; background:${palette.accent}; color:#fff; font-weight:800; font-size:17px; border-radius:999px; text-decoration:none; box-shadow:0 10px 30px ${palette.accentShadow};">📞 ${CTA_PHONE_DISPLAY} · חייגו עכשיו</a>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — "למה לבחור" column + heroImage on the side + 6 service-type cards
// ─────────────────────────────────────────────────────────────────────────────

function sectionWhyAndCards(block, palette) {
  const whyColumn =
    `<div style="flex:1 1 440px; min-width:260px;">` +
      `<h3 style="margin-top:0;">${esc(block.why.heading)}</h3>` +
      paragraphs(block.why.paragraphs) +
      (block.why.intro ? `<p>${rich(block.why.intro)}</p>` : '') +
      (block.why.questions && block.why.questions.length
        ? `<p>${block.why.questions.map((q) => `<strong>${esc(q)}</strong>`).join('<br />')}</p>`
        : '') +
    `</div>`;

  const heroImageColumn = block.heroImage
    ? `<div style="flex:0 0 320px; max-width:320px;">` +
        `<img src="${esc(block.heroImage.url)}" alt="${esc(block.heroImage.alt)}" style="width:100%; height:auto; display:block; border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,.12);" />` +
      `</div>`
    : '';

  const cardsGrid = (block.cards || [])
    .map(
      (c) =>
        `<div style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(15,23,42,.06); border:1px solid #e2e8f0; display:flex; flex-direction:column;">` +
          `<div style="background:${c.tint || palette.cardTint}; padding:22px 20px 14px; border-bottom:3px solid ${c.color || palette.accent};">` +
            `<div style="font-size:36px; line-height:1;">${esc(c.icon || '•')}</div>` +
            `<h3 style="margin:10px 0 0; font-size:19px; font-weight:800; color:${c.color || palette.accent};">${esc(c.title)}</h3>` +
          `</div>` +
          `<div style="padding:18px 20px 22px; font-size:14.5px; line-height:1.75; color:#334155; flex:1;">` +
            paragraphs(c.paragraphs) +
            bullets(c.bullets) +
            (c.closing ? `<p>${rich(c.closing)}</p>` : '') +
          `</div>` +
        `</div>`,
    )
    .join('');

  return (
    `<div style="padding:48px 0 24px;">` +
      `<div class="galit-expert-flex" style="max-width:1080px; margin:0 auto 28px; padding:0 12px; display:flex; gap:28px; align-items:flex-start; justify-content:center; flex-wrap:wrap;">` +
        heroImageColumn +
        whyColumn +
      `</div>` +
      `<div style="text-align:center; margin:40px 0 24px;">` +
        `<h2 style="font-size:30px; font-weight:900; color:#0f172a; margin:0;">${esc(block.cardsHeading)}</h2>` +
        `<div style="width:72px; height:4px; background:${palette.accent}; margin:14px auto 0; border-radius:999px;"></div>` +
      `</div>` +
      `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap:20px; padding:0 8px;">${cardsGrid}</div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — "כיצד מתבצע" + 5 numbered steps
// ─────────────────────────────────────────────────────────────────────────────

function sectionHow(block, palette) {
  const steps = (block.steps || [])
    .map(
      (s, i) =>
        `<div style="position:relative; background:#fff; border-radius:14px; padding:22px 18px; box-shadow:0 4px 14px rgba(15,23,42,.06); border:1px solid #e2e8f0;">` +
          `<div style="position:absolute; top:-18px; right:16px; width:40px; height:40px; border-radius:50%; background:${palette.accent}; color:#fff; font-weight:900; font-size:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px ${palette.accentShadow};">${i + 1}</div>` +
          `<h3 style="margin:10px 0 10px; font-size:17px; font-weight:800; color:#0f172a;">${esc(s.title)}</h3>` +
          `<div style="font-size:14px; line-height:1.7; color:#334155;">${paragraphs(s.paragraphs) + bullets(s.bullets)}</div>` +
        `</div>`,
    )
    .join('');

  return (
    `<div style="padding:40px 0; background:linear-gradient(180deg,#fafaf9,#fff); border-radius:20px; margin:12px 0;">` +
      `<div style="text-align:center; margin-bottom:40px;">` +
        `<h2 style="font-size:30px; font-weight:900; color:#0f172a; margin:0;">${esc(block.heading)}</h2>` +
        `<div style="width:72px; height:4px; background:${palette.accent}; margin:14px auto 0; border-radius:999px;"></div>` +
      `</div>` +
      `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:22px; padding:0 20px;">${steps}</div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Compliance / ISO 2-column box
// ─────────────────────────────────────────────────────────────────────────────

function sectionCompliance(block, palette) {
  const legal = block.legal || {};
  const iso = block.iso || {};
  return (
    `<div style="padding:50px 0;">` +
      `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px; padding:0 8px;">` +
        `<div style="background:linear-gradient(135deg,${palette.heroFrom},#fffbeb); border-radius:18px; padding:28px; border:1px solid ${palette.borderLegal};">` +
          `<div style="font-size:40px;">${esc(legal.icon || '📜')}</div>` +
          `<div style="font-size:14.5px; line-height:1.75; color:#334155; margin-top:8px;">` +
            `<h2>${esc(legal.h2 || '')}</h2>` +
            paragraphs(legal.paragraphs) +
            (legal.bullets && legal.bullets.length
              ? `<ul data-spread="false">${legal.bullets.map((b) => `<li><p>${rich(b)}</p></li>`).join('')}</ul>`
              : '') +
            (legal.closing ? `<p>${rich(legal.closing)}</p>` : '') +
          `</div>` +
        `</div>` +
        `<div style="background:linear-gradient(135deg,#f0fdfa,#ecfdf5); border-radius:18px; padding:28px; border:1px solid #a7f3d0;">` +
          `<div style="font-size:40px;">${esc(iso.icon || '🏅')}</div>` +
          `<div style="font-size:14.5px; line-height:1.75; color:#334155; margin-top:8px;">` +
            `<h2>${esc(iso.h2 || 'אנליזה במעבדה מוסמכת ISO/IEC 17025')}</h2>` +
            paragraphs(iso.paragraphs) +
            `<h3>ISO 9001 – מערכת ניהול איכות</h3>` +
            `<p>התקן מהווה חלק ממערך בקרת האיכות של החברה ותומך בעבודה מקצועית, מסודרת ומתועדת.</p>` +
            `<h3>ISO 14001 – מערכת ניהול סביבתי</h3>` +
            `<p>התקן משקף את מחויבות החברה לניהול סביבתי מקצועי וליישום תהליכי עבודה מבוקרים בתחומי איכות הסביבה.</p>` +
          `</div>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — FAQ accordion
// ─────────────────────────────────────────────────────────────────────────────

function sectionFaq(block, palette) {
  const items = (block.items || [])
    .map(
      (q) =>
        `<details open style="background:#fff; border-radius:14px; padding:18px 22px; box-shadow:0 4px 14px rgba(15,23,42,.05); border:1px solid #e2e8f0;">` +
          `<summary style="font-size:17px; font-weight:800; color:#0f172a; cursor:pointer; list-style:none; display:flex; align-items:center; gap:10px;"><span style="color:${palette.accent}; font-size:22px;">❓</span>${esc(q.question)}</summary>` +
          `<div style="margin-top:12px; font-size:14.5px; line-height:1.8; color:#334155;">${paragraphs(q.paragraphs) + bullets(q.bullets)}</div>` +
        `</details>`,
    )
    .join('');

  return (
    `<div style="padding:50px 0;">` +
      `<div style="text-align:center; margin-bottom:30px;">` +
        `<h2 style="font-size:30px; font-weight:900; color:#0f172a; margin:0;">${esc(block.heading)}</h2>` +
        `<div style="width:72px; height:4px; background:${palette.accent}; margin:14px auto 0; border-radius:999px;"></div>` +
      `</div>` +
      `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:18px; padding:0 8px;">${items}</div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Deliverable 2-column (text + image)
// ─────────────────────────────────────────────────────────────────────────────

function sectionDeliverable(block, palette) {
  const d = block;
  const imgHtml = d.image
    ? `<div><img src="${esc(d.image.url)}" alt="${esc(d.image.alt)}" style="width:100%; height:auto; border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,.12);" /></div>`
    : '';
  return (
    `<div style="background:#f8fafc; border-radius:20px; padding:36px 28px; margin:12px 0; display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:28px; align-items:center;">` +
      `<div>` +
        `<div style="font-size:13px; font-weight:800; color:${palette.accent}; text-transform:uppercase; letter-spacing:1px;">${esc(d.kicker || 'תוצר הבדיקה')}</div>` +
        `<h2 style="margin:8px 0 14px; font-size:28px; font-weight:900; color:#0f172a;">${esc(d.h2)}</h2>` +
        `<div style="font-size:15px; line-height:1.8; color:#334155;">${paragraphs(d.paragraphs) + bullets(d.bullets)}</div>` +
      `</div>` +
      imgHtml +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Orange gradient closing CTA
// ─────────────────────────────────────────────────────────────────────────────

function sectionClosingCta(block, palette) {
  const c = block;
  return (
    `<div style="background:linear-gradient(135deg,${palette.accent} 0%,${palette.accentDark} 100%); color:#fff; border-radius:22px; padding:50px 32px; text-align:center; margin:20px 0; box-shadow:0 20px 50px ${palette.accentShadowDeep};">` +
      `<div style="color:#fff; font-size:34px; margin-bottom:8px;">${esc(c.icon || '⚠️')}</div>` +
      `<div style="color:${palette.accentLight}; font-size:15px; line-height:1.9;">` +
        `<h2 style="color:#fff; font-size:28px; font-weight:900; margin:0 0 14px;">${esc(c.h2)}</h2>` +
        (c.paragraphs || []).map((p) => `<p style="color:${palette.accentLight};">${rich(p)}</p>`).join('') +
        `<h3 style="color:#fff; font-size:21px; font-weight:800; margin:16px 0 8px;">${esc(c.h3 || 'גלית – החברה לאיכות הסביבה')}</h3>` +
        (c.subtitle ? `<p style="color:${palette.accentLight};"><strong style="color:#fff;">${esc(c.subtitle)}</strong></p>` : '') +
        (c.disclaimer ? `<p style="color:${palette.accentLight};"><strong style="color:#fff;">${esc(c.disclaimer)}</strong></p>` : '') +
        `<p style="color:${palette.accentLight};">📞 <strong style="color:#fff;">${esc(c.phoneLead || 'לתיאום בדיקה וייעוץ מקצועי')}</strong></p>` +
        `<p style="color:${palette.accentLight};"><span style="color:${palette.accentHighlight}; font-size:18px;">לפרטים נוספים והזמנות חייגו: ${CTA_PHONE_DISPLAY}</span></p>` +
      `</div>` +
      `<a href="${CTA_PHONE_HREF}" style="display:inline-flex; align-items:center; gap:10px; margin-top:22px; padding:16px 36px; background:#fff; color:${palette.accentDark}; font-weight:900; font-size:19px; border-radius:999px; text-decoration:none; box-shadow:0 10px 30px rgba(0,0,0,.2);">📞 ${CTA_PHONE_DISPLAY} · ${esc(c.ctaButton || 'לתיאום בדיקה')}</a>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compose the 7 sections into Elementor's top-level section array
// ─────────────────────────────────────────────────────────────────────────────

function makeElementorSection(id, html) {
  return {
    id,
    elType: 'section',
    settings: {
      structure: '10',
      stretch_section: 'section-stretched',
      content_width: { unit: 'px', size: 1400, sizes: [] },
      padding: { unit: 'px', top: '20', right: '0', bottom: '20', left: '0', isLinked: false },
    },
    elements: [
      {
        id: `${id}c`,
        elType: 'column',
        settings: { _column_size: 100, _inline_size: null },
        elements: [
          {
            id: `${id}w`,
            elType: 'widget',
            widgetType: 'text-editor',
            settings: { editor: html },
          },
        ],
      },
    ],
  };
}

function composeElementorPage(content, palette) {
  const sections = [
    sectionHero(content.hero, palette),
    sectionWhyAndCards(
      {
        why: content.why,
        heroImage: content.heroImage,
        cardsHeading: content.serviceTypes.heading,
        cards: content.serviceTypes.cards,
      },
      palette,
    ),
    sectionHow(content.how, palette),
    sectionCompliance(content.compliance, palette),
    sectionFaq(content.faq, palette),
    sectionDeliverable(content.deliverable, palette),
    sectionClosingCta(content.cta, palette),
  ];

  // Give each section a stable id based on page topic.
  const base = String(content.topicSlug || 'galit').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'galit';
  return sections.map((html, i) => makeElementorSection(`${base}${i}${String(Math.random()).slice(2, 6)}`, html));
}

module.exports = { composeElementorPage };
