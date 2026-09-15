import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CloudPlusClient, type CloudPlusCall } from './cloudplus.client';

/**
 * הקלטות שיחה ותמלולן.
 *
 * הזרימה בשלושה שלבים נפרדים בכוונה, כי כל אחד נכשל אחרת:
 *   1. קליטה   — שיחה נכנסת למערכת עם המטא-דאטה שלה (ingest / ה-poller).
 *   2. שיוך    — התאמה ללקוח לפי מספר הטלפון, ולמשימה הפעילה שלו אם יש.
 *   3. תמלול   — הורדת האודיו והעברתו ל-STT. איטי, עולה כסף, ועלול להיכשל.
 *
 * הפרדה זו היא מה שמאפשר לנסות תמלול שוב בלי לקלוט את השיחה פעמיים, ומה שמאפשר
 * לשיחה להופיע בכרטיס הלקוח מיד — עם "ממתין לתמלול" — במקום להיעלם עד שה-STT יסיים.
 *
 * המרכזייה היא CloudPlus, וכל המגע איתה מרוכז ב-CloudPlusClient. שיחות נכנסות
 * במשיכה מתוזמנת (pollCalls) וגם דרך POST /ingest למי שירצה לדחוף אותן.
 */
@Injectable()
export class CallRecordingsService {
  private readonly logger = new Logger(CallRecordingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudplus: CloudPlusClient,
  ) {}

  /**
   * ספרות בלבד, בלי קידומת ישראלית.
   *
   * מספר מגיע מהטלפוניה בכל צורה שהיא — "+972-50-123-4567", "0501234567",
   * "972501234567" — וכולן אותו אדם. משווים על תשע הספרות האחרונות: זה מה
   * שמשותף לכל הצורות, וזה מספיק ייחודי כדי לא להתאים לאדם אחר.
   */
  static digitsOf(raw: string | null | undefined): string {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return '';
    // 972 בתחילת המספר היא קידומת מדינה — מוחלפת ב-0 המקומי.
    const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
    // תשע ספרות אחרונות: מנטרל הבדלי קידומת שנשארו.
    return local.length > 9 ? local.slice(-9) : local;
  }

