import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerReminderService } from './customer-reminder.service';
import { isRadonKitSku, RADON_KIT_SKUS } from './radon-tracks';
import {
  buildKitInstructionsText,
  buildKitReturnText,
  type RadonKitMessageContext,
} from './radon-messages';

/**
 * מעקב ערכת ראדון — התהליך שהלקוח מבצע בעצמו, מקצה לקצה.
 *
 * הבעיה שזה פותר: בשירותי הערכה (61 / 10000) הגלאים עוזבים את ידינו והלקוח
 * הוא זה שמתקין, מחכה ומחזיר. עד עכשיו לא היה לנו שום מידע על מה שקורה
 * בזמן הזה — רק כפתור שמתזמן תזכורת "בעוד 90 יום" מרגע הלחיצה, שזו ניחוש:
 * הספירה האמיתית מתחילה ביום שהלקוח *התקין*, לא ביום ששלחנו.
 *
 * ארבעת המצבים, לפי הסדר:
 *
 *   not_sent              הערכה עוד אצלנו.
 *   awaiting_confirmation שלחנו את הערכה + הודעת הוראות, ומחכים שהלקוח
 *                         יאשר בוואטסאפ מתי הוא התקין.
 *   testing               הלקוח אישר → יש תאריך התחלה → ספירה לאחור רצה.
 *   ended                 חלפו ימי הבדיקה → התראה לעובד + הודעת החזרה ללקוח.
 *
 * חלוקת האחריות מול הבוט לא משתנה: ה-CRM לא שולח וואטסאפ. הוא מנסח את
 * הטקסט, שולח אותו לבוט כטקסט מוכן, והבוט שולח בפועל. הנוסח נבנה כאן
 * דווקא כדי ש"הצג הודעה מנוסחת" יראה בדיוק את מה שיישלח.
 */
