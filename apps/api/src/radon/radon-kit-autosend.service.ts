import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RadonKitService } from './radon-kit.service';
import { RADON_KIT_SKUS } from './radon-tracks';

/**
 * רשת ביטחון ל-48 שעות: אם איש לא לחץ "הערכה נשלחה ללקוח", ההודעה יוצאת לבד.
 *
 * הבעיה שזה פותר: כל התהליך תלוי בלחיצה אחת של אדם. כשהיא נשכחת, הלקוח לא
 * מקבל הוראות, לא מדווח תאריך, הספירה לא מתחילה — והעבודה נתקעת בשקט מוחלט,
 * בדיוק כמו שקרה לפני שהמעקב הזה נבנה. שום התראה לא נדלקת, כי מבחינת המערכת
 * פשוט לא קרה כלום.
 *
 * נקודת האפס היא הרגע שבו המשימה נכנסה לשלב **ביצוע** — השלב שבו הערכה אמורה
 * לצאת בפועל. במכוון לא מרגע פתיחת המשימה: שם עוד אין ודאות שהתשלום הוסדר או
 * שהערכה הוכנה, והודעת "הערכה יצאה אליך" הייתה מגיעה מוקדם מדי.
 *
 * מה שנשלח אוטומטית מסומן `kitSentVia='auto'` ומוצג ככזה בכרטיס — מי שקורא
 * אותו חייב לדעת שהתהליך התחיל בלי החלטת אדם.
 */
@Injectable()
export class RadonKitAutoSendService {
  private readonly logger = new Logger(RadonKitAutoSendService.name);

  /** חלון החסד לפני שליחה אוטומטית. */
  private readonly GRACE_HOURS = Number(process.env.RADON_KIT_AUTOSEND_HOURS ?? 48);

  /**
   * גבול עליון לגיל המשימה — מעליו כבר לא שולחים אוטומטית.
   *
   * בלי זה, ההפעלה הראשונה של הסריקה הייתה שולחת "ערכת הראדון יצאה אליך" לכל
   * משימה שתקועה בביצוע מאז ומעולם, כולל אחת מלפני חודש. משימה כזו אינה
   * "העובד שכח ללחוץ לפני יומיים" אלא משהו שנתקע ודורש עין אנושית — הודעת
   * הוראות הצבה אליה רק תבלבל לקוח שהערכה אצלו כבר שבועות.
   */
  private readonly MAX_AGE_DAYS = Number(process.env.RADON_KIT_AUTOSEND_MAX_AGE_DAYS ?? 14);

  /**
   * רצפת הפעלה: משימות שנכנסו לביצוע לפני המועד הזה לא נשלחות אוטומטית לעולם.
   *
   * הפעלה של אוטומציה שפונה ללקוחות היא תמיד רטרואקטיבית בברירת המחדל — ברגע
   * שהיא עולה היא "מגלה" את כל מה שהצטבר וכותבת לכולם בבת אחת. הרצפה הזו
   * מצמצמת אותה למה שקורה מכאן והלאה, כך שמשימות שכבר טופלו בדרך אחרת (או
   * שנזנחו מסיבה טובה) לא מקבלות פתאום הודעת "הערכה יצאה אליך".
   *
   * ריק = אין רצפה. מוגדר ב-Railway כ-ISO ברגע ההפעלה.
   */
  private notBefore(): Date | null {
    const raw = (process.env.RADON_KIT_AUTOSEND_NOT_BEFORE ?? '').trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** תקרת שליחות בסבב — גבול עליון שמונע הצפה אם משהו במיון השתבש. */
  private readonly MAX_PER_RUN = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kit: RadonKitService,
  ) {}

