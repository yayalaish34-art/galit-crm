import { Injectable, Logger } from '@nestjs/common';

/** מקור אמיתי שנמצא בחיפוש — עם קישור שאפשר לשים בבלוג. */
export interface ResearchSource {
  /** כתובת מלאה, מנוקה מפרמטרי מעקב. */
  url: string;
  title: string;
  /** הדומיין בצורה קריאה — מוצג לקורא ליד הקישור. */
  publisher: string;
}

export interface ResearchResult {
  /** מה נמצא בפועל, מסודר לפי זווית חיפוש — נכנס להקשר של הכותב. */
  findings: string;
  sources: ResearchSource[];
  /** כמה זוויות חיפוש הצליחו — לדיווח למנהל וללוג. */
  anglesSucceeded: number;
  anglesTotal: number;
}

/**
 * זוויות החיפוש. כל זווית היא קריאת web_search נפרדת, כי חיפוש אחד מחזיר
 * מקור אחד דומיננטי — ארבעה חיפושים מכיוונים שונים הם מה שמייצר *מגוון*
 * מקורות, וזו כל הנקודה: בלוג עם ארבעה לינקים לאותו אתר אינו מבוסס מקורות.
 */
const ANGLES: ReadonlyArray<{ key: string; label: string; ask: (topic: string) => string }> = [
  {
    key: 'regulation',
    label: 'רגולציה ותקינה בישראל',
    ask: (t) =>
      `חפש מקורות רשמיים ישראליים בנושא "${t}": חוקים, תקנות, תקנים ישראליים, ` +
      `הנחיות המשרד להגנת הסביבה, משרד הבריאות, מכון התקנים או רשויות מקומיות. ` +
      `ציין מה בדיוק נדרש, מאיזה גוף, ומה מספר התקן או התקנה אם מופיע.`,
  },
  {
    key: 'health',
    label: 'בריאות וסיכונים — גופים בינלאומיים',
    ask: (t) =>
      `חפש מה אומרים גופי בריאות וסביבה בינלאומיים על "${t}" — WHO, EPA, CDC, IARC, IAEA, ` +
      `הנציבות האירופית. התמקד בערכי סף, ברמות פעולה מומלצות ובמה שידוע על ההשפעה הבריאותית. ` +
      `צטט מספרים ויחידות מדידה רק אם הם מופיעים במפורש במקור.`,
  },
  {
    key: 'method',
    label: 'שיטות בדיקה ומדידה',
    ask: (t) =>
      `חפש איך בודקים ומודדים בפועל בנושא "${t}": שיטות דיגום, משך בדיקה, ציוד, ` +
      `דרישות ממעבדה מוסמכת ותקני ISO רלוונטיים (למשל ISO/IEC 17025). ` +
      `הסבר מה מבדיל בדיקה מקצועית מבדיקה עצמית.`,
  },
  {
    key: 'context',
    label: 'ההקשר הישראלי המעשי',
    ask: (t) =>
      `חפש נתונים והקשר ישראלי בנושא "${t}": מתי הנושא עולה בפועל (רכישת נכס, שיפוץ, ` +
      `רישוי עסק, תלונות דיירים), אילו אזורים או סוגי מבנים רלוונטיים, והנחיות מעשיות ` +
      `שפרסמו גופים רשמיים בישראל.`,
  },
];

/**
 * דומיינים שמותר לקשר אליהם — רשויות, גופי בריאות בינלאומיים, תקינה ואקדמיה.
 *
 * זו רשימת *היתר* ולא רשימת חסימה, בכוונה: הבלוג הוא של גלית, וקישור לאתר של
 * חברת בדיקות מתחרה הוא נזק ישיר. כל מה שאינו ברשימה נזרק — עדיף בלוג עם
 * שלושה מקורות רשמיים מאשר עם שמונה קישורים שאחד מהם למתחרה.
 */
const ALLOWED_SUFFIXES: readonly string[] = [
  '.gov.il',
  '.gov',
  '.edu',
  '.ac.il',
  '.int',
  '.europa.eu',
  '.gov.uk',
  '.edu.au',
  '.gc.ca',
];
const ALLOWED_DOMAINS: readonly string[] = [
  'who.int',
  'iarc.fr',
  'iarc.who.int',
  'epa.gov',
  'cdc.gov',
  'niosh.cdc.gov',
  'osha.gov',
  'nih.gov',
  'ncbi.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov',
  'iaea.org',
  'icrp.org',
  'unep.org',
  'un.org',
  'oecd.org',
  'iso.org',
  'sii.org.il',
  'eea.europa.eu',
  'hse.gov.uk',
  'ukhsa.gov.uk',
  'anses.fr',
  'umweltbundesamt.de',
  'rivm.nl',
  'iec.ch',
  'cen.eu',
  'nature.com',
  'thelancet.com',
  'bmj.com',
  'springer.com',
];
/** מוסר תמיד — האתר של גלית עצמה. מצטבר עם חסימות נקודתיות מ-ENV. */
const ALWAYS_BLOCKED: readonly string[] = ['galit.co.il'];

@Injectable()
export class BlogResearchService {
  private readonly logger = new Logger(BlogResearchService.name);