  /**
   * מאתר את הלקוח ששייך למספר הטלפון.
   *
   * בודק את שלושת שדות הטלפון של הלקוח וגם את אנשי הקשר שלו — שיחה מגיעה לא
   * פעם מהטלפון הישיר של איש קשר ולא מהמספר הראשי של החברה. ההשוואה על ספרות
   * בלבד, כי "050-1234567" ו-"0501234567" הם אותו מספר ורק אחד מהם שמור.
   *
   * מחזיר null כשאין התאמה — השיחה תישמר בכל זאת ותחכה לשיוך ידני.
   */
  async findCustomerByPhone(phone: string): Promise<string | null> {
    const digits = CallRecordingsService.digitsOf(phone);
    // מתחת ל-7 ספרות אין ייחודיות — התאמה כזו תשייך שיחה ללקוח שגוי, וזה
    // גרוע יותר מלא לשייך בכלל.
    if (digits.length < 7) return null;

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT c."id"
         FROM "Customer" c
        WHERE regexp_replace(COALESCE(c."phone",''),  '[^0-9]', '', 'g') LIKE '%' || $1
           OR regexp_replace(COALESCE(c."phone2",''), '[^0-9]', '', 'g') LIKE '%' || $1
           OR regexp_replace(COALESCE(c."phone3",''), '[^0-9]', '', 'g') LIKE '%' || $1
           OR EXISTS (
                SELECT 1 FROM "CustomerContact" cc
                 WHERE cc."customerId" = c."id"
                   AND regexp_replace(COALESCE(cc."phone",''), '[^0-9]', '', 'g') LIKE '%' || $1
              )
        ORDER BY c."updatedAt" DESC
        LIMIT 1`,
      digits,
    );
    return rows[0]?.id ?? null;
  }

  /**
   * המשימה הפעילה של הלקוח בזמן השיחה.
   *
   * שיוך רך: השיחה שייכת ללקוח, ורק במקרה גם למשימה שהייתה פתוחה אז. נבחרת
   * המשימה הפתוחה שעודכנה לאחרונה לפני השיחה — הקירוב הסביר ל"על מה דיברו".
   * אין משימה פתוחה ⇒ null, והשיחה עדיין מופיעה בכרטיס הלקוח.
   */
  async findActiveTask(customerId: string, at: Date): Promise<string | null> {
    const task = await this.prisma.task.findFirst({
      where: { customerId, status: { not: 'DONE' }, createdAt: { lte: at } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return task?.id ?? null;
  }

  /**
   * קולט שיחה אחת — או מעדכן אותה אם כבר נקלטה.
   *
   * ה-externalId הוא המפתח: משיכה מחזורית תראה את אותה שיחה שוב ושוב, וקליטה
   * כפולה תציג ללקוח את אותה שיחה פעמיים. שיוך ידני קיים לא נדרס — מי שתיקן
   * שיוך ביד לא אמור למצוא אותו חוזר לקדמותו במשיכה הבאה.
   */
  async ingestOne(input: {
    externalId: string;
    phone: string;
    direction?: string;
    startedAt: Date | string;
    durationSec?: number;
    audioUrl?: string | null;
    agentName?: string | null;
    transcript?: string | null;
  }) {
    const externalId = String(input.externalId ?? '').trim();
    if (!externalId)
      throw new BadRequestException('חסר מזהה שיחה חיצוני (externalId)');
    const phone = String(input.phone ?? '').trim();
    if (!phone) throw new BadRequestException('חסר מספר טלפון');

    const startedAt = new Date(input.startedAt);
    if (Number.isNaN(startedAt.getTime()))
      throw new BadRequestException('תאריך שיחה לא תקין');

    const existing = await this.prisma.callRecording.findUnique({
      where: { externalId },
    });

    // שיוך מחושב רק כשאין שיוך ידני קיים — ראה הערת השיטה.
    let customerId = existing?.customerId ?? null;
    let taskId = existing?.taskId ?? null;
    if (!existing?.manuallyLinked) {
      customerId = await this.findCustomerByPhone(phone);
      taskId = customerId
        ? await this.findActiveTask(customerId, startedAt)
        : null;
    }

    // תמלול שהגיע מוכן מהספק נשמר כמות שהוא — אין סיבה לשלם על תמלול פעמיים.
    // אין אודיו ואין טקסט ⇒ SKIPPED: אין מה לתמלל, וזה לא כישלון.
    const suppliedTranscript = (input.transcript ?? '').trim();
    const audioUrl = input.audioUrl ?? null;
    const status = suppliedTranscript
      ? 'DONE'
      : audioUrl
        ? 'PENDING'
        : 'SKIPPED';

    const data = {
      phone,
      phoneDigits: CallRecordingsService.digitsOf(phone),
      direction:
        (input.direction ?? 'IN').toUpperCase() === 'OUT' ? 'OUT' : 'IN',
      startedAt,
      durationSec: Math.max(0, Math.round(Number(input.durationSec ?? 0)) || 0),
      audioUrl,
      agentName: input.agentName ?? null,
      customerId,
      taskId,
    };

    if (existing) {
      return this.prisma.callRecording.update({
        where: { externalId },
        data: {
          ...data,
          // תמלול קיים לא נמחק ע"י משיכה חוזרת שלא כוללת אותו.
          ...(suppliedTranscript
            ? {
                transcript: suppliedTranscript,
                transcriptStatus: 'DONE',
                transcribedAt: new Date(),
              }
            : {}),
        },
      });
    }

    return this.prisma.callRecording.create({
      data: {
        externalId,
        ...data,
        transcriptStatus: status as any,
        transcript: suppliedTranscript || null,
        transcribedAt: suppliedTranscript ? new Date() : null,
      },
    });
  }

  /** קליטה מרובה. שיחה פגומה אחת לא מפילה את כל המנה. */
  async ingestMany(
    items: any[],
  ): Promise<{ received: number; saved: number; failed: number }> {
    let saved = 0;
    let failed = 0;
    for (const item of items ?? []) {
      try {
        await this.ingestOne(item);
        saved++;
      } catch (e: any) {
        failed++;
        this.logger.warn(
          `ingest failed for ${item?.externalId}: ${e?.message || e}`,
        );
      }
    }
    return { received: (items ?? []).length, saved, failed };
  }

  /**
   * קליטת שיחה מ-webhook של המרכזייה (סעיף 1.9 — ALERTs).
   *
   * זו הדרך ההפוכה, והעדיפה: במקום שאנחנו נמשוך (מה שדורש session/login מול
   * המרכזייה), המרכזייה *דוחפת* אלינו על כל שיחה, מיד כשהיא קורית. אין צורך
   * בהתחברות בכלל — ה-webhook מאומת ב-`key` שמוגדר במרכזייה ומושווה ל-CLOUDPLUS_TOKEN.
   *
   * הפרמטרים כפי שהמרכזייה שולחת אותם:
   *   from_phone   = המספר המתקשר (CALLERID)
   *   target_phone = המספר שחויג (FROM_DID)
   *   direction    = Incoming / Outgoing
   *   call_id      = מזהה השיחה הייחודי (UNIQUEID) — הוא ה-externalId שלנו
   *   key          = טוקן האימות
   *
   * ה-webhook לרוב מגיע *בתחילת* השיחה, כשעדיין אין הקלטה או משך. לכן השיחה
   * נקלטת עם מה שיש, וההקלטה/התמלול מגיעים אחר-כך: כתובת ההורדה נבנית מ-call_id
   * (recordingUrl), והתמלול מנסה למשוך אותה כשהתור רץ. אם אין עדיין הקלטה —
   * הניסיון נכשל בשקט ויחזור בסבב הבא, עד שההקלטה מוכנה.
   *
   * `audio`, אם צורף (ראה PublicController.extractRecordingAudio) — הקלטה
   * שהגיעה מצורפת ישירות לוובהוק. במקרה כזה מתמללים ממנה מיד ומדלגים לגמרי על
   * ההורדה המאומתת מהמרכזייה (זו שדורשת session, וכרגע נכשלת — ראה
   * CloudPlusClient). לא חוסם את התשובה ל-webhook: רץ ברקע, וכישלון נשמר בשדה.
   */
  async ingestWebhook(
    params: Record<string, string>,
    audio?: { bytes: Buffer; contentType: string },
  ): Promise<{ ok: boolean }> {
    const callId = (
      params.call_id ||
      params.UNIQUEID ||
      params.uniqueid ||
      ''
    ).trim();
    const from = (
      params.from_phone ||
      params.CALLERID ||
      params.src ||
      ''
    ).trim();
    const target = (
      params.target_phone ||
      params.FROM_DID ||
      params.dst ||
      ''
    ).trim();
    const dirRaw = (params.direction || '').toLowerCase();

    if (!callId) throw new BadRequestException('חסר call_id');

    // כיוון: Incoming = הלקוח התקשר אלינו; אז הצד החיצוני הוא from_phone.
    // Outgoing = אנחנו התקשרנו; הצד החיצוני הוא target_phone.
    const incoming = dirRaw ? dirRaw.startsWith('in') : true;
    const external = incoming ? from : target;
    if (!external) throw new BadRequestException('חסר מספר טלפון');

    const record = await this.ingestOne({
      externalId: callId,
      phone: external,
      direction: incoming ? 'IN' : 'OUT',
      startedAt: new Date(),
      durationSec: Number(params.duration || params.billsec || 0) || 0,
      // כתובת ההורדה נבנית מ-call_id; ההקלטה תימשך בזמן התמלול (אם קיימת) —
      // גם כשיש audio מצורף, כגיבוי: אם התמלול המיידי ממנו נכשל, ניתן עדיין
      // לנסות שוב דרך ההורדה המאומתת (ראה transcribe).
      audioUrl: this.cloudplus.configured
        ? this.cloudplus.recordingUrl(callId)
        : null,
      agentName: params.agent || params.extension || null,
    });

    if (audio) {
      // ברקע — לא חוסם את התשובה ל-webhook, וכישלון נשמר על השורה (transcribeBytes).
      this.transcribeBytes(record.id, audio.bytes, audio.contentType).catch(
        (e: any) =>
          this.logger.warn(
            `webhook-attached transcription failed for ${record.id}: ${e?.message || e}`,
          ),
      );
    }
    return { ok: true };
  }

  /** האם ה-key שהגיע ב-webhook תואם לטוקן המוגדר. */
  verifyWebhookKey(key: string | undefined): boolean {
    const expected = (process.env.CLOUDPLUS_TOKEN || '').trim();
    // בלי טוקן מוגדר — לא מקבלים webhook כלל (אחרת כל אחד יכול להזריק שיחות).
    return !!expected && String(key || '').trim() === expected;
  }

  /** שיחות הלקוח, החדשה קודם. */
  async listForCustomer(customerId: string) {
    return this.prisma.callRecording.findMany({
      where: { customerId },
      orderBy: { startedAt: 'desc' },
      // האודיו עצמו אינו נשמר אצלנו, ולכן אין כאן blob לנכות — ראה
      // [[quotes-list-payload-blobs]]: כל endpoint רשימה חייב להישאר קל.
      select: this.listSelect,
    });
  }

  /** שיחות המשימה. */
  async listForTask(taskId: string) {
    return this.prisma.callRecording.findMany({
      where: { taskId },
      orderBy: { startedAt: 'desc' },
      select: this.listSelect,
    });
  }

  /** שיחות שלא נמצא להן לקוח — ממתינות לשיוך ידני. */
  async listUnlinked(limit = 100) {
    return this.prisma.callRecording.findMany({
      where: { customerId: null },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: this.listSelect,
    });
  }

  private readonly listSelect = {
    id: true,
    externalId: true,
    phone: true,
    direction: true,
    startedAt: true,
    durationSec: true,
    agentName: true,
    transcriptStatus: true,
    transcript: true,
    transcriptError: true,
    transcribedAt: true,
    customerId: true,
    taskId: true,
    manuallyLinked: true,
  } as const;

  async getOne(id: string) {
    const row = await this.prisma.callRecording.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('השיחה לא נמצאה');
    return row;
  }

  /**
   * שיוך ידני ללקוח.
   *
   * מסמן `manuallyLinked` כדי שהמשיכה הבאה לא תדרוס את התיקון. המשימה נגזרת
   * מהלקוח החדש, אלא אם נמסרה במפורש.
   */
  async linkToCustomer(id: string, customerId: string, taskId?: string | null) {
    const call = await this.getOne(id);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('הלקוח לא נמצא');

    const resolvedTask =
      taskId !== undefined
        ? taskId
        : await this.findActiveTask(customerId, call.startedAt);

    return this.prisma.callRecording.update({
      where: { id },
      data: { customerId, taskId: resolvedTask, manuallyLinked: true },
      select: this.listSelect,
    });
  }

  /** מנתק שיוך — השיחה חוזרת ל"לא משויכות". */
  async unlink(id: string) {
    await this.getOne(id);
    return this.prisma.callRecording.update({
      where: { id },
      data: { customerId: null, taskId: null, manuallyLinked: false },
      select: this.listSelect,
    });
  }

  // ── חיוג יזום (Click2Call) ───────────────────────────────────────

  /** האם החיבור למרכזייה מוגדר (משיכה + חיוג). */
  get pbxAvailable(): boolean {
    return this.cloudplus.click2CallConfigured;
  }

  /**
   * מחייג ללקוח דרך המרכזייה בשם עובד.
   *
   * לא מוציא שיחה מהדפדפן: המרכזייה מצלצלת קודם *לשלוחה של העובד*, וכשהוא מרים
   * היא מחייגת ללקוח ומחברת. לכן צריך את שלוחת העובד — בלעדיה אין למי לצלצל,
   * וזו השגיאה שמחזירים. השיחה הזו עוברת במרכזייה, ולכן היא תוקלט ותתומלל
   * אוטומטית במשיכה הבאה — בניגוד לכפתור tel: שמוציא שיחה מהסים הפרטי ולא מגיע
   * למערכת כלל.
   *
   * עובדים שכתובתם מופיעה ב-CLOUDPLUS_CUSTOMER_FIRST_USERS מקבלים את הסדר ההפוך:
   * הלקוח מחויג ראשון, ושלוחת העובד מצלצלת כשהלקוח עונה (ראה `dialOrderFor`).
   */
  async dial(
    userId: string,
    phone: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.cloudplus.click2CallConfigured) {
      throw new BadRequestException(
        'חיבור למרכזייה אינו מוגדר — לא ניתן לחייג דרכה.',
      );
    }
    const to = String(phone ?? '').trim();
    if (!to) throw new BadRequestException('חסר מספר לחיוג');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pbxExtension: true, name: true, email: true },
    });
    const ext = user?.pbxExtension?.trim();
    const order = CallRecordingsService.dialOrderFor(user?.email);
    if (!ext) {
      throw new BadRequestException(
        'לא הוגדרה שלוחת מרכזייה למשתמש. הגדר שלוחה בהגדרות המשתמש כדי לחייג דרך המרכזייה.',
      );
    }

    let extensionState: string | null = null;
    try {
      extensionState = (await this.cloudplus.extensionStatus(ext)).state;
      const normalizedState = extensionState?.replace(/\s+/g, '').toLowerCase();
      if (normalizedState === 'disconnected') {
        throw new BadRequestException(
          `שלוחה ${ext} אינה רשומה/מחוברת למרכזייה (Disconnected).`,
        );
      }
      if (normalizedState === 'inuse') {
        throw new BadRequestException(`שלוחה ${ext} תפוסה כרגע (InUse).`);
      }
      if (normalizedState === 'ringing') {
        throw new BadRequestException(
          `שלוחה ${ext} כבר מצלצלת כרגע (Ringing).`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // CHstatus הוא כלי אבחון בלבד. תקלה בו לא צריכה למנוע ניסיון חיוג שעשוי לעבוד.
      this.logger.warn(
        `CloudPlus extension status check failed for ${ext}: ${(error as any)?.message || error}`,
      );
    }

    const result = await this.cloudplus.click2Call(ext, to, order);
    const customerFirst = order === 'customer-first';
    if (!result.ok) {
      const stateWasIdle =
        extensionState?.replace(/\s+/g, '').toLowerCase() === 'idle';
      const likelyNoAnswer = result.durationMs >= 15_000 && (customerFirst || stateWasIdle);
      // המרכזייה מחזירה fail אחרי שהצד הראשון לא ענה — מי הצד הראשון תלוי בסדר.
      const explanation = likelyNoAnswer
        ? customerFirst
          ? `הלקוח (${result.customerNumber}) לא ענה בזמן שהוגדר במרכזייה.`
          : `שלוחה ${ext} הייתה פעילה אך לא נענתה בזמן שהוגדר במרכזייה.`
        : customerFirst
          ? `המרכזייה דחתה את שלב החיוג הראשון ללקוח (${result.customerNumber}).`
          : `המרכזייה דחתה את שלב החיוג הראשון לשלוחה ${ext}. יש לבדוק שהשלוחה רשומה ופעילה ושיש למשתמש הרשאת Click2Call.`;
      throw new BadRequestException(
        `${explanation} תשובת המרכזייה: ${result.raw || 'fail'}`,
      );
    }
    return {
      ok: true,
      message: customerFirst
        ? `המרכזייה מחייגת ללקוח — כשיענה, תצלצל שלוחה ${ext}.`
        : `המרכזייה מצלצלת לשלוחה ${ext} — הרם כדי להתחבר ללקוח.`,
    };
  }

  /**
   * סדר החיוג לעובד: הלקוח ראשון לעובדים שב-CLOUDPLUS_CUSTOMER_FIRST_USERS, אחרת השלוחה.
   *
   * רשימת כתובות מופרדת בפסיקים, ולא עמודה ב-DB: זו העדפת תפעול שנבחנת כרגע אצל
   * עובד אחד, ושינוי שלה (הוספה, הסרה, או "*" לכולם) צריך להיות מיידי ובלי מיגרציה.
   */
  static dialOrderFor(email: string | null | undefined): 'agent-first' | 'customer-first' {
    const list = (process.env.CLOUDPLUS_CUSTOMER_FIRST_USERS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (list.includes('*')) return 'customer-first';
    return email && list.includes(email.trim().toLowerCase()) ? 'customer-first' : 'agent-first';
  }

  // ── תמלול ────────────────────────────────────────────────────────

  /** האם התמלול מוגדר בשרת. */
  get transcriptionAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * מתמלל שיחה אחת: מוריד את האודיו ומעביר ל-OpenAI.
   *
   * הסטטוס מתעדכן לפני ואחרי, כדי ששיחה שנתקעה באמצע תיראה כ-PROCESSING ולא
   * כ"ממתינה" — ההבדל בין "עוד לא התחיל" ל"התחיל ולא חזר" הוא מה שמאפשר לדעת
   * אם כדאי לנסות שוב.
   *
   * כישלון נשמר בשדה ולא נזרק החוצה במשיכה מרובה: שיחה אחת פגומה לא אמורה
   * לעצור את השאר.
   */
  async transcribe(id: string) {
    const call = await this.getOne(id);
    if (!call.audioUrl) {
      await this.prisma.callRecording.update({
        where: { id },
        data: {
          transcriptStatus: 'SKIPPED',
          transcriptError: 'אין קובץ אודיו לשיחה זו',
        },
      });
      throw new BadRequestException('אין קובץ אודיו לשיחה זו');
    }

    const audio = await this.downloadAudio(call.externalId);
    return this.transcribeBytes(id, audio.bytes, audio.contentType);
  }

  /**
   * מתמלל מבתים שכבר בידינו — משותף לשני מקורות: הורדה מהמרכזייה (`transcribe`)
   * וקובץ שצורף ישירות לוובהוק (`ingestWebhook`), שעוקף לגמרי את ההורדה המאומתת.
   *
   * הסטטוס מתעדכן לפני ואחרי, כדי ששיחה שנתקעה באמצע תיראה כ-PROCESSING ולא
   * כ"ממתינה" — ההבדל בין "עוד לא התחיל" ל"התחיל ולא חזר" הוא מה שמאפשר לדעת
   * אם כדאי לנסות שוב.
   *
   * כישלון נשמר בשדה ולא נזרק החוצה במשיכה מרובה: שיחה אחת פגומה לא אמורה
   * לעצור את השאר.
   */
  private async transcribeBytes(id: string, bytes: Buffer, contentType: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new BadRequestException(
        'תמלול אינו מוגדר בשרת — חסר OPENAI_API_KEY',
      );

    await this.prisma.callRecording.update({
      where: { id },
      data: { transcriptStatus: 'PROCESSING', transcriptError: null },
    });

    try {
      const text = await this.speechToText(bytes, contentType, apiKey);
      return await this.prisma.callRecording.update({
        where: { id },
        data: {
          transcript: text,
          transcriptStatus: 'DONE',
          transcribedAt: new Date(),
          transcriptError: null,
        },
        select: this.listSelect,
      });
    } catch (e: any) {
      const message = String(e?.message || e).slice(0, 500);
      this.logger.error(`transcription failed for ${id}: ${message}`);
      await this.prisma.callRecording.update({
        where: { id },
        data: { transcriptStatus: 'FAILED', transcriptError: message },
      });
      throw new BadRequestException(`התמלול נכשל: ${message}`);
    }
  }

  /**
   * מוריד את קובץ ההקלטה מהמרכזייה.
   *
   * עובר דרך CloudPlusClient ולא ב-fetch ישיר: ההורדה דורשת session פתוח
   * מול ה-PBX (מסמך §1.8), והלקוח הוא שמחזיק אותו ומתחבר מחדש כשהוא פג.
   *
   * מוגבל ב-25MB, המגבלה של OpenAI: קובץ גדול יותר ייכשל אצלם ממילא, ועדיף
   * להיכשל כאן עם הודעה ברורה מאשר על שגיאה זרה.
   */
  private async downloadAudio(
    externalId: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const file = await this.cloudplus.downloadRecording(externalId);
    if (file.bytes.length > 25 * 1024 * 1024) {
      throw new Error('קובץ ההקלטה גדול מ-25MB ואינו נתמך לתמלול');
    }
    return file;
  }

  /**
   * OpenAI STT. עברית נמסרת כרמז שפה — בלעדיו התמלול נוטה להחליק לאנגלית.
   * `response_format=text` מחזיר את הטקסט עצמו, בלי מעטפת JSON לפרק.
   */
  private async speechToText(
    bytes: Buffer,
    contentType: string,
    apiKey: string,
  ): Promise<string> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: contentType }),
      this.fileNameFor(contentType),
    );
    form.append(
      'model',
      process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
    );
    form.append('language', 'he');
    form.append('response_format', 'text');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(body.slice(0, 300) || `STT ${res.status}`);

    const text = body.trim();
    if (!text) throw new Error('התמלול חזר ריק');
    return text;
  }

  /** OpenAI מזהה את הפורמט לפי הסיומת, ולכן לשם הקובץ יש משמעות. */
  private fileNameFor(contentType: string): string {
    const type = contentType.toLowerCase();
    if (type.includes('wav')) return 'call.wav';
    if (type.includes('ogg') || type.includes('opus')) return 'call.ogg';
    if (type.includes('m4a') || type.includes('mp4') || type.includes('aac'))
      return 'call.m4a';
    if (type.includes('webm')) return 'call.webm';
    return 'call.mp3';
  }

  /**
   * מתמלל את התור: כל השיחות שממתינות.
   *
   * מוגבל במספר כדי שקריאה אחת לא תרוץ שעה ולא תייצר חשבון בלתי צפוי.
   * שיחה שנכשלת נספרת ולא עוצרת את השאר.
   */
  async transcribePending(
    limit = 10,
  ): Promise<{ processed: number; done: number; failed: number }> {
    const pending = await this.prisma.callRecording.findMany({
      where: { transcriptStatus: 'PENDING', audioUrl: { not: null } },
      orderBy: { startedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: { id: true },
    });

    let done = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await this.transcribe(row.id);
        done++;
      } catch {
        // הסיבה כבר נשמרה על השורה ב-transcribe.
        failed++;
      }
    }
    return { processed: pending.length, done, failed };
  }

  /**
   * משיכה מהמרכזייה — דוח ה-CDR לטווח תאריכים.
   *
   * ברירת המחדל היא יומיים אחורה ולא היום בלבד: ריצה שנכשלה או שרת שהיה כבוי
   * לא אמורים להשאיר חור צמית בהיסטוריה. ה-externalId הייחודי הוא מה שמונע
   * כפילויות מהחפיפה הזו.
   */
  async fetchFromProvider(
    days = 2,
  ): Promise<{ received: number; saved: number; failed: number }> {
    if (!this.cloudplus.configured) {
      throw new BadRequestException(
        'חיבור למרכזייה אינו מוגדר — חסרים CLOUDPLUS_BASE_URL / CLOUDPLUS_USER / CLOUDPLUS_PASS.',
      );
    }

    const span = Math.min(Math.max(days, 1), 90);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const calls = await this.cloudplus.fetchCdr(
      iso(new Date(Date.now() - span * 864e5)),
      iso(new Date()),
    );

    return this.ingestMany(calls.map((c) => this.fromCdr(c)));
  }

  /**
   * שורת CDR ← שיחה שלנו.
   *
   * הכיוון נגזר מאורך המספר המתקשר: שלוחה היא 3–5 ספרות, ומספר טלפון אמיתי
   * ארוך יותר — כלל פשוט שעובד בלי להכיר את תוכנית המספור. המספר שנשמר הוא
   * תמיד של הצד החיצוני; השלוחה הפנימית לעולם לא תתאים ללקוח.
   *
   * שיחה שלא נענתה (billsec = 0) נשמרת בלי audioUrl, ולכן תסומן SKIPPED ולא
   * תיכנס לתור התמלול — אין מה לתמלל בצלצול שלא נענה.
   */
  private fromCdr(c: CloudPlusCall) {
    const isExtension = (n: string) => /^\d{1,5}$/.test(String(n ?? '').trim());
    const outgoing = isExtension(c.src);
    const external = outgoing ? c.dst : c.src;
    const answered = (c.billsec || 0) > 0;

    return {
      externalId: c.uniqueid,
      phone: external,
      direction: outgoing ? 'OUT' : 'IN',
      startedAt: c.calldate,
      durationSec: c.billsec || c.duration || 0,
      // הכתובת נשמרת לתצוגה/הפניה; ההורדה עצמה משתמשת ב-externalId.
      audioUrl: answered ? this.cloudplus.recordingUrl(c.uniqueid) : null,
      agentName: outgoing ? c.src : this.extensionOf(c),
    };
  }

  /** השלוחה שענתה, מתוך שם הערוץ (למשל "SIP/203-00000a1b" ← "203"). */
  private extensionOf(c: CloudPlusCall): string | null {
    const m = String(c.channel ?? '').match(/\/(\d{1,5})-/);
    return m ? m[1] : null;
  }

  /**
   * משיכה מתוזמנת — מדי חצי שעה.
   *
   * רצה רק כשהחיבור מוגדר, כדי שסביבה בלי מרכזייה (פיתוח) לא תמלא את הלוג
   * בשגיאות. כישלון נרשם ולא נזרק — משימה מתוזמנת שזורקת מפילה את ה-scheduler.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async pollCalls(): Promise<void> {
    if (!this.cloudplus.configured) return;
    try {
      const result = await this.fetchFromProvider(2);
      if (result.saved)
        this.logger.log(`CloudPlus poll: ${result.saved} שיחות נקלטו`);
    } catch (e: any) {
      this.logger.warn(`CloudPlus poll failed: ${e?.message || e}`);
    }
  }

  /**
   * תמלול התור ברקע — מדי שעה.
   *
   * נפרד מהמשיכה בכוונה: המשיכה זולה ומהירה, התמלול איטי ועולה כסף. מוגבל
   * ל-20 שיחות בסבב כדי שיום עמוס לא ייצור חשבון בלתי צפוי.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async transcribeQueue(): Promise<void> {
    if (!this.transcriptionAvailable || !this.cloudplus.configured) return;
    try {
      const r = await this.transcribePending(20);
      if (r.done || r.failed)
        this.logger.log(`תמלול רקע: ${r.done} הצליחו, ${r.failed} נכשלו`);
    } catch (e: any) {
      this.logger.warn(`transcribe queue failed: ${e?.message || e}`);
    }
  }
}
