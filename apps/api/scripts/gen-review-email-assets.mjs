/**
 * מייצר את הגרפיקה של מייל בקשת המשוב (5 פרצופים צבעוניים, באנר עלים, תג עלה)
 * וכותב אותה כ-base64 אל src/reviews/review-email-assets.ts.
 *
 * למה ציור ידני: אין בפרויקט ספריית גרפיקה (sharp/canvas), והתמונות חייבות להיות
 * מוטבעות ב-source — קבצי assets שמתחת ל-src אינם מועתקים ל-dist ע"י nest build,
 * ותמונות חיצוניות (URL) נחסמות כברירת מחדל בחלק מלקוחות המייל. לכן: ציור עם
 * דגימת-על, קידוד PNG דרך zlib, והטבעה כ-base64 שנשלח כ-inline attachment (cid:).
 *
 * הרצה (מתוך apps/api):  node scripts/gen-review-email-assets.mjs
 * לתצוגה מקדימה של ה-PNG-ים בלבד:  node scripts/gen-review-email-assets.mjs --out=<dir>
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(HERE, '..');

// ── קידוד PNG (RGBA8, ללא interlace) ────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── קנבס: הרכבת שכבות עם דגימת-על להחלקת קצוות ──────────────────────────────
const SS = 4; // דגימות משנה בכל ציר

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4); // שקוף
  }
  /** מרכיב שכבה: test(x,y)->bool, color = [r,g,b] או פונקציה (לגרדיאנט). */
  layer(test, color, alpha = 1) {
    const colorFn = typeof color === 'function' ? color : () => color;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let hit = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (test(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hit++;
          }
        }
        if (!hit) continue;
        const cov = (hit / (SS * SS)) * alpha;
        const [r, g, b] = colorFn(x + 0.5, y + 0.5);
        const i = (y * this.w + x) * 4;
        const da = this.buf[i + 3] / 255;
        const na = cov + da * (1 - cov);
        this.buf[i] = Math.round((r * cov + this.buf[i] * da * (1 - cov)) / na);
        this.buf[i + 1] = Math.round((g * cov + this.buf[i + 1] * da * (1 - cov)) / na);
        this.buf[i + 2] = Math.round((b * cov + this.buf[i + 2] * da * (1 - cov)) / na);
        this.buf[i + 3] = Math.round(na * 255);
      }
    }
  }
  png() {
    return encodePng(this.w, this.h, this.buf);
  }
}

// ── עזרי צבע וצורות ─────────────────────────────────────────────────────────
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const lighten = (c, t) => mix(c, [255, 255, 255], t);
const darken = (c, t) => mix(c, [0, 0, 0], t);

const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** אליפסה מסובבת (זווית במעלות). */
const ellipse = (cx, cy, rx, ry, deg = 0) => {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  };
};

/** קטע קו בעובי w עם קצוות מעוגלים. */
const seg = (x1, y1, x2, y2, w) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  return (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2 <= (w / 2) ** 2;
};

/** קשת: טבעת סביב (cx,cy) ברדיוס r ובעובי w, בטווח זוויות [a0,a1] מעלות (y כלפי מטה). */
const arc = (cx, cy, r, w, a0, a1) => (x, y) => {
  const dx = x - cx, dy = y - cy;
  if (Math.abs(Math.hypot(dx, dy) - r) > w / 2) return false;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  return a0 <= a1 ? ang >= a0 && ang <= a1 : ang >= a0 || ang <= a1;
};

/** עלה = חיתוך שני עיגולים (עדשה), מסובב ומוזז. len/wid = חצי-אורך וחצי-רוחב. */
const leaf = (cx, cy, len, wid, deg) => {
  const R = (len * len + wid * wid) / (2 * wid);
  const k = R - wid;
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    return u * u + (v - k) ** 2 <= R * R && u * u + (v + k) ** 2 <= R * R;
  };
};

/** סרט לאורך עקומת בזייה ריבועית, ברוחב מתדק — ה-swoosh של הלוגו. */
const ribbon = (p0, p1, p2, wStart, wEnd, offset = 0) => {
  const [x0, y0] = p0, [x1, y1] = p1, [x2, y2] = p2;
  const a = x0 - 2 * x1 + x2, b = 2 * (x1 - x0);
  const tAt = (x) => {
    if (Math.abs(a) < 1e-6) return (x - x0) / (b || 1);
    const d = b * b + 4 * a * (x - x0);
    return d < 0 ? -1 : (-b + Math.sqrt(d)) / (2 * a);
  };
  return (x, y) => {
    const t = tAt(x);
    if (t < 0 || t > 1) return false;
    const yc = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2 + offset;
    const dy = 2 * (1 - t) * (y1 - y0) + 2 * t * (y2 - y1);
    const dx = 2 * (1 - t) * (x1 - x0) + 2 * t * (x2 - x1);
    const slope = dy / (dx || 1);
    const wid = (wStart + (wEnd - wStart) * t) * Math.sqrt(1 + slope * slope);
    return Math.abs(y - yc) <= wid / 2;
  };
};

