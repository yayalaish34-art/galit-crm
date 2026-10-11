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
 * **ארבעה שלבים בכוונה:**
 *  1. מודל טקסט זול הופך את נושא הבלוג (עברית) לתיאורי סצנה באנגלית;
 *  2. מודל תמונה זול מצייר כל סצנה — הטכנאי/ית תמיד במדים: חולצה לבנה אחידה;
 *  3. הלוגו האמיתי נחתם על התמונה בקוד (sharp) — לא מצויר ע"י המודל — בפינה השמאלית-עליונה;
 *  4. ניסיון נוסף, best-effort, לחתום את אותו לוגו גם על החזה של החולצה: מודל
 *     ראייה מאתר האם יש אזור חזה פנוי (לא מוסתר ע"י יד/מכשיר/זווית גב), ורק
 *     אם כן — הלוגו נחתם שם too. נכשל השלב הזה (לא זוהה אזור, או שגיאת רשת) →
 *     ממשיכים בלי לוגו על החזה; זו לא סיבה לוותר על כל התמונה.
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
  'Adult, neutral professional appearance, wearing a company uniform: a plain, solid WHITE shirt',
  '(collared polo or button-up work shirt), clean and well-fitted, no other clothing colors visible on top.',
  'Natural posture, anatomically correct hands, hands clearly holding the instrument.',
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
   * מיקום הצעה לחתימת הלוגו על החזה: מרכז (x,y) כשבר מרוחב/גובה התמונה,
   * ורוחב מוצע ללוגו כשבר מרוחב התמונה. `null` = אין אזור חזה פנוי בתמונה
   * הזו (למשל צילום מהגב, תקריב על הידיים/המכשיר בלבד, או שהחזה מוסתר).
   */
  private async detectChestRegion(
    webp: Buffer,
    apiKey: string,
  ): Promise<{ x: number; y: number; widthRatio: number } | null> {
    try {
      const dataUrl = `data:image/webp;base64,${webp.toString('base64')}`;
      const res = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.promptModel,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You locate where a small round logo patch could be placed on a person\'s',
                'upper-chest, over a plain white uniform shirt, in a photograph — like a printed',
                'or embroidered company logo on a work shirt.',
                'Return strict JSON: {"visible": boolean, "x": number, "y": number, "widthRatio": number}.',
                '"visible" must be false whenever there is no clear, unobstructed, mostly front-facing',
                'chest area of a plain shirt in frame — for example: the person is shot from behind,',
                'the frame is a close-up on hands/instrument only with no chest visible, an arm/hand/the',
                'instrument covers the chest, or the torso is turned too far sideways.',
                'When visible is true: "x" and "y" are the center of a good spot for the patch, each a',
                'fraction from 0 to 1 of the image width/height (0,0 is the top-left corner).',
                '"widthRatio" is a sensible patch width as a fraction of the image width, normally',
                'between 0.06 and 0.11. Never place it over a face, hand or the instrument.',
              ].join(' '),
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Locate the chest-logo placement for this photo, if any.' },
                { type: 'image_url', image_url: { url: dataUrl } },
              ] as any,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const parsed = JSON.parse(String(data?.choices?.[0]?.message?.content || '{}'));
      if (!parsed?.visible) return null;
      const x = Number(parsed.x);
      const y = Number(parsed.y);
      const widthRatio = Number(parsed.widthRatio);
      if (![x, y, widthRatio].every(Number.isFinite)) return null;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x, y, widthRatio: Math.min(Math.max(widthRatio, 0.05), 0.14) };
    } catch (e: any) {
      this.logger.warn(`chest logo detection skipped — ${e?.message || e}`);
      return null;
    }
  }

  /**
   * חותם את לוגו החברה בפינה השמאלית-העליונה (על גבי לוחית לבנה מעוגלת),
   * ואם `chest` ניתן — גם על אזור החזה שזוהה, ישירות (בלי לוחית), כך שייראה
   * כמו הדפס/רקמה על הבד ולא כמו מדבקה.
   *
   * לעולם לא זורק: אם sharp או קובץ הלוגו לא זמינים מחזירים את התמונה
   * המקורית. תמונה בלי לוגו עדיפה על בלוג בלי תמונה.
   */
  private async stampLogo(
    webp: Buffer,
    chest: { x: number; y: number; widthRatio: number } | null = null,
  ): Promise<Buffer> {
    const logoPath = this.findLogo();
    if (!logoPath) return webp;
    try {
      // require דינמי: sharp הוא בינארי מקומי, וכשל טעינה שלו לא אמור להפיל
      // את עליית השרת כולו — רק את חותמת הלוגו.
      const sharp = require('sharp');

      const meta = await sharp(webp).metadata();
      const width = Number(meta.width) || 0;
      const height = Number(meta.height) || 0;
      if (!width || !height) return webp;

      const composites: { input: Buffer; top: number; left: number }[] = [];

      const badge = Math.round(width * BADGE_WIDTH_RATIO);
      const margin = Math.round(width * BADGE_MARGIN_RATIO);
      const pad = Math.round(badge * BADGE_PAD_RATIO);
      const inner = badge - pad * 2;
      const radius = Math.round(badge * BADGE_RADIUS_RATIO);
      if (inner >= 8) {
        const plate = Buffer.from(
          `<svg width="${badge}" height="${badge}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect x="0" y="0" width="${badge}" height="${badge}" ` +
            `rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`,
        );
        const cornerLogo = await sharp(logoPath)
          .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const stamp = await sharp(plate)
          .composite([{ input: cornerLogo, top: pad, left: pad }])
          .png()
          .toBuffer();
        composites.push({ input: stamp, top: margin, left: margin });
      }

      if (chest) {
        const chestWidth = Math.round(width * chest.widthRatio);
        if (chestWidth >= 8) {
          const chestLogo = await sharp(logoPath)
            .resize(chestWidth, chestWidth, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          const left = Math.min(Math.max(Math.round(width * chest.x - chestWidth / 2), 0), width - chestWidth);
          const top = Math.min(Math.max(Math.round(height * chest.y - chestWidth / 2), 0), height - chestWidth);
          composites.push({ input: chestLogo, top, left });
        }
      }

      if (!composites.length) return webp;
      return await sharp(webp).composite(composites).webp({ quality: DEFAULT_COMPRESSION }).toBuffer();
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
      const raw = Buffer.from(b64, 'base64');
      const chest = await this.detectChestRegion(raw, apiKey);
      const stamped = await this.stampLogo(raw, chest);
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
