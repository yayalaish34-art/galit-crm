import { Injectable, Logger } from '@nestjs/common';

/**
 * לקוח למרכזיית CloudPlus / BlueBe (אותה תשתית Elastix/BlueCloud, מיתוגים שונים).
 *
 * למה הוא גמיש ולא נעול על צורה אחת: לכל התקנה יש מארח משלה, והמסמך הרשמי מצנזר
 * אותו בכל דוגמה. גם *אופן האימות* משתנה — יש התקנות שעובדות עם user/pass דרך
 * session, ואחרות עם Token Api (כפי שמופיע בהגדרות הפאנל). במקום לנחש, הלקוח
 * מנסה את הצורות הנפוצות לפי הסדר ומאמץ את זו שהחזירה נתונים תקינים — ואז זוכר
 * אותה. כל אחת מהן ניתנת גם לכפייה מפורשת דרך משתני סביבה, אם ידוע מראש מה נכון.
 *
 * שתי עובדות על ה-API האלה קובעות את כל השאר:
 *   1. הוא עונה 200 גם על שגיאה — "You need to login first!" / "Restricted access"
 *      חוזרים עם status 200, ולכן `res.ok` חסר משמעות וכל תשובה נבדקת על התוכן.
 *   2. תשובה תקינה היא JSON; כל השאר (HTML, הפניה ל-login) = כשל אימות/נתיב.
 */

/** שיחה בודדת מדוח ה-CDR, אחרי נרמול. */
export interface CloudPlusCall {
  uniqueid: string;
  src: string;
  dst: string;
  calldate: string;
  billsec: number;
  duration: number;
  disposition: string;
  channel?: string;
  dcontext?: string;
  recordingfile?: string;
}

export interface CloudPlusExtensionStatus {
  state: string | null;
  raw: string;
}

export interface CloudPlusDialResult {
  ok: boolean;
  uniqueId?: string;
  raw: string;
  durationMs: number;
  /** מספר הלקוח כפי שנשלח (פורמט מקומי, `05…`) — בין אם יצא כ-dial1 או כ-dial2. */
  customerNumber: string;
}

/** מי מצלצל ראשון ב-Click2Call: שלוחת העובד (ברירת המחדל) או הלקוח. */
export type DialOrder = 'agent-first' | 'customer-first';

/** אופן ההזדהות מול ה-API. */
type AuthMode = 'session' | 'token-query' | 'token-header';

@Injectable()
export class CloudPlusClient {
  private readonly logger = new Logger(CloudPlusClient.name);

  /** עוגיית session במטמון (רלוונטי רק ל-mode 'session'). */
  private session: string | null = null;

  /**
   * האופן שהתברר כעובד, אחרי הזיהוי האוטומטי הראשון.
   *
   * נשמר כדי שלא ננסה שוב את כל הצורות בכל קריאה — הזיהוי רץ פעם אחת, ואחריו
   * כל הקריאות הולכות ישר לצורה הנכונה.
   */
  private resolvedAuth: AuthMode | null = null;

  get configured(): boolean {
    // מספיק מארח + (טוקן או user/pass). כך התקנת-טוקן לא נחסמת בגלל היעדר סיסמה,
    // והתקנת-session לא נחסמת בגלל היעדר טוקן.
    return !!(this.baseUrl && (this.token || (this.user && this.pass)));
  }

  /** Click2Call itself always requires user, password and organization. */
  get click2CallConfigured(): boolean {
    return !!(this.baseUrl && this.dialUser && this.dialPass && this.org);
  }

  private get baseUrl(): string {
    return (process.env.CLOUDPLUS_BASE_URL || '').replace(/\/$/, '');
  }
  private get user(): string {
    return process.env.CLOUDPLUS_USER || '';
  }
  private get pass(): string {
    return process.env.CLOUDPLUS_PASS || '';
  }

