import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * תמונה ראשית לבלוג, אוטומטית.
 *
 * **הבעיה שזה פותר:** הטיוטה היומית נוצרה תמיד בלי תמונה. בוורדפרס פוסט בלי
 * `featured_media` מוצג בעמוד הקטגוריה כריבוע ריק, וגם השיתוף ברשתות יוצא
 * בלי תצוגה מקדימה — כך שדווקא הבלוגים שנוצרו לבד נראו הכי גרוע.
 *
 * **שלושה שלבים בכוונה:**
 *  1. מודל טקסט זול הופך את נושא הבלוג (עברית) לתיאורי סצנה באנגלית;
 *  2. מודל תמונה זול מצייר כל סצנה;
 *  3. הלוגו האמיתי נחתם על התמונה בקוד (sharp) — לא מצויר ע"י המודל.
 *
 * למה לא לשלוח את הכותרת העברית ישירות למודל התמונה: מודלי תמונה מנסים
 * *לצייר* טקסט שהם מקבלים, ועברית יוצאת אצלם ג׳יבריש — תמונה עם אותיות
 * מעוותות על בלוג של חברה מקצועית גרועה מאין תמונה. לכן שלב הביניים מייצר
 * תיאור *ויזואלי* נקי מטקסט, והאיסור על אותיות חוזר גם בתוך הפרומפט.
 *
 * ומאותה סיבה בדיוק הלוגו נחתם בשלב 3 ולא מבוקש מהמודל: לוגו "גלית" מכיל
 * עברית, וכל ניסיון לתת למודל לצייר אותו מייצר סמל מומצא עם אותיות שבורות.
 */

/** ברירות מחדל — הכי זול שנותן תוצאה ראויה לאתר. הכל ניתן לדריסה ב-ENV. */
const DEFAULT_IMAGE_MODEL = 'gpt-image-1-mini';
const DEFAULT_PROMPT_MODEL = 'gpt-4.1-mini';
const DEFAULT_SIZE = '1536x1024'; // לרוחב — היחס שוורדפרס חותך אליו בכרטיסי הפוסטים
const DEFAULT_QUALITY = 'low';
/** דחיסת ה-WEBP. 80 מוריד תמונה של 1.3MB ל-~50KB בלי הבדל נראה לעין. */
const DEFAULT_COMPRESSION = 80;
/** כמה חלופות מציעים למנהל בעורך. כל חלופה = קריאת תמונה נוספת בתשלום. */
const DEFAULT_OPTION_COUNT = 3;

/**
 * כללי הסצנה. אלה לא העדפות סגנון — כל אחד מהם הוא כשל שראינו או שצפוי:
 * אותיות מעוותות, לוגו מומצא של חברה, או תמונה מפחידה שסותרת את הכלל
 * "דחיפות אמיתית, לא הפחדה" של הבלוגים עצמם.
 *
 * שני כללים כאן קיימים בשביל חותמת הלוגו של שלב 3, ולא בשביל הצילום:
 * האיסור על כל סמל מצויר (כדי שלא יופיעו שני לוגואים), והדרישה לפינה
 * שמאלית-עליונה נקייה (כדי שהחותמת לא תכסה את הפנים או את המכשיר).
 */
const SCENE_RULES = [
  'Photorealistic editorial photograph, as for a professional environmental-services company blog.',
  'A single professional technician or inspector is actively performing the measurement or inspection,',
  'holding or operating a handheld instrument, looking at what they are testing.',
  'Adult, neutral professional appearance, plain work clothing or a plain shirt, natural posture,',
  'anatomically correct hands, hands clearly holding the instrument.',
  'Israeli / Mediterranean setting where a location is implied.',
  'Calm, neutral, well-lit. Never alarming, dramatic, apocalyptic or frightening.',
  'Absolutely no text, letters, words, numbers, captions, labels, signage, logos or watermarks anywhere in the image.',
  'No branded equipment and no invented company marks of any kind.',
  'Keep the upper-left corner of the frame visually quiet and uncluttered — plain wall, sky or background,',
  'with no face, hand or instrument in it.',
  'Natural colors, shallow depth of field, no heavy filters, no illustration or 3D-render look.',
].join(' ');

