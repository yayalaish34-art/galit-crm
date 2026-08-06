import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ההתראות האוטומטיות של שירות ראדון (סעיף 9 במסמך האפיון).
 *
 * מבנה זהה ל-PreVisitEmailService: cron שסורק ומעדכן, בלי לשלוח כלום מעצמו.
 * ההתראות נשמרות ב-RadonAlert (התראה אחת פתוחה מכל סוג לכל עבודה, נאכף
 * ע״י @@unique([jobId, kind])), ונסגרות אוטומטית כשהתנאי חדל להתקיים.
 */

/** ימים שאחריהם התראה נפתחת. */
const DAYS_QUOTE_UNAPPROVED = 3;
const DAYS_NO_PLACEMENT_REPORT = 7;
const DAYS_COLLECTION_OVERDUE = 2;

type AlertKind =
  | 'quote_not_approved'
  | 'approved_not_paid'
  | 'ready_no_date'
  | 'shipped_no_placement'
  | 'collection_approaching'
  | 'collection_overdue'
  | 'return_overdue'
  | 'detector_missing'
  | 'detector_disqualified'
  | 'results_no_report'
  | 'report_not_sent';

type Candidate = { jobId: string; kind: AlertKind; message: string; severity: 'info' | 'warning' | 'danger' };