// ── 5 הפרצופים: אדום (1) → ירוק (5), בסגנון הלוגו ───────────────────────────
const FACES = [
  { n: 1, fill: '#e8473c', mouth: 'frown-deep', brows: 'angry' },
  { n: 2, fill: '#f08a36', mouth: 'frown' },
  { n: 3, fill: '#f7c93f', mouth: 'flat' },
  { n: 4, fill: '#8cc63f', mouth: 'smile' },
  { n: 5, fill: '#4caf50', mouth: 'grin' },
];

function drawFace(spec, size = 132) {
  const c = new Canvas(size, size);
  const u = (v) => (v * size) / 100; // קואורדינטות 0..100
  const fill = hex(spec.fill);
  const ring = darken(fill, 0.22);
  const feat = darken(fill, 0.58);

  // מסגרת + מילוי עם גרדיאנט עדין (בהיר למעלה)
  c.layer(disc(u(50), u(50), u(47.5)), ring);
  c.layer(disc(u(50), u(50), u(44.2)), (_x, y) => {
    const t = Math.min(1, Math.max(0, (y / size - 0.1) / 0.85));
    return mix(lighten(fill, 0.26), darken(fill, 0.04), t);
  });

  // עיניים (+ גבות כועסות בפרצוף הראשון)
  const eyeDx = 15.5;
  if (spec.brows === 'angry') {
    c.layer(ellipse(u(50 - eyeDx), u(41.5), u(5.2), u(6.4), -18), feat);
    c.layer(ellipse(u(50 + eyeDx), u(41.5), u(5.2), u(6.4), 18), feat);
    c.layer(seg(u(28), u(26.5), u(41.5), u(32.5), u(5.2)), feat);
    c.layer(seg(u(72), u(26.5), u(58.5), u(32.5), u(5.2)), feat);
  } else {
    c.layer(ellipse(u(50 - eyeDx), u(40), u(5.4), u(6.6)), feat);
    c.layer(ellipse(u(50 + eyeDx), u(40), u(5.4), u(6.6)), feat);
  }

  // פה
  switch (spec.mouth) {
    case 'frown-deep':
      c.layer(arc(u(50), u(82), u(19), u(6), 212, 328), feat);
      break;
    case 'frown':
      c.layer(arc(u(50), u(84), u(19), u(5.6), 222, 318), feat);
      break;
    case 'flat':
      c.layer(seg(u(35), u(67), u(65), u(67), u(5.6)), feat);
      break;
    case 'smile':
      c.layer(arc(u(50), u(52), u(23), u(5.8), 32, 148), feat);
      break;
    case 'grin': // חיוך רחב ופתוח — חצי דיסק חתוך בקו אופקי
      c.layer((x, y) => disc(u(50), u(58), u(22))(x, y) && y >= u(58), feat);
      c.layer(seg(u(28.5), u(58), u(71.5), u(58), u(5)), feat);
      break;
  }
  return c.png();
}

/**
 * באנר הכותרת: אשכול עלים בקצה + swoosh שנמשך על כל רוחב הכרטיס אל הלוגו.
 * הקנבס כפול מגודל התצוגה (840→420) לחדות במסכי retina; העלים בקואורדינטות
 * מוחלטות בקצה השמאלי, וה-swoosh נמשך עד סוף הרוחב.
 */