/** גיאומטריית חותמת הלוגו, כשבר מרוחב התמונה — כדי שתיראה זהה בכל גודל. */
const BADGE_WIDTH_RATIO = 0.155;
const BADGE_MARGIN_RATIO = 0.014;
const BADGE_PAD_RATIO = 0.14;
const BADGE_RADIUS_RATIO = 0.16;

export type BlogImageOption = { dataUrl: string; prompt: string; scene: string };

@Injectable()
export class BlogImageService {
  private readonly logger = new Logger(BlogImageService.name);

  private get imageModel(): string {
    return process.env.BLOG_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  }
  private get promptModel(): string {
    return process.env.BLOG_IMAGE_PROMPT_MODEL || DEFAULT_PROMPT_MODEL;
  }
  private get size(): string {
    return process.env.BLOG_IMAGE_SIZE || DEFAULT_SIZE;
  }
  private get quality(): string {
    return process.env.BLOG_IMAGE_QUALITY || DEFAULT_QUALITY;
  }
  private get timeoutMs(): number {
    return Number(process.env.BLOG_IMAGE_TIMEOUT_MS) || 120_000;
  }
  /** כמה חלופות מייצרים כשלא נאמר אחרת. 0/1 מחזיר תמונה אחת. */
  get optionCount(): number {
    const n = Number(process.env.BLOG_IMAGE_OPTIONS);
    return Number.isFinite(n) && n >= 1 && n <= 6 ? Math.floor(n) : DEFAULT_OPTION_COUNT;
  }

  /** כבוי מפורשות ב-ENV, או בלי מפתח — אין תמונות, והבלוג נוצר בלעדיהן. */
  enabled(): boolean {
    return process.env.BLOG_IMAGE_ENABLED !== '0' && !!process.env.OPENAI_API_KEY;
  }

  /* ── שלב 1: תיאורי סצנה ──────────────────────────────────────────────── */

