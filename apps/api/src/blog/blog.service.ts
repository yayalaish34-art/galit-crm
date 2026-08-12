import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/crypto.util';

const SETTINGS_KEY = 'wordpress';
/** מצב הניסוח האוטומטי היומי — תור האישורים + מתי רצה הפעם האחרונה. */
const AUTO_KEY = 'blog_auto_draft';

/** ברירות מחדל לאתר גלית — נשמרות בהגדרות ברגע שמנהל שומר פרטי גישה. */
const DEFAULT_SITE_URL = 'https://galit.co.il';
/** הקטגוריה "בלוגים" שנוצרה באתר. עמוד /blog מסונן אליה, ולכן כל פוסט חייב להשתייך אליה. */
const DEFAULT_CATEGORY_ID = 226;

export type WpCredentials = {
  siteUrl: string;
  username: string;
  appPassword: string;
  categoryId: number;
};

export type BlogPostInput = {
  title?: string;
  /** טקסט גולמי בפורמט הפשוט של העורך (ראו textToBlocks). */
  body?: string;
  excerpt?: string;
  status?: 'draft' | 'publish';
  featuredMediaId?: number | null;
};

/** פריט בתור האישורים — טיוטה שה-AI ניסח לבד וממתינה למנהל. */
export type PendingApproval = {
  postId: number;
  title: string;
  topic: string;
  createdAt: string;
  link: string;
};

/** מצב הניסוח האוטומטי, כפי שהוא נשמר ב-SystemSetting. */
type AutoState = {
  /** התאריך (שעון ישראל, yyyy-mm-dd) שבו כבר נוצרה טיוטה — מונע כפילות באותו יום. */
  lastRunDate: string;
  /** מצביע לרוטציית הנושאים, כדי לא לחזור על אותו נושא יום אחרי יום. */
  topicIndex: number;
  pending: PendingApproval[];
  /** מזהי פוסטים שהמנהל סגר את ההתראה עליהם — לא קופצים שוב. */
  dismissed: number[];
};

const EMPTY_AUTO_STATE: AutoState = {
  lastRunDate: '',
  topicIndex: 0,
  pending: [],
  dismissed: [],
};

export type BlogPostSummary = {
  id: number;
  title: string;
  excerpt: string;
  status: string;
  link: string;
  date: string;
  modified: string;
  featuredMediaId: number;
  featuredMediaUrl: string | null;
};

/**
 * בלוגים — כתיבה ופרסום מה-CRM אל וורדפרס (galit.co.il).
 *
 * וורדפרס הוא מקור האמת: אין טבלה מקומית ואין סנכרון. הפוסטים נוצרים דרך
 * REST API של וורדפרס ומשויכים לקטגוריה "בלוגים", ולכן הם מופיעים מיד בעמוד
 * /blog (שמכיל Query Loop מסונן לקטגוריה) בלי שאף אחד עורך את העמוד.
 *
 * האימות מול וורדפרס הוא Application Password (Basic auth) — לא סיסמת המשתמש.
 * ניתן לבטל אותו בכל רגע מתוך וורדפרס בלי לשנות שום סיסמה אחרת.
 */