  /**
   * המשתמש של ה-API (Click2Call ו-CHstatus) — נפרד מהמשתמש של הפאנל.
   *
   * `admin@galit.co2` נכנס לפאנל, אבל ה-API דוחה אותו: הוא החזיר `{"status":"fail"}`
   * בדיוק כמו משתמש שאינו קיים, וזה נראה כמו חשבון חסום. בפועל ה-API מזהה משתמש
   * אחר (`webuser`), ואיתו אותה קריאה מחזירה `{"status":"Idle"}`. לכן שני זוגות
   * פרטים, כשהזוג של ה-API נופל לכללי אם לא הוגדר.
   */
  private get dialUser(): string {
    return process.env.CLOUDPLUS_DIAL_USER || this.user;
  }
  private get dialPass(): string {
    return process.env.CLOUDPLUS_DIAL_PASS || this.pass;
  }
  private get org(): string {
    const explicit = (process.env.CLOUDPLUS_ORG || '').trim();
    if (explicit) return explicit;

    // CloudPlus user names are documented as user@organization-domain. Falling back to the
    // verified user's suffix avoids silently omitting the mandatory org parameter, while an
    // explicit CLOUDPLUS_ORG always wins for installations where the two values differ.
    const separator = this.user.lastIndexOf('@');
    return separator >= 0 ? this.user.slice(separator + 1).trim() : '';
  }
  private get token(): string {
    return process.env.CLOUDPLUS_TOKEN || '';
  }

  /**
   * שם הפרמטר שבו נשלח הטוקן ב-query.
   *
   * שונה בין התקנות — 'token' / 'api_token' / 'key'. ברירת המחדל 'token';
   * ניתן לכפות דרך CLOUDPLUS_TOKEN_PARAM.
   */
  private get tokenParam(): string {
    return process.env.CLOUDPLUS_TOKEN_PARAM || 'token';
  }

  /**
   * נתיב דוח ה-CDR, יחסית למארח.
   *
   * ברירת המחדל היא הנתיב מהמסמך; התקנה עם נתיב אחר (למשל '/ajax/...') מגדירה
   * CLOUDPLUS_CDR_PATH. אותו רעיון ל-dialup ולהורדת הקלטה.
   */
  private get cdrPath(): string {
    return process.env.CLOUDPLUS_CDR_PATH || '/API/Reports.php';
  }
  private get dialPath(): string {
    return process.env.CLOUDPLUS_DIAL_PATH || '/API/dialup.php';
  }
  private get recordingPath(): string {
    return process.env.CLOUDPLUS_RECORDING_PATH || '/admin/';
  }

  private get extensionStatusPath(): string {
    return process.env.CLOUDPLUS_EXTENSION_STATUS_PATH || '/API/CHstatus.php';
  }

  /**
   * כל האופנים שיש להם בכלל את הפרטים הדרושים — כגיבוי לאופן השמור שנכשל.
   * מכבד כפייה מפורשת: כשנקבע CLOUDPLUS_AUTH לא מנסים דבר מעבר לו.
   */
  private allAuthModes(): AuthMode[] {
    const forced = (process.env.CLOUDPLUS_AUTH || '').trim() as AuthMode;
    if (
      forced === 'session' ||
      forced === 'token-query' ||
      forced === 'token-header'
    )
      return [forced];
    const all: AuthMode[] = [];
    if (this.token) all.push('token-query', 'token-header');
    if (this.user && this.pass) all.push('session');
    return all;
  }

  /** האופנים לניסיון, לפי הסדר — או רק זה שנכפה מפורשות. */
  private authOrder(): AuthMode[] {
    const forced = (process.env.CLOUDPLUS_AUTH || '').trim() as AuthMode;
    if (
      forced === 'session' ||
      forced === 'token-query' ||
      forced === 'token-header'
    )
      return [forced];
    if (this.resolvedAuth) return [this.resolvedAuth];
    // טוקן קודם כשהוא קיים (נפוץ בפאנלים חדשים), ואז session.
    const order: AuthMode[] = [];
    if (this.token) order.push('token-query', 'token-header');
    if (this.user && this.pass) order.push('session');
    return order.length ? order : ['session'];
  }