  /**
   * מאגרי גיוון אקראיים. הבעיה שהם פותרים: גם ב-temperature גבוה, מודל טקסט
   * מתכנס לאותה קומפוזיציה סטריאוטיפית ("טכנאי מול קיר עם מכשיר") כי זה
   * *הפתרון הסביר* לפרומפט צר כמו שלנו — הטמפרטורה משנה ניסוח, לא קומפוזיציה.
   * לכן האקראיות כאן היא שלנו (Math.random), לא של המודל: לכל סצנה נבחר
   * שילוב קונקרטי של דמות/מקום/זווית *לפני* הקריאה למודל, ומכתיבים לו אותו —
   * וכשאין בכלל קריאה למודל (נפילה-חזרה), אותו שילוב בונה את המשפט בעצמו.
   */
  private readonly SUBJECTS = [
    'a young woman technician',
    'a young man technician',
    'a middle-aged woman inspector',
    'a middle-aged man inspector',
    'an experienced older male technician',
    'an experienced older female technician',
  ];
  private readonly SETTINGS = [
    'a bright modern Israeli apartment living room',
    'a home kitchen near the counter',
    'a stairwell of a residential apartment building',
    'a garden or backyard next to an irrigation line',
    'a small office space',
    'a basement utility or boiler room',
    'a sunlit rooftop with a water tank in the background',
    'an underground parking garage',
    'a school or public-building corridor',
    'a bathroom near the water pipes',
    'a bedroom near a wall socket',
    'a building entrance lobby',
  ];
  private readonly ANGLES = [
    'a wide shot showing the full room',
    'a close-up over-the-shoulder shot focused on the instrument display',
    'a low camera angle looking slightly upward',
    'a shot from behind the technician, who faces a wall or fixture',
    'a medium shot at eye level, technician centered',
    'a three-quarter angle shot from one side',
  ];

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** `count` שילובי דמות/מקום/זווית, בלי חזרה על עצמם בתוך אותה קבוצה. */
  private randomDirectives(count: number): { subject: string; setting: string; angle: string }[] {
    const shuffle = <T>(arr: readonly T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const subjects = shuffle(this.SUBJECTS);
    const settings = shuffle(this.SETTINGS);
    const angles = shuffle(this.ANGLES);
    return Array.from({ length: count }, (_, i) => ({
      subject: subjects[i % subjects.length],
      setting: settings[i % settings.length],
      angle: angles[i % angles.length],
    }));
  }

  private fallbackScenes(count: number): string[] {
    return this.randomDirectives(count).map(
      ({ subject, setting, angle }) =>
        `${angle[0].toUpperCase()}${angle.slice(1)} of ${subject} holding a handheld ` +
        `monitoring instrument and reading its small display, in ${setting}, calm natural lighting.`,
    );
  }

  /**
   * מתאר N סצנות *שונות זו מזו* מתוך נושא הבלוג. נכשל → נופלים לתיאורים
   * גנריים, כי תמונה סבירה עדיפה על טיוטה בלי תמונה.
   */
  private async buildScenes(
    title: string,
    topic: string,
    count: number,
    apiKey: string,
  ): Promise<string[]> {
    const fallback = this.fallbackScenes(count);
    const subject = [title, topic].map((s) => (s || '').trim()).filter(Boolean).join(' — ');
    if (!subject) return fallback;

    const directives = this.randomDirectives(count);
    const directiveLines = directives
      .map(
        (d, i) =>
          `Scene ${i + 1} MUST feature ${d.subject}, in ${d.setting}, shown as ${d.angle}. ` +
          `Do not reuse this exact combination in any other scene.`,
      )
      .join('\n');

    try {
      const res = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.promptModel,
          temperature: 0.9, // גבוה בכוונה — חלופות דומות מדי הן בחירה חסרת ערך
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You describe photographs for a blog post of an Israeli environmental testing',
                'company (radon, asbestos, air, water, soil, noise, odour, radiation).',
                `Return JSON: {"scenes": [...]} with exactly ${count} English sentences,`,
                'each 25-45 words, describing only what is visible: place, objects, light, angle.',
                'In EVERY scene one professional technician is actively performing the test with a',
                'handheld instrument — that person is the subject of the photo.',
                'Each scene MUST follow the mandatory subject/setting/angle instruction given for',
                'its number below — do not substitute a generic default instead. The scenes must',
                'read as genuinely different photographs, not the same photo reworded.',
                'Describe concrete scenes, never abstract concepts.',
                'Never mention text, signs, letters, numbers or brands — they are forbidden in the photo.',
                'Keep the upper-left corner of every frame empty and plain.',
                directiveLines,
              ].join('\n'),
            },
            { role: 'user', content: `נושא הבלוג: ${subject}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const parsed = JSON.parse(String(data?.choices?.[0]?.message?.content || '{}'));
      const scenes: string[] = (Array.isArray(parsed?.scenes) ? parsed.scenes : [])
        .map((s: unknown) => String(s || '').trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      if (!scenes.length) throw new Error('no scenes in response');
      // המודל עלול להחזיר פחות מהמבוקש — משלימים מהנפילה-חזרה כדי שהמנהל
      // תמיד יקבל את מספר החלופות שביקש.
      while (scenes.length < count) scenes.push(fallback[scenes.length % fallback.length]);
      return scenes.slice(0, count);
    } catch (e: any) {
      this.logger.warn(`image scene prompt failed (${e?.message}) — using the generic scenes`);
      return fallback;
    }
  }

  /* ── שלב 3: חותמת הלוגו ──────────────────────────────────────────────── */

  private logoPathCache: string | null | undefined;

  /**
   * קובץ הלוגו נשלח לאימג' דרך `assets/` (ראו Dockerfile). מחפשים גם יחסית
   * ל-dist, כי בפרודקשן ה-cwd הוא שורש האפליקציה ובפיתוח הוא שורש הפרויקט.
   */
  private findLogo(): string | null {
    if (this.logoPathCache !== undefined) return this.logoPathCache;
    const candidates = [
      process.env.BLOG_IMAGE_LOGO_PATH,
      path.resolve(process.cwd(), 'assets/blog-logo.png'),
      path.resolve(__dirname, '../../assets/blog-logo.png'),
      path.resolve(__dirname, '../../../assets/blog-logo.png'),
    ].filter(Boolean) as string[];
    this.logoPathCache = candidates.find((p) => fs.existsSync(p)) || null;
    if (!this.logoPathCache) this.logger.warn('blog logo asset not found — images will be unstamped');
    return this.logoPathCache;
  }

  /**
   * חותם את לוגו החברה בפינה השמאלית-העליונה, על גבי לוחית לבנה מעוגלת.
   *
   * לעולם לא זורק: אם sharp או קובץ הלוגו לא זמינים מחזירים את התמונה
   * המקורית. תמונה בלי לוגו עדיפה על בלוג בלי תמונה.
   */
  private async stampLogo(webp: Buffer): Promise<Buffer> {
    const logoPath = this.findLogo();
    if (!logoPath) return webp;
    try {
      // require דינמי: sharp הוא בינארי מקומי, וכשל טעינה שלו לא אמור להפיל
      // את עליית השרת כולו — רק את חותמת הלוגו.
      const sharp = require('sharp');

      const meta = await sharp(webp).metadata();
      const width = Number(meta.width) || 0;
      if (!width) return webp;

      const badge = Math.round(width * BADGE_WIDTH_RATIO);
      const margin = Math.round(width * BADGE_MARGIN_RATIO);
      const pad = Math.round(badge * BADGE_PAD_RATIO);
      const inner = badge - pad * 2;
      const radius = Math.round(badge * BADGE_RADIUS_RATIO);
      if (inner < 8) return webp;

      const plate = Buffer.from(
        `<svg width="${badge}" height="${badge}" xmlns="http://www.w3.org/2000/svg">` +
          `<rect x="0" y="0" width="${badge}" height="${badge}" ` +
          `rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`,
      );
      const logo = await sharp(logoPath)
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const stamp = await sharp(plate)
        .composite([{ input: logo, top: pad, left: pad }])
        .png()
        .toBuffer();

      return await sharp(webp)
        .composite([{ input: stamp, top: margin, left: margin }])
        .webp({ quality: DEFAULT_COMPRESSION })
        .toBuffer();
    } catch (e: any) {
      this.logger.warn(`logo stamp skipped — ${e?.message || e}`);
      return webp;
    }
  }

  /* ── שלב 2 + הרכבה ──────────────────────────────────────────────────── */

  /** מייצר תמונה בודדת מתיאור סצנה. `null` = נכשל, והמתאם מדלג עליה. */
  private async renderScene(scene: string, apiKey: string): Promise<BlogImageOption | null> {
    const prompt = `${scene}\n\n${SCENE_RULES}`;
    try {
      const res = await this.fetchWithTimeout('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.imageModel,
          prompt,
          size: this.size,
          quality: this.quality,
          n: 1,
          // WEBP דחוס — התמונה יורדת מ-~1.3MB ל-~50KB, וזה מה שנטען אצל
          // הקורא בפועל. גודל התמונה הראשית משפיע ישירות על מהירות האתר.
          output_format: 'webp',
          output_compression: DEFAULT_COMPRESSION,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        this.logger.warn(`image generation failed (${res.status}) ${t.slice(0, 200)}`);
        return null;
      }
      const data: any = await res.json();
      const b64 = String(data?.data?.[0]?.b64_json || '');
      if (!b64) {
        this.logger.warn('image generation returned no image');
        return null;
      }
      const stamped = await this.stampLogo(Buffer.from(b64, 'base64'));
      return { dataUrl: `data:image/webp;base64,${stamped.toString('base64')}`, prompt, scene };
    } catch (e: any) {
      const why = e?.name === 'AbortError' ? 'timeout' : e?.message;
      this.logger.warn(`image generation failed - ${why}`);
      return null;
    }
  }

  /**
   * מייצר `count` חלופות ומחזיר את אלה שהצליחו (יכול להיות מערך ריק).
   * החלופות רצות במקביל — 3 סדרתיות היו ~45 שניות, והמנהל מחכה מול המסך.
   */
  async generateMany(
    input: { title?: string; topic?: string; count?: number },
  ): Promise<BlogImageOption[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!this.enabled() || !apiKey) return [];

    const count = Math.min(Math.max(Number(input.count) || 1, 1), 6);
    const started = Date.now();
    const scenes = await this.buildScenes(input.title || '', input.topic || '', count, apiKey);
    const results = await Promise.all(scenes.map((s) => this.renderScene(s, apiKey)));
    const ok = results.filter((r): r is BlogImageOption => !!r);
    this.logger.log(
      `blog images: ${ok.length}/${count} with ${this.imageModel} ` +
        `(${this.quality}/${this.size}) in ${Date.now() - started}ms`,
    );
    return ok;
  }

  /**
   * תמונה בודדת — המסלול של הניסוח היומי האוטומטי, שאין מי שיבחר בו.
   * לעולם לא זורק: `null` = אין תמונה.
   */
  async generate(input: { title?: string; topic?: string }): Promise<BlogImageOption | null> {
    const [first] = await this.generateMany({ ...input, count: 1 });
    return first || null;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