@Injectable()
export class RadonKitService {
  private readonly logger = new Logger(RadonKitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: CustomerReminderService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // קריאה
  // ─────────────────────────────────────────────────────────────

  /**
   * המצב המלא של המשימה — מה שהקומפוננטה בסרגל הימני מציירת.
   *
   * לא יוצר עבודה. משימה שטרם נשלחה בה ערכה מחזירה `job: null` ואת שתי
   * ההודעות כתצוגה מקדימה, כך שהעובד יכול לקרוא אותן לפני שהוא מתחייב.
   */
  async getState(taskId: string, sku: string) {
    if (!isRadonKitSku(sku)) {
      throw new BadRequestException(
        `מעקב ערכה זמין רק לשירותי ערכת ראדון (${RADON_KIT_SKUS.join(', ')})`,
      );
    }

    const job = await this.prisma.radonJob.findFirst({ where: { taskId } });
    const recipient = await this.bridge.resolveRecipient(taskId);
    const days = job?.testDurationDays ?? 90;

    const ctx: RadonKitMessageContext = {
      customerName: recipient.name,
      siteAddress: job?.siteAddress ?? recipient.siteAddress,
      testDurationDays: days,
      officePhone: this.officePhone(),
    };

    return {
      taskId,
      sku,
      stage: this.stageOf(job),
      testDurationDays: days,
      daysLeft: this.daysLeft(job),
      daysElapsed: this.daysElapsed(job),
      recipient,
      configured: this.bridge.isConfigured(),

      job: job
        ? {
            id: job.id,
            kitSentAt: job.kitSentAt,
            kitSentByUserId: job.kitSentByUserId,
            kitSentVia: job.kitSentVia,
            kitInstructionsSentAt: job.kitInstructionsSentAt,
            installConfirmedAt: job.installConfirmedAt,
            installConfirmedVia: job.installConfirmedVia,
            installConfirmedNote: job.installConfirmedNote,
            /** תאריך ההתקנה שהלקוח מסר — נקודת האפס של הספירה. */
            installedOn: job.clientReportedAt,
            expectedEndAt: job.expectedEndAt,
            collectedAt: job.collectedAt,
            returnReminderId: job.returnReminderId,
          }
        : null,

      // שתי ההודעות תמיד מוחזרות — גם לפני השליחה (תצוגה מקדימה) וגם אחריה
      // (מה שנשלח בפועל). זה מה שמאפשר "הצג הודעה מנוסחת" בכל שלב.
      messages: {
        instructions: {
          text: job?.kitInstructionsText ?? buildKitInstructionsText(ctx),
          sentAt: job?.kitInstructionsSentAt ?? null,
        },
        return: {
          text: job?.returnReminderText ?? buildKitReturnText(ctx),
          /** מתי ההודעה הזו תישלח אוטומטית. null = טרם נקבע תאריך התקנה. */
          scheduledFor: job?.expectedEndAt ?? null,
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // שלב 1 — "הערכה נשלחה ללקוח"
  // ─────────────────────────────────────────────────────────────

  /**
   * מסמן שהערכה יצאה ללקוח, ומיד שולח לו את הודעת ההוראות + בקשת תאריך.
   *
   * העבודה נוצרת כאן ולא בשאלון: לקודי ערכה מעולם לא נפתחה RadonJob (הממשק
   * פותח את זרימת הראדון רק ל-10044/10017), ולכן זו נקודת ההיוולדות שלה.
   * `track` נשאר null במכוון — טבלת ההחלטה לא מכריעה ערכה קצרת-טווח, ומעקב
   * הערכה ממילא לא נשען על שלבי המסלול.
   */
  async markKitSent(input: {
    taskId: string;
    sku: string;
    customerId?: string | null;
    testDurationDays?: number | null;
    phoneOverride?: string | null;
    actorUserId?: string | null;
    /** 'manual' = עובד לחץ. 'auto' = חלון 48 השעות נסגר ואיש לא לחץ. */
    via?: 'manual' | 'auto';
  }) {
    const sku = String(input.sku ?? '').trim();
    if (!isRadonKitSku(sku)) {
      throw new BadRequestException(
        `מעקב ערכה זמין רק לשירותי ערכת ראדון (${RADON_KIT_SKUS.join(', ')})`,
      );
    }

    const existing = await this.prisma.radonJob.findFirst({ where: { taskId: input.taskId } });

    // ברירת המחדל היא מה שכבר נשמר לעבודה, לא 90 קבוע: אחרת פעולת השליחה הייתה
    // דורסת בשקט משך בדיקה שהעובד שינה קודם דרך setDuration.
    const days = this.normalizeDays(input.testDurationDays ?? existing?.testDurationDays);
    const recipient = await this.bridge.resolveRecipient(input.taskId);
    const phone = (input.phoneOverride ?? '').trim() || recipient.phone;
    if (!phone) {
      throw new BadRequestException(
        'אין ללקוח מספר טלפון במערכת — הוסיפו מספר בכרטיס הלקוח לפני שליחת הערכה',
      );
    }

    if (existing?.kitSentAt) {
      // לחיצה כפולה לא שולחת הודעה שנייה ללקוח.
      this.logger.log(`kit already marked sent for task ${input.taskId} — no-op`);
      return this.getState(input.taskId, sku);
    }

    const messageText = buildKitInstructionsText({
      customerName: recipient.name,
      siteAddress: existing?.siteAddress ?? recipient.siteAddress,
      testDurationDays: days,
      officePhone: this.officePhone(),
    });

    const job = existing
      ? await this.prisma.radonJob.update({
          where: { id: existing.id },
          data: { testDurationDays: days, kitInstructionsText: messageText },
        })
      : await this.prisma.radonJob.create({
          data: {
            sku,
            taskId: input.taskId,
            customerId: input.customerId ?? recipient.customerId,
            siteAddress: recipient.siteAddress,
            contactName: recipient.name,
            contactPhone: phone,
            testDurationDays: days,
            kitInstructionsText: messageText,
          },
        });

    // השליחה + רישום ההמתנה לאישור קורים בבוט. אם הבוט נופל — לא מסמנים
    // שנשלח, אחרת המסך היה מראה "ממתין לאישור" על הודעה שמעולם לא יצאה.
    const sent = await this.bridge.call('/internal/customer-kit/instructions', {
      method: 'POST',
      body: {
        taskId: input.taskId,
        radonJobId: job.id,
        customerPhone: phone,
        customerName: recipient.name,
        customerId: recipient.customerId,
        sku,
        siteAddress: recipient.siteAddress,
        testDurationDays: days,
        messageText,
        createdByUserId: input.actorUserId ?? null,
      },
    });

    const now = new Date();
    const via = input.via ?? 'manual';
    await this.prisma.radonJob.update({
      where: { id: job.id },
      data: {
        kitSentAt: now,
        kitSentByUserId: input.actorUserId ?? null,
        kitSentVia: via,
        kitInstructionsSentAt: sent?.sentAt ? new Date(sent.sentAt) : now,
      },
    });

    this.logger.log(
      `radon kit marked sent (${via}) for task ${input.taskId} (sku ${sku}, ${days}d) → ${phone}`,
    );
    return this.getState(input.taskId, sku);
  }

  // ─────────────────────────────────────────────────────────────
  // שלב 2 — אישור ההתקנה
  // ─────────────────────────────────────────────────────────────

  /**
   * הלקוח אישר מתי הוא התקין — כאן מתחילה הספירה.
   *
   * שני מקורות מגיעים לכאן: הבוט (`via: 'whatsapp'`), כשהלקוח ענה בשיחה,
   * ועובד (`via: 'manual'`), כשהאישור הגיע בטלפון או שהלקוח פשוט לא עונה.
   * שניהם עוברים באותו נתיב כדי שתמיד תיווצר גם תזכורת ההחזרה — אישור
   * ידני שלא היה מזמן תזכורת היה משאיר את הבדיקה בלי סוף אוטומטי.
   */
  async confirmInstallation(input: {
    taskId?: string | null;
    radonJobId?: string | null;
    /** תאריך ההתקנה שהלקוח מסר (ISO / YYYY-MM-DD). */
    installedOn: string;
    note?: string | null;
    via?: 'whatsapp' | 'manual';
    actorUserId?: string | null;
  }) {
    const job = await this.findJob(input);

    const installedOn = this.parseInstallDate(input.installedOn);
    const days = job.testDurationDays ?? 90;
    const expectedEndAt = new Date(installedOn.getTime() + days * 86_400_000);

    const recipient = job.taskId
      ? await this.bridge.resolveRecipient(job.taskId).catch(() => null)
      : null;

    const returnText = buildKitReturnText({
      customerName: recipient?.name ?? job.contactName,
      siteAddress: job.siteAddress ?? recipient?.siteAddress,
      testDurationDays: days,
      officePhone: this.officePhone(),
    });

    // תזכורת ההחזרה נדרכת למועד סיום התקופה. אם הבוט לא זמין — האישור עדיין
    // נרשם והספירה מתחילה; העובד יראה שהתזכורת לא נדרכה ויוכל לדרוך מחדש.
    let returnReminderId: string | null = job.returnReminderId ?? null;
    const phone = (job.contactPhone ?? recipient?.phone ?? '').trim();
    if (phone && expectedEndAt.getTime() > Date.now()) {
      try {
        const armed = await this.bridge.call('/internal/customer-reminders', {
          method: 'POST',
          body: {
            kind: 'RADON_KIT_RETURN',
            customerPhone: phone,
            customerName: recipient?.name ?? job.contactName,
            customerId: job.customerId,
            taskId: job.taskId,
            radonJobId: job.id,
            sku: job.sku,
            siteAddress: job.siteAddress ?? recipient?.siteAddress,
            dueAt: expectedEndAt.toISOString(),
            messageText: returnText,
            createdByUserId: input.actorUserId ?? null,
          },
        });
        returnReminderId = armed?.reminder?.id ?? returnReminderId;
      } catch (e: any) {
        this.logger.warn(
          `return reminder not armed for job ${job.id}: ${e?.message ?? e}`,
        );
      }
    }

    const updated = await this.prisma.radonJob.update({
      where: { id: job.id },
      data: {
        clientReportedAt: installedOn,
        placedAt: job.placedAt ?? installedOn,
        expectedEndAt,
        installConfirmedAt: new Date(),
        installConfirmedVia: input.via ?? 'whatsapp',
        installConfirmedNote: (input.note ?? '').trim() || null,
        returnReminderId,
        returnReminderText: returnText,
        status: 'IN_FIELD',
      },
    });

    this.logger.log(
      `radon kit install confirmed (${input.via ?? 'whatsapp'}) job=${job.id} ` +
        `installedOn=${installedOn.toISOString().slice(0, 10)} ends=${expectedEndAt.toISOString().slice(0, 10)}`,
    );

    return updated.taskId
      ? this.getState(updated.taskId, updated.sku)
      : { job: updated };
  }

  // ─────────────────────────────────────────────────────────────
  // פעולות עובד
  // ─────────────────────────────────────────────────────────────

  /** שינוי אורך תקופת הבדיקה. חסום אחרי שההודעה כבר יצאה עם המספר הישן. */
  async setDuration(taskId: string, sku: string, testDurationDays: number) {
    if (!isRadonKitSku(sku)) {
      throw new BadRequestException(
        `מעקב ערכה זמין רק לשירותי ערכת ראדון (${RADON_KIT_SKUS.join(', ')})`,
      );
    }
    const days = this.normalizeDays(testDurationDays);
    const job = await this.prisma.radonJob.findFirst({ where: { taskId } });

    if (job?.kitSentAt) {
      throw new BadRequestException(
        'הודעת ההוראות כבר נשלחה ללקוח עם משך הבדיקה הנוכחי — לא ניתן לשנות אותו כעת',
      );
    }
    if (!job) {
      await this.prisma.radonJob.create({
        data: { sku: String(sku).trim(), taskId, testDurationDays: days },
      });
    } else {
      await this.prisma.radonJob.update({
        where: { id: job.id },
        data: { testDurationDays: days },
      });
    }
    return this.getState(taskId, sku);
  }

  /** סימון שהערכה חזרה אלינו — סוגר את הספירה ואת ההתראה. */
  async markReturned(taskId: string, sku: string) {
    const job = await this.prisma.radonJob.findFirst({ where: { taskId } });
    if (!job) throw new NotFoundException('לא נמצא מעקב ערכה למשימה זו');

    await this.prisma.radonJob.update({
      where: { id: job.id },
      data: { collectedAt: new Date(), status: 'IN_ANALYSIS' },
    });
    return this.getState(taskId, sku);
  }

  // ─────────────────────────────────────────────────────────────
  // עזרים
  // ─────────────────────────────────────────────────────────────

  private async findJob(input: { taskId?: string | null; radonJobId?: string | null }) {
    const job = input.radonJobId
      ? await this.prisma.radonJob.findUnique({ where: { id: input.radonJobId } })
      : input.taskId
        ? await this.prisma.radonJob.findFirst({ where: { taskId: input.taskId } })
        : null;
    if (!job) throw new NotFoundException('לא נמצא מעקב ערכה למשימה זו');
    if (!job.kitSentAt) {
      throw new BadRequestException('הערכה טרם סומנה כנשלחה ללקוח');
    }
    return job;
  }

  /**
   * תאריך התקנה. תאריך עתידי נדחה — הוא היה מזיז את סוף התקופה קדימה בלי
   * שאיש שם לב. תאריך ישן מותר: לקוח מדווח לפעמים כמה ימים אחרי ההתקנה.
   */
  private parseInstallDate(raw: string): Date {
    const d = new Date(String(raw ?? '').trim());
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('תאריך התקנה לא תקין');
    }
    // סוף היום, כדי ש"התקנתי היום" לא ייחשב עתידי בגלל אזור זמן.
    if (d.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('תאריך ההתקנה לא יכול להיות עתידי');
    }
    return d;
  }

  private normalizeDays(raw?: number | null): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 90;
    if (n > 400) throw new BadRequestException('משך בדיקה ארוך מ-400 ימים אינו סביר');
    return Math.floor(n);
  }

  private stageOf(job: any): 'not_sent' | 'awaiting_confirmation' | 'testing' | 'ended' | 'returned' {
    if (!job?.kitSentAt) return 'not_sent';
    if (job.collectedAt) return 'returned';
    if (!job.clientReportedAt || !job.expectedEndAt) return 'awaiting_confirmation';
    return new Date(job.expectedEndAt).getTime() <= Date.now() ? 'ended' : 'testing';
  }

  /** ימים שנותרו. שלילי אחרי סוף התקופה — הממשק מציג "עברו X ימים". */
  private daysLeft(job: any): number | null {
    if (!job?.expectedEndAt) return null;
    return Math.ceil((new Date(job.expectedEndAt).getTime() - Date.now()) / 86_400_000);
  }

  private daysElapsed(job: any): number | null {
    if (!job?.clientReportedAt) return null;
    return Math.floor((Date.now() - new Date(job.clientReportedAt).getTime()) / 86_400_000);
  }

  private officePhone(): string | null {
    return (process.env.CUSTOMER_BOT_OFFICE_PHONE ?? '').trim() || null;
  }
}