  private static looksLikeError(body: string): boolean {
    return /You need to login first|session has expired|Restricted access|Please provide|<!DOCTYPE|window\.top\.location/i.test(
      body.slice(0, 300),
    );
  }

  // ── אימות ──────────────────────────────────────────────────────────

  private cookiesOf(res: Response): string {
    const raw = (res.headers as any).getSetCookie?.() ?? [];
    return (raw as string[])
      .map((c) => c.split(';')[0])
      .filter((c) => !/=deleted$/.test(c))
      .join('; ');
  }

  /**
   * התחברות session: GET לזרעֵ עוגייה, ואז POST של הפרטים *עם* אותה עוגייה.
   * התחברות בלי עוגייה קיימת אינה נשמרת — נבדק מול השרת.
   */
  private async login(): Promise<string> {
    const seed = await fetch(`${this.baseUrl}/index.php`).catch(() => null);
    const seedCookie = seed ? this.cookiesOf(seed) : '';

    const res = await fetch(`${this.baseUrl}/index.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(seedCookie ? { Cookie: seedCookie } : {}),
      },
      // input_user/input_pass לפאנל הישן; email/password לפאנל BlueBe. שולחים
      // את שניהם — השדות המיותרים פשוט מתעלמים, וזה חוסך ניחוש איזה פאנל זה.
      body: new URLSearchParams({
        input_user: this.user,
        input_pass: this.pass,
        email: this.user,
        password: this.pass,
        submit_login: 'Submit',
        login: '',
      }).toString(),
      redirect: 'manual',
    });

    const html = await res.text();
    if (/Login page|name="input_pass"|name="password"/i.test(html)) {
      throw new Error(
        'ההתחברות למרכזייה נדחתה — יש לוודא CLOUDPLUS_USER / CLOUDPLUS_PASS ואת כתובת המרכזייה.',
      );
    }
    const cookie = this.cookiesOf(res) || seedCookie;
    if (!cookie) throw new Error('המרכזייה לא החזירה עוגיית session');
    return cookie;
  }

  /**
   * מבצע GET לנתיב מסוים בכל אחד מאופני האימות עד שאחד מחזיר תשובה שאינה שגיאה.
   *
   * זה הלב של הגמישות: אין צורך לדעת מראש אם ההתקנה עובדת ב-session או בטוקן.
   * הצורה שהצליחה נשמרת (`resolvedAuth`) וכל הקריאות הבאות הולכות ישר אליה.
   * מחזיר גם את הגוף (לבדיקת תוכן) וגם את ה-Response (למקרה של הורדת קובץ).
   */
  private async get(
    path: string,
    params: Record<string, string>,
  ): Promise<{ res: Response; body: string; auth: AuthMode }> {
    let lastErr = '';

    // האופן שנשמר נוסה ראשון, אבל *לא* לבדו: אם הוא נכשל (session שפג, תקלה
    // רגעית) ממשיכים לשאר. בלי זה קריאה אחת שנכשלה הפילה את כל המשיכה — וכך
    // המשיכה של 08:00 נכשלה ב-[session] בלבד אחרי ש-07:41 הצליחה ב-token-query.
    const order = [...new Set([...this.authOrder(), ...this.allAuthModes()])];

    for (const auth of order) {
      try {
        const { res, body } = await this.getWith(auth, path, params);
        if (!CloudPlusClient.looksLikeError(body)) {
          if (this.resolvedAuth !== auth) {
            this.resolvedAuth = auth;
            this.logger.log(`CloudPlus auth mode resolved to "${auth}"`);
          }
          return { res, body, auth };
        }
        lastErr = `[${auth}] ${body.slice(0, 80)}`;
      } catch (e: any) {
        lastErr = `[${auth}] ${e?.message || e}`;
      }
      // אופן שנכשל לא נשאר "הפתרון" — מנקים כדי שהבא בתור ייבחר באמת.
      if (this.resolvedAuth === auth) this.resolvedAuth = null;
      if (auth === 'session') this.session = null;
    }
    // כל האופנים נכשלו — מאפסים כדי שהניסיון הבא יזהה מחדש (למשל אחרי פקיעת session).
    this.resolvedAuth = null;
    this.session = null;
    throw new Error(`הקריאה למרכזייה נכשלה בכל אופני האימות: ${lastErr}`);
  }

  private async getWith(
    auth: AuthMode,
    path: string,
    params: Record<string, string>,
  ): Promise<{ res: Response; body: string }> {
    const url = new URL(`${this.baseUrl}${path}`);
    const headers: Record<string, string> = {};

    if (auth === 'session') {
      if (!this.session) this.session = await this.login();
      headers.Cookie = this.session;
      // session נשען על user/pass ב-query גם יחד (חלק מה-endpoints דורשים שניהם).
      if (this.user) url.searchParams.set('username', this.user);
      if (this.pass) url.searchParams.set('password', this.pass);
    } else if (auth === 'token-query') {
      url.searchParams.set(this.tokenParam, this.token);
    } else if (auth === 'token-header') {
      headers.Authorization = `Bearer ${this.token}`;
      headers['X-Api-Token'] = this.token;
    }
    if (this.org) url.searchParams.set('org', this.org);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), { headers, redirect: 'manual' });
    // 30x = הפניה ל-login כמעט תמיד; נספר ככשל תוכן.
    const body =
      res.status >= 300 && res.status < 400
        ? 'window.top.location'
        : await res.text();
    return { res, body };
  }

  // ── פעולות ─────────────────────────────────────────────────────────

  /**
   * ממיר מספר חיצוני לפורמט החיוג המקומי שהמרכזייה מנתבת: `0532495154`.
   *
   * לא E.164, למרות שהדוגמה במסמך CloudPlus כותבת `+972…`: נבדק מול המרכזייה
   * (2026-09-14) — `dial1=0532495154` החזיר `Response: OK` והטלפון צלצל, ואילו
   * `dial1=+972532495154` נדחה מיד ב-`fail` בלי לחייג. מסלולי היציאה של המרכזייה
   * הישראלית תואמים את הדפוס המקומי, ומספר בפורמט בינלאומי לא מתאים לאף מסלול.
   *
   * מספר ישראלי (`+972`/`972`/`00972`) חוזר לקידומת 0. מספר חוץ-לארצי נשלח עם
   * קידומת החיוג הבינלאומי `00` — פורמט שלא נבדק מול המרכזייה, כי אין לקוחות כאלה.
   */
  static toPbxNumber(raw: string): string {
    const compact = String(raw ?? '')
      .trim()
      .replace(/[^\d+]/g, '');
    if (!compact) throw new Error('חסר מספר לקוח לחיוג');

    let digits = compact.replace(/^\+/, '00');
    if (digits.startsWith('00972')) digits = `0${digits.slice(5)}`;
    else if (digits.startsWith('972') && digits.length >= 11) digits = `0${digits.slice(3)}`;

    if (!/^0\d{8,14}$/.test(digits)) {
      throw new Error(`מספר הלקוח אינו בפורמט חיוג תקין: ${raw}`);
    }
    return digits;
  }

  /**
   * מצב השלוחה רגע לפני Click2Call. לפי המסמך הערכים האפשריים הם
   * Idle / InUse / Ringing / Disconnected.
   */
  async extensionStatus(extension: string): Promise<CloudPlusExtensionStatus> {
    if (!this.click2CallConfigured) {
      throw new Error(
        'Click2Call אינו מוגדר במלואו — חסרים כתובת, user, pass או org של CloudPlus',
      );
    }

    const url = new URL(`${this.baseUrl}${this.extensionStatusPath}`);
    for (const [key, value] of Object.entries({
      user: this.dialUser,
      pass: this.dialPass,
      org: this.org,
      exten: extension,
      Response: 'yes',
      RFormat: 'json',
    })) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), { redirect: 'manual' }).catch(
      (e) => {
        throw new Error(`בדיקת השלוחה במרכזייה נכשלה: ${e?.message || e}`);
      },
    );
    const body =
      res.status >= 300 && res.status < 400
        ? 'window.top.location'
        : await res.text();
    if (CloudPlusClient.looksLikeError(body) || /bad event/i.test(body)) {
      throw new Error(
        `בדיקת השלוחה נדחתה על ידי המרכזייה: ${body.slice(0, 200)}`,
      );
    }

    let state: string | null = null;
    try {
      const parsed = JSON.parse(body);
      const node = Array.isArray(parsed) ? parsed[0] : (parsed?.data ?? parsed);
      const candidate =
        node?.State ??
        node?.state ??
        node?.Status ??
        node?.status ??
        node?.ExtensionState;
      if (candidate !== undefined && candidate !== null)
        state = String(candidate).trim() || null;
    } catch {
      const match = body.match(/\b(Idle|InUse|Ringing|Disconnected)\b/i);
      if (match) state = match[1];
    }
    return { state, raw: body.slice(0, 300) };
  }

  /** דוח שיחות (CDR) לטווח תאריכים, מנורמל. */
  async fetchCdr(fromDate: string, toDate: string): Promise<CloudPlusCall[]> {
    const { body } = await this.get(this.cdrPath, {
      // שני שמות הפרמטרים שהמסמך משתמש בהם בשני endpoints שונים.
      username: this.user,
      password: this.pass,
      user: this.user,
      pass: this.pass,
      fromdate: fromDate,
      todate: toDate,
      action: 'cdr',
      format: 'json',
      Response: 'yes',
    });

    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(
        `דוח השיחות לא חזר כ-JSON תקין: ${String(body).slice(0, 200)}`,
      );
    }

    const list = Array.isArray(parsed)
      ? parsed
      : (parsed?.data ??
        parsed?.cdr ??
        parsed?.records ??
        parsed?.result ??
        parsed?.rows ??
        []);
    if (!Array.isArray(list)) return [];

    return list.map((r: any) => ({
      uniqueid: String(
        r.uniqueid ?? r.uniqueID ?? r.UNIQUEID ?? r.id ?? r.callid ?? '',
      ),
      src: String(r.src ?? r.source ?? r.clid ?? r.from ?? r.caller ?? ''),
      dst: String(r.dst ?? r.destination ?? r.to ?? r.dest ?? ''),
      calldate: String(
        r.calldate ?? r.start ?? r.date ?? r.starttime ?? r.datetime ?? '',
      ),
      billsec: Number(r.billsec ?? r.talktime ?? 0) || 0,
      duration: Number(r.duration ?? 0) || 0,
      disposition: String(r.disposition ?? r.status ?? ''),
      channel: r.channel ? String(r.channel) : undefined,
      dcontext: r.dcontext ? String(r.dcontext) : undefined,
      recordingfile:
        (r.recordingfile ?? r.recording ?? r.monitor)
          ? String(r.recordingfile ?? r.recording ?? r.monitor)
          : undefined,
    }));
  }

  /**
   * Click2Call — מחייג קודם לשלוחה של הנציג, ואחרי שהוא מרים מחייג ללקוח ומחבר.
   *
   * מהמסמך §1.1: dial1 = שלוחת הנציג, dial2 = מספר הלקוח. חשוב — אין להעביר
   * setCID כשרוצים שהשיחה תוקלט (המסמך: "Don't set setCID … will not be recorded").
   * מחזיר את מזהי שני ה-legs אם הם הוחזרו, לשיוך מאוחר של ההקלטה.
   *
   * חייב להישלח כ-GET, למרות שהתיעוד של CloudPlus מראה דוגמת POST: ב-POST
   * המרכזייה מחזירה "bad event" ולא מסתכלת על הפרמטרים בכלל, ואילו אותם פרמטרים
   * בדיוק ב-query מוחזרים אליה מפורשים ("dial1":"205","dial2":"201"). נבדק מול
   * המרכזייה עצמה — אין להחליף ל-POST על סמך התיעוד.
   *
   * ההזדהות היא user/pass/org בפרמטרים; `org` (שם הארגון) אינו רשות.
   *
   * `order` קובע מי מצלצל ראשון. ברירת המחדל היא השלוחה, כמו במסמך. `customer-first`
   * הופך: המרכזייה מחייגת קודם ללקוח, וכשהוא עונה מצלצלת לשלוחה — dial1 ו-dial2
   * פשוט מתחלפים, כי המרכזייה מחברת את dial2 אחרי שנענה dial1.
   */
  async click2Call(
    agentExtension: string,
    customerPhone: string,
    order: DialOrder = 'agent-first',
  ): Promise<CloudPlusDialResult> {
    if (!this.click2CallConfigured) {
      throw new Error(
        'Click2Call אינו מוגדר במלואו — חסרים כתובת, user, pass או org של CloudPlus',
      );
    }

    const customerNumber = CloudPlusClient.toPbxNumber(customerPhone);
    const [dial1, dial2] =
      order === 'customer-first'
        ? [customerNumber, agentExtension]
        : [agentExtension, customerNumber];
    const url = new URL(`${this.baseUrl}${this.dialPath}`);
    for (const [k, v] of Object.entries({
      user: this.dialUser,
      pass: this.dialPass,
      org: this.org,
      dial1,
      dial2,
      Response: 'yes',
      RFormat: 'json',
      showUID: 'yes',
    })) {
      if (v) url.searchParams.set(k, v);
    }

    const startedAt = Date.now();
    const res = await fetch(url.toString(), { redirect: 'manual' }).catch(
      (e) => {
        throw new Error(`הקריאה למרכזייה נכשלה: ${e?.message || e}`);
      },
    );
    const body =
      res.status >= 300 && res.status < 400
        ? 'window.top.location'
        : await res.text();

    // המרכזייה עונה 200 גם על כישלון ("bad event", דף לוגין), ולכן ההצלחה נקבעת
    // מהתוכן. השגיאות המוכרות נשללות במפורש: עדיף לדווח כישלון על חיוג שהצליח
    // מאשר "מצלצל" על חיוג שלא קרה — המשתמש ימתין לצלצול שלא יגיע.
    const failed =
      /bad event|You need to login first|Restricted access|<!DOCTYPE|window\.top\.location/i.test(
        body,
      );
    let ok =
      !failed &&
      (/"?Response"?\s*[:=]\s*"?OK/i.test(body) ||
        /\bOK\b/i.test(body.slice(0, 40)));
    let uniqueId: string | undefined;
    try {
      const j = JSON.parse(body);
      // התשובה עוטפת את השדות ב-`data` ({"data":{"dial1":…,"Response":"fail"}}),
      // ולכן קוראים גם מתוכה — אחרת Response לא נמצא ו-"fail" נספר כהצלחה.
      const node = Array.isArray(j) ? j[0] : (j?.data ?? j);
      const resp = node?.Response ?? node?.response;
      // רק OK/SUCCESS הם הצלחה. כל ערך אחר ("fail") = כישלון, במפורש.
      if (resp !== undefined)
        ok = /^(ok|success|true|1)$/i.test(String(resp).trim());
      uniqueId =
        node?.Uniqueid1 ?? node?.uniqueid1 ?? node?.Uniqueid ?? undefined;
    } catch {
      /* לא JSON — נסמכים על בדיקת הטקסט */
    }
    return {
      ok,
      uniqueId,
      raw: body.slice(0, 300),
      durationMs: Date.now() - startedAt,
      customerNumber,
    };
  }

  /**
   * כתובת ההורדה של הקלטה לפי מזהה שיחה. לא מורידים כאן — הכתובת נשמרת על השורה,
   * וההורדה עצמה מתבצעת רק בזמן התמלול (הקלטות הן מגה-בייטים).
   */
  recordingUrl(uniqueId: string): string {
    const q = new URLSearchParams({
      menu: 'monitoring',
      action: 'download',
      id: uniqueId,
      rawmode: 'yes',
    });
    if (this.token) q.set(this.tokenParam, this.token);
    return `${this.baseUrl}${this.recordingPath}?${q}`;
  }

  /**
   * מוריד קובץ הקלטה, דרך אותה שכבת אימות גמישה.
   *
   * שונה מ-`get` הרגיל: `get` קורא את גוף התשובה כטקסט לצורך זיהוי שגיאה, וזה
   * "צורך" את ה-stream — אי אפשר אחר-כך לקרוא אותו כבינארי. לכן ההורדה זקוקה
   * לתשובה גולמית: קודם קובעים את אופן האימות דרך `resolveAuth`, ואז מבצעים
   * fetch בודד וקוראים את הגוף פעם אחת בלבד — כטקסט אם זו שגיאה, כבינארי אם קובץ.
   */
  async downloadRecording(
    uniqueId: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const auth = await this.resolveAuth();
    const url = new URL(`${this.baseUrl}${this.recordingPath}`);
    const headers: Record<string, string> = {};

    if (auth === 'session') {
      if (!this.session) this.session = await this.login();
      headers.Cookie = this.session;
    } else if (auth === 'token-query') {
      url.searchParams.set(this.tokenParam, this.token);
    } else {
      headers.Authorization = `Bearer ${this.token}`;
      headers['X-Api-Token'] = this.token;
    }
    for (const [k, v] of Object.entries({
      menu: 'monitoring',
      action: 'download',
      id: uniqueId,
      rawmode: 'yes',
    })) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), { headers }).catch((e) => {
      throw new Error(`הורדת ההקלטה נכשלה: ${e?.message || e}`);
    });
    const contentType = res.headers.get('content-type') || '';

    // קובץ אמיתי מגיע כ-audio/binary; טקסט/HTML = שגיאה (למשל "file not found").
    if (/text\/|json|html/i.test(contentType)) {
      const body = await res.text();
      if (CloudPlusClient.looksLikeError(body)) {
        // ה-session אולי פג — מאפסים כדי שקריאה הבאה תזהה מחדש.
        this.session = null;
        this.resolvedAuth = null;
      }
      if (/file not found/i.test(body))
        throw new Error('לא נמצאה הקלטה לשיחה זו');
      throw new Error(body.slice(0, 200) || 'הורדת ההקלטה נכשלה');
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error('קובץ ההקלטה ריק');
    return { bytes, contentType: contentType || 'audio/wav' };
  }

  /**
   * קובע (פעם אחת) איזה אופן אימות עובד, ומחזיר אותו.
   *
   * מריץ קריאת CDR קצרה כ"בדיקת חיים" דרך `get`, שכבר יודע לנסות את כל האופנים
   * ולשמור את המנצח ב-`resolvedAuth`. משמש את ההורדה, שאינה יכולה לזהות בעצמה
   * (התשובה שלה בינארית ולא JSON).
   */
  private async resolveAuth(): Promise<AuthMode> {
    if (this.resolvedAuth) return this.resolvedAuth;
    const forced = this.authOrder();
    if (forced.length === 1) return forced[0];
    const today = new Date().toISOString().slice(0, 10);
    await this.fetchCdr(today, today).catch(() => undefined); // תופס resolvedAuth כתופעת-לוואי
    return this.resolvedAuth ?? forced[0];
  }
}