  /** כיבוי הפיך בלי deploy, לפי דפוס שאר המשלוחים היזומים במערכת. */
  private enabled(): boolean {
    return (process.env.RADON_KIT_AUTOSEND_ENABLED ?? '1') !== '0';
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick() {
    if (!this.enabled()) return;
    try {
      await this.run();
    } catch (e: any) {
      this.logger.error(`radon kit auto-send failed: ${e?.message || e}`);
    }
  }

  /**
   * סורק משימות ערכה שיושבות בביצוע מעל חלון החסד ושההודעה בהן טרם יצאה.
   * ציבורי כדי שאפשר יהיה להריץ ידנית מהבקר לצורך בדיקה ותפעול.
   */
  async run(): Promise<{ scanned: number; sent: number; skipped: number }> {
    const cutoff = new Date(Date.now() - this.GRACE_HOURS * 3_600_000);
    const ageFloor = new Date(Date.now() - this.MAX_AGE_DAYS * 86_400_000);
    // הרצפה המחמירה מבין השתיים — גיל מרבי, ורצפת ההפעלה אם הוגדרה.
    const activation = this.notBefore();
    const floor =
      activation && activation.getTime() > ageFloor.getTime() ? activation : ageFloor;

    const candidates = await this.prisma.task.findMany({
      where: {
        // שלב ביצוע. שני הערכים מייצגים את אותו שלב — 'step6' הוא הצורה
        // הנפוצה ו-'FIELD_WORK' נשאר מרשומות שנכתבו דרך זרימת התיאום.
        type: { in: ['step6', 'FIELD_WORK'] },
        status: { notIn: ['DONE', 'CANCELLED'] },
        // חלון סגור משני הצדדים:
        //   lte: cutoff — עברו 48 שעות, אז זו כבר שכחה ולא "עוד לא הספיקו".
        //   gte: floor  — אבל לא ישן מדי, ראה MAX_AGE_DAYS.
        // null = לא ידוע מתי נכנסה לשלב, ולכן אין ממה לספור. מדלגים במכוון:
        // עדיף לא לשלוח מאשר לשלוח על סמך חותמת לא קשורה.
        currentStageChangedAt: { not: null, lte: cutoff, gte: floor },
        OR: [
          { productName: { in: [...RADON_KIT_SKUS] } },
          {
            AND: [
              { productName: { contains: 'ראדון' } },
              { productName: { contains: 'ערכ' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        productName: true,
        customerId: true,
        currentStageChangedAt: true,
      },
      take: 200,
    });

    if (!candidates.length) return { scanned: 0, sent: 0, skipped: 0 };

    // מסננים החוצה כל מה שכבר נשלח, בשאילתה אחת במקום אחת לכל משימה.
    const taskIds = candidates.map((t) => t.id);
    const already = await this.prisma.radonJob.findMany({
      where: { taskId: { in: taskIds }, kitSentAt: { not: null } },
      select: { taskId: true },
    });
    const sentTaskIds = new Set(already.map((j) => j.taskId));
    const pending = candidates.filter((t) => !sentTaskIds.has(t.id));

    let sent = 0;
    let skipped = 0;

    for (const task of pending.slice(0, this.MAX_PER_RUN)) {
      try {
        await this.kit.markKitSent({
          taskId: task.id,
          sku: String(task.productName ?? '').trim(),
          customerId: task.customerId,
          actorUserId: null,
          via: 'auto',
        });
        sent += 1;
        this.logger.log(
          `radon kit auto-sent for task ${task.id} — ${this.GRACE_HOURS}h passed with no manual send`,
        );
      } catch (e: any) {
        // כשל אחד (למשל לקוח בלי טלפון) לא עוצר את שאר הסבב, והמשימה תיסרק
        // שוב בשעה הבאה — כך שתיקון הטלפון בכרטיס מספיק כדי שההודעה תצא.
        skipped += 1;
        this.logger.warn(`radon kit auto-send skipped task ${task.id}: ${e?.message || e}`);
      }
    }

    if (pending.length > this.MAX_PER_RUN) {
      this.logger.warn(
        `radon kit auto-send: ${pending.length - this.MAX_PER_RUN} tasks left for the next run (cap ${this.MAX_PER_RUN})`,
      );
    }

    this.logger.log(
      `radon kit auto-send: scanned=${candidates.length} pending=${pending.length} sent=${sent} skipped=${skipped}`,
    );
    return { scanned: candidates.length, sent, skipped };
  }
}