  private get model(): string {
    return process.env.BLOG_RESEARCH_MODEL || 'gpt-4.1';
  }
  /** תקרת זמן לכל זווית — חיפוש תקוע לא יתקע את כל הניסוח. */
  private get timeoutMs(): number {
    return Number(process.env.BLOG_RESEARCH_TIMEOUT_MS) || 90_000;
  }
  private get extraAllowed(): string[] {
    return (process.env.BLOG_RESEARCH_ALLOWED_DOMAINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  private get extraBlocked(): string[] {
    return (process.env.BLOG_RESEARCH_BLOCKED_DOMAINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /** האם מותר לקשר לכתובת הזו. */
  isAllowed(url: string): boolean {
    const host = this.hostOf(url);
    if (!host) return false;
    const blocked = [...ALWAYS_BLOCKED, ...this.extraBlocked];
    if (blocked.some((b) => host === b || host.endsWith('.' + b))) return false;
    const allowed = [...ALLOWED_DOMAINS, ...this.extraAllowed];
    if (allowed.some((d) => host === d || host.endsWith('.' + d))) return true;
    // הסיומת נבדקת גם כדומיין בפני עצמו: `gov.il` הוא האתר הממשלתי הישראלי
    // המרכזי, ובדיקת endsWith('.gov.il') בלבד הייתה חוסמת דווקא אותו.
    return ALLOWED_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
  }

  /** מנקה פרמטרי מעקב ש-OpenAI מוסיף (utm_source=openai) ועוגנים. */
  private cleanUrl(url: string): string {
    try {
      const u = new URL(url);
      for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        u.searchParams.delete(p);
      }
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  /** קריאת web_search אחת. מחזירה את הטקסט ואת הציטוטים האמיתיים. */
  private async searchOnce(
    angle: (typeof ANGLES)[number],
    topic: string,
    apiKey: string,
  ): Promise<{ text: string; sources: ResearchSource[] } | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: this.model,
          tools: [{ type: 'web_search' }],
          input: [
            angle.ask(topic),
            '',
            'הנחיות: העדף מקורות רשמיים — אתרי ממשלה, רשויות, גופי בריאות בינלאומיים,',
            'מכוני תקינה ומחקר אקדמי. אל תסתמך על אתרים מסחריים ואל תצטט חברות בדיקות.',
            'החזר 3-6 ממצאים קצרים בעברית, כל ממצא בשורה נפרדת שמתחילה במקף,',
            'וכל ממצא חייב להיות משהו שכתוב במקור ולא פרשנות שלך.',
          ].join('\n'),
        }),
      });
      if (!res.ok) {
        this.logger.warn(`research angle "${angle.key}" -> HTTP ${res.status}`);
        return null;
      }
      const data: any = await res.json();
      const messages = (data?.output || []).filter((o: any) => o?.type === 'message');
      const contents = messages.flatMap((m: any) => m?.content || []);
      const text = contents
        .map((c: any) => c?.text || '')
        .join('\n')
        .trim();
      const sources: ResearchSource[] = [];
      for (const ann of contents.flatMap((c: any) => c?.annotations || [])) {
        const url = String(ann?.url || '');
        if (!url) continue;
        const clean = this.cleanUrl(url);
        if (!this.isAllowed(clean)) continue;
        sources.push({
          url: clean,
          title: String(ann?.title || '').trim() || this.hostOf(clean),
          publisher: this.hostOf(clean),
        });
      }
      return { text, sources };
    } catch (e: any) {
      const why = e?.name === 'AbortError' ? 'timeout' : e?.message;
      this.logger.warn(`research angle "${angle.key}" failed - ${why}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * מחקר מלא לנושא: כל הזוויות במקביל, ואז סינון ומגוון.
   *
   * לא זורק. מחקר שנכשל לגמרי מחזיר תוצאה ריקה, והכותב ממשיך בלי מקורות —
   * עדיף בלוג בלי לינקים מאשר טיוטה יומית שלא נוצרה בכלל.
   */
  async research(topic: string): Promise<ResearchResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !topic.trim()) {
      return { findings: '', sources: [], anglesSucceeded: 0, anglesTotal: ANGLES.length };
    }

    const started = Date.now();
    const results = await Promise.all(ANGLES.map((a) => this.searchOnce(a, topic, apiKey)));

    const findingParts: string[] = [];
    const byDomain = new Map<string, ResearchSource[]>();
    let ok = 0;

    results.forEach((r, i) => {
      if (!r) return;
      ok++;
      if (r.text) findingParts.push(`### ${ANGLES[i].label}\n${r.text}`);
      for (const s of r.sources) {
        const list = byDomain.get(s.publisher) || [];
        if (list.some((x) => x.url === s.url)) continue;
        list.push(s);
        byDomain.set(s.publisher, list);
      }
    });

    // עד 2 מכל דומיין, בסבב בין הדומיינים — כך ששמונה מקורות הם באמת
    // שמונה גופים שונים ולא שמונה עמודים מאותו אתר.
    const sources: ResearchSource[] = [];
    for (let round = 0; round < 2; round++) {
      for (const list of byDomain.values()) {
        if (list[round]) sources.push(list[round]);
      }
    }

    this.logger.log(
      `research "${topic.slice(0, 60)}" - ${ok}/${ANGLES.length} angles, ` +
        `${sources.length} sources from ${byDomain.size} domains, ${Date.now() - started}ms`,
    );
    return {
      findings: findingParts.join('\n\n'),
      sources: sources.slice(0, 10),
      anglesSucceeded: ok,
      anglesTotal: ANGLES.length,
    };
  }
}