@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── פרטי גישה ──────────────────────────────────────────────────────────────

  /** מחזיר את פרטי הגישה השמורים (הסיסמה מפוענחת). null אם לא הוגדרו. */
  async getCredentials(): Promise<WpCredentials | null> {
    const row: any = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    const v = row?.value as any;
    if (!v?.username || !v?.appPasswordEnc) return null;
    let appPassword = '';
    try {
      appPassword = decryptSecret(v.appPasswordEnc);
    } catch {
      appPassword = '';
    }
    if (!appPassword) return null;
    return {
      siteUrl: String(v.siteUrl || DEFAULT_SITE_URL).replace(/\/$/, ''),
      username: String(v.username),
      appPassword,
      categoryId: Number(v.categoryId) || DEFAULT_CATEGORY_ID,
    };
  }

  /** סטטוס למסך ההגדרות — בלי לחשוף את הסיסמה. */
  async getStatus(): Promise<{
    configured: boolean;
    siteUrl: string;
    username: string;
    categoryId: number;
  }> {
    const row: any = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    const v = (row?.value as any) || {};
    return {
      configured: !!(v.username && v.appPasswordEnc),
      siteUrl: String(v.siteUrl || DEFAULT_SITE_URL),
      username: String(v.username || ''),
      categoryId: Number(v.categoryId) || DEFAULT_CATEGORY_ID,
    };
  }

  /**
   * שמירת פרטי גישה. סיסמה ריקה = שמירת הקיימת (כדי שאפשר יהיה לעדכן
   * שם משתמש/כתובת בלי להקליד מחדש את סיסמת האפליקציה).
   */
  async saveCredentials(input: {
    siteUrl?: string;
    username: string;
    appPassword?: string;
    categoryId?: number;
  }): Promise<{ ok: true }> {
    const username = (input.username || '').trim();
    if (!username) throw new BadRequestException('שם משתמש וורדפרס נדרש');

    const existing: any = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    const prev = (existing?.value as any) || {};

    let appPasswordEnc = prev.appPasswordEnc;
    if (input.appPassword && input.appPassword.trim()) {
      // וורדפרס מציג את סיסמת האפליקציה עם רווחים — הם חלק מהתצוגה בלבד.
      appPasswordEnc = encryptSecret(input.appPassword.trim());
    }
    if (!appPasswordEnc) throw new BadRequestException('סיסמת אפליקציה נדרשת');

    const value = {
      siteUrl: (input.siteUrl || prev.siteUrl || DEFAULT_SITE_URL).replace(/\/$/, ''),
      username,
      appPasswordEnc,
      categoryId: Number(input.categoryId) || Number(prev.categoryId) || DEFAULT_CATEGORY_ID,
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
    return { ok: true };
  }

  /** בדיקת חיבור — מאמת את פרטי הגישה ומחזיר את שם המשתמש שזוהה. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const creds = await this.getCredentials();
    if (!creds) return { ok: false, message: 'לא הוגדרו פרטי גישה לוורדפרס' };
    try {
      const me: any = await this.wpFetch(creds, '/wp/v2/users/me?context=edit');
      const roles: string[] = Array.isArray(me?.roles) ? me.roles : [];
      const canPublish = roles.some((r) => ['administrator', 'editor', 'author'].includes(r));
      if (!canPublish) {
        return {
          ok: false,
          message: `המשתמש ${me?.name || creds.username} מחובר אך אין לו הרשאת פרסום`,
        };
      }
      return { ok: true, message: `מחובר כ-${me?.name || creds.username}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'החיבור לוורדפרס נכשל' };
    }
  }

  // ── תור האישורים של הניסוח האוטומטי ────────────────────────────────────────

  async getAutoState(): Promise<AutoState> {
    const row: any = await this.prisma.systemSetting
      .findUnique({ where: { key: AUTO_KEY } })
      .catch(() => null);
    const v = (row?.value as any) || {};
    return {
      lastRunDate: String(v.lastRunDate || ''),
      topicIndex: Number(v.topicIndex) || 0,
      pending: Array.isArray(v.pending) ? v.pending : [],
      dismissed: Array.isArray(v.dismissed) ? v.dismissed.map(Number) : [],
    };
  }

  async saveAutoState(state: AutoState): Promise<void> {
    // גוזמים את ההיסטוריה של ה-dismissed כדי שהשורה לא תתפח בלי גבול.
    const value = { ...state, dismissed: state.dismissed.slice(-200) };
    await this.prisma.systemSetting.upsert({
      where: { key: AUTO_KEY },
      create: { key: AUTO_KEY, value },
      update: { value },
    });
  }

  /**
   * הטיוטות האוטומטיות שעדיין ממתינות לאישור — זה מה שמקפיץ את הפופ-אפ.
   *
   * וורדפרס הוא מקור האמת: כל פריט נבדק מולו, ומי שכבר פורסם / נמחק / נערך
   * לסטטוס אחר יורד מהתור מעצמו. כך "פרסמתי את הבלוג" מכבה את ההתראה בלי
   * שנצטרך לסנכרן שני מקומות, וגם מחיקה ישירות מוורדפרס לא משאירה רוח רפאים.
   */
  async listPendingApprovals(): Promise<PendingApproval[]> {
    const state = await this.getAutoState();
    if (!state.pending.length) return [];
    const creds = await this.getCredentials();
    if (!creds) return [];

    const alive: PendingApproval[] = [];
    for (const item of state.pending) {
      if (state.dismissed.includes(Number(item.postId))) continue;
      try {
        const p: any = await this.wpFetch(creds, `/wp/v2/posts/${item.postId}?context=edit`);
        if (String(p?.status) !== 'draft') continue; // פורסם / נזרק לפח — כבר לא ממתין
        alive.push({ ...item, title: this.stripTags(p?.title?.raw || item.title), link: String(p?.link || item.link) });
      } catch {
        continue; // 404 או שגיאה — לא מחזיקים פריט מת בתור
      }
    }

    // כתיבה חזרה רק אם משהו באמת ירד מהתור — שמירה מיותרת בכל poll היא בזבוז.
    if (alive.length !== state.pending.filter((p) => !state.dismissed.includes(Number(p.postId))).length) {
      await this.saveAutoState({ ...state, pending: alive }).catch(() => undefined);
    }
    return alive;
  }

  /** המנהל סגר את ההתראה — הטיוטה נשארת בוורדפרס, רק מפסיקה לקפוץ. */
  async dismissApproval(postId: number): Promise<{ ok: true }> {
    const state = await this.getAutoState();
    await this.saveAutoState({
      ...state,
      pending: state.pending.filter((p) => Number(p.postId) !== Number(postId)),
      dismissed: [...state.dismissed, Number(postId)],
    });
    return { ok: true };
  }

  // ── קריאה לוורדפרס ─────────────────────────────────────────────────────────

  /** קריאה ל-REST API של וורדפרס עם Basic auth. זורק הודעה בעברית בכישלון. */
  private async wpFetch(creds: WpCredentials, path: string, init?: RequestInit): Promise<any> {
    const url = `${creds.siteUrl}/wp-json${path}`;
    const auth = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json; charset=utf-8',
          ...(init?.headers || {}),
        },
      });
    } catch (e: any) {
      this.logger.error(`WP request failed: ${path} — ${e?.message}`);
      throw new BadRequestException('לא ניתן להתחבר לאתר וורדפרס');
    }

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const code = data?.code || '';
      // הודעות ידידותיות לתקלות הנפוצות
      if (res.status === 401) {
        throw new BadRequestException(
          code === 'invalid_username'
            ? 'שם המשתמש בוורדפרס שגוי'
            : 'סיסמת האפליקציה שגויה או בוטלה — צרו חדשה בוורדפרס',
        );
      }
      if (res.status === 403) throw new BadRequestException('אין הרשאה לבצע את הפעולה בוורדפרס');
      throw new BadRequestException(data?.message || `וורדפרס החזיר שגיאה (${res.status})`);
    }
    return data;
  }

  // ── פוסטים ─────────────────────────────────────────────────────────────────

  private async requireCreds(): Promise<WpCredentials> {
    const creds = await this.getCredentials();
    if (!creds) {
      throw new BadRequestException(
        'החיבור לוורדפרס לא הוגדר — הזינו פרטי גישה בהגדרות לפני כתיבת בלוג',
      );
    }
    return creds;
  }

  /** רשימת הבלוגים (טיוטות + מפורסמים) מהקטגוריה "בלוגים". */
  async listPosts(opts?: { status?: string; search?: string }): Promise<BlogPostSummary[]> {
    const creds = await this.requireCreds();
    const params = new URLSearchParams({
      categories: String(creds.categoryId),
      per_page: '50',
      orderby: 'modified',
      order: 'desc',
      context: 'edit',
      status: opts?.status && opts.status !== 'all' ? opts.status : 'publish,draft,pending,future',
      _embed: 'wp:featuredmedia',
    });
    if (opts?.search) params.set('search', opts.search);

    const rows: any[] = await this.wpFetch(creds, `/wp/v2/posts?${params.toString()}`);
    return (rows || []).map((p) => this.toSummary(p));
  }

  private toSummary(p: any): BlogPostSummary {
    const media = p?._embedded?.['wp:featuredmedia']?.[0];
    return {
      id: Number(p.id),
      title: this.stripTags(p?.title?.rendered || p?.title?.raw || ''),
      excerpt: this.stripTags(p?.excerpt?.rendered || ''),
      status: String(p.status || ''),
      link: String(p.link || ''),
      date: String(p.date || ''),
      modified: String(p.modified || ''),
      featuredMediaId: Number(p.featured_media || 0),
      featuredMediaUrl: media?.source_url ? String(media.source_url) : null,
    };
  }

  /** פוסט בודד — מוחזר בפורמט העורך (טקסט פשוט), לא בבלוקים. */
  async getPost(id: number): Promise<{
    id: number;
    title: string;
    body: string;
    excerpt: string;
    status: string;
    link: string;
    featuredMediaId: number;
    featuredMediaUrl: string | null;
  }> {
    const creds = await this.requireCreds();
    const p: any = await this.wpFetch(
      creds,
      `/wp/v2/posts/${id}?context=edit&_embed=wp:featuredmedia`,
    );
    const media = p?._embedded?.['wp:featuredmedia']?.[0];
    return {
      id: Number(p.id),
      title: this.decodeEntities(p?.title?.raw ?? this.stripTags(p?.title?.rendered || '')),
      body: this.blocksToText(String(p?.content?.raw || '')),
      excerpt: this.decodeEntities(p?.excerpt?.raw || ''),
      status: String(p.status || ''),
      link: String(p.link || ''),
      featuredMediaId: Number(p.featured_media || 0),
      featuredMediaUrl: media?.source_url ? String(media.source_url) : null,
    };
  }

  /** יצירת בלוג חדש. תמיד משויך לקטגוריה "בלוגים" כדי שיופיע בעמוד /blog. */
  async createPost(input: BlogPostInput): Promise<{ id: number; link: string; status: string }> {
    const creds = await this.requireCreds();
    const title = (input.title || '').trim();
    if (!title) throw new BadRequestException('כותרת נדרשת');

    const payload: any = {
      title,
      content: this.textToBlocks(input.body || ''),
      excerpt: (input.excerpt || '').trim(),
      status: input.status === 'publish' ? 'publish' : 'draft',
      categories: [creds.categoryId],
    };
    if (input.featuredMediaId) payload.featured_media = Number(input.featuredMediaId);

    const p: any = await this.wpFetch(creds, '/wp/v2/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { id: Number(p.id), link: String(p.link || ''), status: String(p.status || '') };
  }

  /** עדכון בלוג קיים. שדות שלא נשלחו נשארים כמו שהם. */
  async updatePost(
    id: number,
    input: BlogPostInput,
  ): Promise<{ id: number; link: string; status: string }> {
    const creds = await this.requireCreds();
    const payload: any = {};
    if (typeof input.title === 'string') {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('כותרת נדרשת');
      payload.title = title;
    }
    if (typeof input.body === 'string') payload.content = this.textToBlocks(input.body);
    if (typeof input.excerpt === 'string') payload.excerpt = input.excerpt.trim();
    if (input.status) payload.status = input.status === 'publish' ? 'publish' : 'draft';
    if (input.featuredMediaId !== undefined) {
      payload.featured_media = input.featuredMediaId ? Number(input.featuredMediaId) : 0;
    }
    // שמירה על השיוך לקטגוריה גם בעריכה — אחרת הפוסט "ייעלם" מעמוד הבלוגים.
    payload.categories = [creds.categoryId];

    const p: any = await this.wpFetch(creds, `/wp/v2/posts/${id}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { id: Number(p.id), link: String(p.link || ''), status: String(p.status || '') };
  }

  /** מחיקה — לפח האשפה של וורדפרס (הפיך), לא מחיקה סופית. */
  async deletePost(id: number): Promise<{ ok: true }> {
    const creds = await this.requireCreds();
    await this.wpFetch(creds, `/wp/v2/posts/${id}`, { method: 'DELETE' });
    return { ok: true };
  }

  /**
   * העלאת תמונה ראשית. מקבלת data URL מהדפדפן (base64) כדי להימנע מ-multipart,
   * ומחזירה את מזהה המדיה בוורדפרס.
   */
  async uploadMedia(dataUrl: string, filename: string): Promise<{ id: number; url: string }> {
    const creds = await this.requireCreds();
    const m = /^data:([^;,]+);base64,(.+)$/i.exec((dataUrl || '').trim());
    if (!m) throw new BadRequestException('קובץ תמונה לא תקין');
    const mime = m[1].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      throw new BadRequestException('סוג תמונה לא נתמך (JPG / PNG / WEBP / GIF בלבד)');
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw new BadRequestException('התמונה גדולה מ-8MB');

    const safeName = (filename || 'blog-image').replace(/[^\w.\-]+/g, '-').slice(0, 80);
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const finalName = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.${ext}`;

    const auth = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
    const res = await fetch(`${creds.siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${finalName}"`,
      },
      body: buf,
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new BadRequestException(data?.message || 'העלאת התמונה לוורדפרס נכשלה');
    return { id: Number(data.id), url: String(data.source_url || '') };
  }

  // ── המרת טקסט לבלוקים של וורדפרס ───────────────────────────────────────────

  /**
   * ממיר את הטקסט הפשוט של העורך לבלוקים תקניים של וורדפרס (Gutenberg).
   * זה מה שמאפשר לערוך את הבלוג גם באתר עצמו אחר כך, ולא רק ב-CRM.
   *
   *   ## כותרת      → כותרת H2
   *   ### כותרת     → כותרת H3
   *   - פריט        → רשימת תבליטים
   *   שורה ריקה     → פסקה חדשה
   */
  textToBlocks(text: string): string {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: string[] = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      const html = paragraph.map((l) => this.escapeHtml(l)).join('<br>');
      blocks.push(`<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list.length) return;
      const items = list
        .map((l) => `<!-- wp:list-item -->\n<li>${this.escapeHtml(l)}</li>\n<!-- /wp:list-item -->`)
        .join('\n');
      blocks.push(`<!-- wp:list -->\n<ul>\n${items}\n</ul>\n<!-- /wp:list -->`);
      list = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        flushParagraph();
        continue;
      }
      const heading = /^(#{2,3})\s+(.*)$/.exec(line);
      if (heading) {
        flushList();
        flushParagraph();
        const level = heading[1].length; // 2 או 3
        blocks.push(
          `<!-- wp:heading {"level":${level}} -->\n<h${level}>${this.escapeHtml(heading[2])}</h${level}>\n<!-- /wp:heading -->`,
        );
        continue;
      }
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) {
        flushParagraph();
        list.push(bullet[1]);
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    flushList();
    flushParagraph();
    return blocks.join('\n\n');
  }

  /** הכיוון ההפוך — כדי שעריכה של בלוג קיים תיפתח בעורך בפורמט קריא. */
  blocksToText(raw: string): string {
    if (!raw) return '';
    const parts: string[] = [];
    const re = /<!--\s*wp:(paragraph|heading|list)([^>]*?)-->([\s\S]*?)<!--\s*\/wp:\1\s*-->/g;
    let m: RegExpExecArray | null;
    let matched = false;
    while ((m = re.exec(raw))) {
      matched = true;
      const kind = m[1];
      const inner = m[3];
      if (kind === 'paragraph') {
        const t = this.stripTags(inner.replace(/<br\s*\/?>/gi, '\n'));
        if (t.trim()) parts.push(t.trim());
      } else if (kind === 'heading') {
        const lvl = /"level":(\d)/.exec(m[2] || '')?.[1] || '2';
        const t = this.stripTags(inner).trim();
        if (t) parts.push(`${'#'.repeat(Number(lvl))} ${t}`);
      } else {
        const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) =>
          this.stripTags(x[1]).trim(),
        );
        if (items.length) parts.push(items.map((i) => `- ${i}`).join('\n'));
      }
    }
    // תוכן שנוצר מחוץ ל-CRM (או פוסט ישן) — מציגים כטקסט נקי במקום לאבד אותו.
    if (!matched) return this.stripTags(raw).trim();
    return parts.join('\n\n');
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private stripTags(s: string): string {
    return this.decodeEntities(String(s).replace(/<[^>]*>/g, ''));
  }

  private decodeEntities(s: string): string {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&#8211;/g, '–')
      .replace(/&#8217;/g, '’')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  // ── ניסוח בעזרת AI ─────────────────────────────────────────────────────────

  /**
   * מנסח טיוטת בלוג. מחזיר כותרת, תקציר וגוף בפורמט העורך — כדי שהמנהל
   * יערוך ויאשר, ולא כדי לפרסם אוטומטית.
   */
  async aiDraft(input: {
    topic: string;
    audience?: string;
    tone?: string;
    length?: 'short' | 'medium' | 'long';
    notes?: string;
  }): Promise<{ title: string; excerpt: string; body: string }> {
    const topic = (input.topic || '').trim();
    if (!topic) throw new BadRequestException('נושא נדרש');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('ניסוח AI אינו מוגדר בשרת — חסר OPENAI_API_KEY');
    }

    const words =
      input.length === 'short' ? '250-350' : input.length === 'long' ? '800-1100' : '450-650';

    const system = [
      'אתה כותב תוכן שיווקי-מקצועי עבור "גלית — החברה לאיכות הסביבה", חברה ישראלית',
      'המתמחה בבדיקות וניטור סביבתיים: ראדון, אסבסט, איכות אוויר, מים, קרקע, רעש, ריח,',
      'קרינה, הדברה ובנייה ירוקה. החברה מוסמכת ISO 17025.',
      '',
      'המטרה: הקורא צריך לסיים את הבלוג עם הבנה ברורה שיש לו *צורך* בבדיקה —',
      'לא עם עוד ידע כללי. בלוג שמסביר יפה ולא מייצר צורך נחשב כישלון.',
      '',
      'איך מייצרים צורך (זה עיקר העבודה):',
      '- פתח בבעיה של הקורא, לא בהגדרה אנציקלופדית. "מה שלא רואים בבית שלך" ולא "ראדון הוא גז".',
      '- הראה שזה נוגע *אליו*: מי בסיכון, אילו מבנים, אילו אזורים, אילו מצבים בחיים.',
      '- הפוך את הסיכון למוחשי — מה קורה בפועל כשלא בודקים, ומה מתגלה מאוחר מדי.',
      '- ציין את רגעי ההכרח: לפני רכישת דירה, לפני ולאחר שיפוץ, בכניסה לנכס, מול',
      '  דרישת רשות/ועדה/רישוי עסק, אחרי תלונות דיירים, בבדיקה תקופתית.',
      '- הסבר למה זה לא נבדק לבד ולא במכשיר מהאינטרנט: נדרשת מעבדה מוסמכת ISO 17025,',
      '  ציוד מכויל ופרשנות מקצועית של התוצאה.',
      '- הדגש שהבדיקה זולה ומהירה ביחס למחיר של לגלות מאוחר.',
      '- סיים בפסקת "מה עושים עכשיו" — קריאה לפעולה ברורה לפנות לגלית לבדיקה או ייעוץ.',
      '',
      'גבולות (הפרה שלהם פוסלת את הבלוג):',
      '- כתוב בעברית תקנית, בגוף שלישי או פנייה ישירה מנומסת. בלי סלנג.',
      '- דחיפות אמיתית, לא הפחדה. בלי "סכנת חיים", בלי אימה, בלי אזהרות דרמטיות.',
      '- אל תמציא נתונים, תקנים, מספרים, אחוזים, מחקרים או שמות לקוחות.',
      '- אם נדרש נתון שאינך בטוח בו — נסח כללית ("ריכוזים גבוהים", "במקרים מסוימים")',
      '  במקום להמציא מספר. עדיף בלי נתון מאשר עם נתון שגוי.',
      '- אל תבטיח תוצאות רפואיות ואל תיתן ייעוץ רפואי או אבחנה.',
      '- אל תמציא חובה חוקית שאינך בטוח בה. אם לא בטוח — "במקרים מסוימים נדרשת בדיקה"',
      '  ולא "החוק מחייב".',
      `- אורך הגוף: ${words} מילים בערך.`,
      '',
      'פורמט הגוף (חשוב מאוד — זה הפורמט של העורך):',
      '- "## " בתחילת שורה = כותרת משנה.',
      '- "### " = כותרת משנה קטנה יותר.',
      '- "- " בתחילת שורה = פריט ברשימת תבליטים.',
      '- שורה ריקה מפרידה בין פסקאות.',
      '- אל תשתמש ב-HTML, ב-Markdown אחר (בלי **הדגשה**) או בטבלאות.',
    ].join('\n');

    const user = [
      `נושא הבלוג: ${topic}`,
      input.audience ? `קהל היעד: ${input.audience}` : '',
      input.tone ? `טון: ${input.tone}` : '',
      input.notes ? `דגשים נוספים: ${input.notes}` : '',
      '',
      'החזר JSON בלבד במבנה:',
      '{"title": "כותרת שמדברת אל הצורך של הקורא — לא כותרת אנציקלופדית",',
      ' "excerpt": "1-2 משפטים שאומרים למי זה רלוונטי ולמה כדאי לו לקרוא עכשיו",',
      ' "body": "גוף הבלוג בפורמט שתואר, כולל פסקת «מה עושים עכשיו» בסוף"}',
    ]
      .filter(Boolean)
      .join('\n');

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.6,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e: any) {
      this.logger.error(`AI draft request failed — ${e?.message}`);
      throw new BadRequestException('הפנייה לשירות הניסוח נכשלה');
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      this.logger.error(`AI draft failed (${res.status}) ${t.slice(0, 300)}`);
      throw new BadRequestException('ניסוח הבלוג נכשל — נסו שוב');
    }

    const data: any = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content || '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadRequestException('התקבלה תשובה לא תקינה משירות הניסוח');
    }

    return {
      title: String(parsed?.title || '').trim(),
      excerpt: String(parsed?.excerpt || '').trim(),
      body: String(parsed?.body || '').trim(),
    };
  }

  /**
   * "נסח מחדש" — לוקח בלוג קיים ומחזיר גרסה משופרת, עם הנחיה חופשית של המנהל
   * ("קצר יותר", "פחות שיווקי", "הוסף פסקה על תקן ישראלי"). זה המסלול שמאפשר
   * לתקן טיוטה אוטומטית בלי להתחיל מאפס ובלי לאבד את מה שכבר טוב בה.
   */
  async aiRewrite(input: {
    title: string;
    body: string;
    instruction?: string;
  }): Promise<{ title: string; excerpt: string; body: string }> {
    const title = (input.title || '').trim();
    const body = (input.body || '').trim();
    if (!title && !body) throw new BadRequestException('אין תוכן לנסח מחדש');

    const instruction = (input.instruction || '').trim();
    return this.aiDraft({
      topic: title || 'שיפור הבלוג המצורף',
      notes: [
        'זהו ניסוח מחדש של בלוג קיים — שמור על הנושא ועל העובדות שבו.',
        instruction ? `הנחיית העורך: ${instruction}` : 'שפר ניסוח, זרימה ובהירות.',
        '',
        'הבלוג הקיים:',
        `כותרת: ${title}`,
        body,
      ].join('\n'),
    });
  }
}