function drawBanner(w = 840, h = 120) {
  const c = new Canvas(w, h);
  const u = (v) => v; // קואורדינטות = פיקסלים (קנבס בגודל קבוע)
  const g1 = hex('#8cc63f'), g2 = hex('#4e9a2f'), g3 = hex('#a6d465'), soft = hex('#e4f2d3');

  const P0 = [u(4), u(94)], P1 = [u(430), u(20)], P2 = [u(838), u(34)];
  c.layer(ribbon(P0, P1, P2, u(19), u(4), 0), soft);
  c.layer(ribbon(P0, P1, P2, u(4.2), u(1.4), u(-8.5)), g1, 0.8);

  const sprig = [
    { x: 74, y: 74, len: 58, wid: 20, deg: -14, col: g2 },
    { x: 120, y: 50, len: 50, wid: 17, deg: 24, col: g1 },
    { x: 50, y: 42, len: 41, wid: 14, deg: 42, col: g3 },
    { x: 164, y: 74, len: 42, wid: 14, deg: -10, col: g1 },
    { x: 22, y: 84, len: 35, wid: 12, deg: -34, col: g2 },
    { x: 198, y: 54, len: 31, wid: 10, deg: 30, col: g3 },
  ];
  for (const l of sprig) {
    const shape = leaf(u(l.x), u(l.y), u(l.len), u(l.wid), l.deg);
    c.layer(shape, l.col);
    const a = (l.deg * Math.PI) / 180;
    const rx = Math.cos(a) * u(l.len * 0.82), ry = Math.sin(a) * u(l.len * 0.82);
    const rib = seg(u(l.x) - rx, u(l.y) - ry, u(l.x) + rx, u(l.y) + ry, u(1.8));
    c.layer((x, y) => rib(x, y) && shape(x, y), lighten(l.col, 0.45), 0.85);
  }
  return c.png();
}

/** תג עלה קטן לשורת הסיום. */
function drawLeafBadge(size = 56) {
  const c = new Canvas(size, size);
  const u = (v) => (v * size) / 100;
  c.layer(disc(u(50), u(50), u(48)), hex('#eaf5dd'));
  const shape = leaf(u(50), u(50), u(31), u(11), -38);
  c.layer(shape, hex('#6cb33f'));
  const rib = seg(u(50) - Math.cos(-0.663) * u(25), u(50) - Math.sin(-0.663) * u(25),
    u(50) + Math.cos(-0.663) * u(25), u(50) + Math.sin(-0.663) * u(25), u(3));
  c.layer((x, y) => rib(x, y) && shape(x, y), lighten(hex('#6cb33f'), 0.5), 0.9);
  return c.png();
}

// ── בנייה + כתיבה ───────────────────────────────────────────────────────────
const outArg = process.argv.find((a) => a.startsWith('--out='));
const assets = [];

for (const f of FACES) assets.push({ key: `face${f.n}`, cid: `galit-face-${f.n}`, name: `face-${f.n}.png`, png: drawFace(f) });
assets.push({ key: 'banner', cid: 'galit-leaves', name: 'galit-leaves.png', png: drawBanner() });
assets.push({ key: 'leaf', cid: 'galit-leaf', name: 'galit-leaf.png', png: drawLeafBadge() });

// הלוגו — הקובץ האמיתי מ-apps/web/public (אינו נגיש בזמן ריצה בקונטיינר של ה-API).
const logoPath = path.resolve(API_DIR, '..', 'web', 'public', 'logo.png');
assets.push({ key: 'logo', cid: 'galit-logo', name: 'galit-logo.png', png: fs.readFileSync(logoPath) });

if (outArg) {
  const dir = outArg.slice('--out='.length);
  fs.mkdirSync(dir, { recursive: true });
  for (const a of assets) fs.writeFileSync(path.join(dir, a.name), a.png);
  console.log(`wrote ${assets.length} PNGs to ${dir}`);
}

const target = path.join(API_DIR, 'src', 'reviews', 'review-email-assets.ts');
const entries = assets
  .map((a) => `  ${a.key}: {\n    cid: '${a.cid}',\n    name: '${a.name}',\n    base64:\n      '${a.png.toString('base64')}',\n  },`)
  .join('\n');

fs.writeFileSync(
  target,
  `/* eslint-disable */
/**
 * נוצר אוטומטית ע"י scripts/gen-review-email-assets.mjs — אין לערוך ידנית.
 * הגרפיקה של מייל בקשת המשוב (5 פרצופים, באנר עלים, תג עלה, לוגו) מוטבעת כאן
 * כ-base64 ונשלחת כ-inline attachments (cid:) — כך היא נראית גם באאוטלוק וגם
 * ב-Gmail בלי תלות בקבצים שמחוץ ל-dist ובלי חסימת תמונות חיצוניות.
 * לעדכון: node scripts/gen-review-email-assets.mjs
 */
export interface ReviewEmailAsset {
  /** Content-ID לשימוש ב-HTML כ-src="cid:<cid>" */
  cid: string;
  name: string;
  base64: string;
}

export const REVIEW_EMAIL_ASSETS: Record<string, ReviewEmailAsset> = {
${entries}
};
`,
  'utf8',
);

const total = assets.reduce((s, a) => s + a.png.length, 0);
console.log(`${target}\n${assets.map((a) => `  ${a.name} ${a.png.length}B`).join('\n')}\n  total ${total}B`);