@Injectable()
export class RadonAlertsService {
  private readonly logger = new Logger(RadonAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async tick() {
    try {
      await this.recompute();
    } catch (e: any) {
      this.logger.error(`radon alerts failed: ${e?.message}`);
    }
  }

  /**
   * מחשב מחדש את כל ההתראות: פותח חדשות, וסוגר כאלה שהתנאי שלהן כבר לא מתקיים.
   * החישוב הוא idempotent — הרצה חוזרת לא יוצרת כפילויות.
   */
  async recompute() {
    const jobs = await this.prisma.radonJob.findMany({
      where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
      include: {
        detectors: {
          where: { releasedAt: null },
          include: { detector: { select: { serialNumber: true, status: true } } },
        },
      },
      take: 1000,
    });

    const now = new Date();
    const candidates: Candidate[] = [];
    for (const job of jobs) candidates.push(...this.evaluate(job, now));

    // פתיחה/עדכון של ההתראות שזוהו.
    for (const c of candidates) {
      await this.prisma.radonAlert.upsert({
        where: { jobId_kind: { jobId: c.jobId, kind: c.kind } },
        create: { jobId: c.jobId, kind: c.kind, message: c.message, severity: c.severity },
        // התראה שנסגרה אוטומטית בעבר ושבה להתקיים — נפתחת מחדש.
        update: { message: c.message, severity: c.severity, resolvedAt: null },
      }).catch((e) => this.logger.warn(`upsert alert ${c.kind} failed: ${e?.message}`));
    }

    // סגירה של התראות שהתנאי שלהן חלף.
    const activeKeys = new Set(candidates.map((c) => `${c.jobId}::${c.kind}`));
    const open = await this.prisma.radonAlert.findMany({
      where: { resolvedAt: null },
      select: { id: true, jobId: true, kind: true },
    });
    const stale = open.filter((a) => !activeKeys.has(`${a.jobId}::${a.kind}`));
    if (stale.length) {
      await this.prisma.radonAlert.updateMany({
        where: { id: { in: stale.map((a) => a.id) } },
        data: { resolvedAt: now },
      });
    }

    this.logger.log(`radon alerts: active=${candidates.length} resolved=${stale.length}`);
    return { active: candidates.length, resolved: stale.length };
  }

  /** מעריך את כל החוקים עבור עבודה אחת. פונקציה טהורה מבחינת DB. */
  private evaluate(job: any, now: Date): Candidate[] {
    const out: Candidate[] = [];
    const add = (kind: AlertKind, message: string, severity: Candidate['severity'] = 'warning') =>
      out.push({ jobId: job.id, kind, message, severity });

    const daysSince = (d: Date | null) =>
      d ? Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000) : null;

    const detectors = job.detectors ?? [];
    const serials = detectors.map((a: any) => a.detector.serialNumber);

    // ── עבודה מוכנה לתיאום ואין תאריך ──
    if (job.track && !job.placedAt && job.status === 'OPEN') {
      const age = daysSince(job.createdAt);
      if (age != null && age >= DAYS_QUOTE_UNAPPROVED) {
        add('ready_no_date', `עבודת ראדון פתוחה ${age} ימים ללא תאריך הצבה.`);
      }
    }

    // ── גלאים נשלחו ללקוח ואין אישור הצבה (מסלול 4) ──
    const shipped = detectors.filter((a: any) =>
      ['SHIPPED_TO_CLIENT', 'WITH_CLIENT'].includes(a.detector.status));
    if (shipped.length && !job.clientReportedAt) {
      const age = daysSince(job.updatedAt);
      if (age != null && age >= DAYS_NO_PLACEMENT_REPORT) {
        add('shipped_no_placement',
          `הערכה נשלחה ללקוח לפני ${age} ימים והוא טרם דיווח על הצבה.`, 'danger');
      }
    }

    // ── מתקרב מועד איסוף / עבר מועד איסוף ──
    if (job.expectedEndAt && !job.collectedAt) {
      const daysLeft = Math.ceil((new Date(job.expectedEndAt).getTime() - now.getTime()) / 86_400_000);
      if (daysLeft < 0) {
        const overdue = Math.abs(daysLeft);
        if (job.detectors?.length) {
          // בדיקה עצמית → הלקוח אמור להחזיר ; אחרת → אנחנו אמורים לאסוף
          const isSelf = detectors.some((a: any) =>
            ['WITH_CLIENT', 'SHIPPED_TO_CLIENT'].includes(a.detector.status));
          if (isSelf) {
            add('return_overdue',
              `עבר מועד סיום הבדיקה ב-${overdue} ימים והלקוח טרם החזיר את הגלאים.`, 'danger');
          } else if (overdue >= DAYS_COLLECTION_OVERDUE) {
            add('collection_overdue',
              `עבר מועד האיסוף ב-${overdue} ימים והגלאים טרם נאספו.`, 'danger');
          }
        }
      } else if (daysLeft <= 2) {
        add('collection_approaching',
          daysLeft === 0
            ? 'מועד איסוף הגלאים הוא היום.'
            : `מועד איסוף הגלאים בעוד ${daysLeft} ימים.`,
          'info');
      }
    }

    // ── גלאי חסר / נפסל ──
    const lost = detectors.filter((a: any) => a.detector.status === 'LOST');
    if (lost.length) {
      add('detector_missing',
        `גלאי חסר בעבודה: ${lost.map((a: any) => a.detector.serialNumber).join(', ')}.`, 'danger');
    }
    const disqualified = detectors.filter((a: any) => a.detector.status === 'DISQUALIFIED');
    if (disqualified.length) {
      add('detector_disqualified',
        `גלאי נפסל בעבודה: ${disqualified.map((a: any) => a.detector.serialNumber).join(', ')}.`, 'danger');
    }

    // ── תוצאות התקבלו ואין דוח ──
    const withResults = detectors.filter((a: any) => a.detector.status === 'RESULT_RECEIVED');
    if (withResults.length && withResults.length === detectors.length && job.status !== 'REPORTED') {
      add('results_no_report',
        `התקבלו תוצאות לכל ${serials.length} הגלאים והדוח טרם הופק.`);
    }

    return out;
  }

  /** ההתראות הפתוחות — לתצוגה בממשק. */
  async listOpen() {
    return this.prisma.radonAlert.findMany({
      where: { resolvedAt: null, dismissedAt: null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: {
        job: {
          select: {
            id: true, taskId: true, customerId: true, track: true,
            siteAddress: true, contactName: true,
          },
        },
      },
      take: 200,
    });
  }

  /** סגירה ידנית של התראה ע״י משתמש. */
  async dismiss(id: string, userId?: string) {
    return this.prisma.radonAlert.update({
      where: { id },
      data: { dismissedAt: new Date(), dismissedBy: userId ?? null },
    });
  }
}
