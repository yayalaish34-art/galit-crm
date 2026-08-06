import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RADON_LABELS,
  RadonAnswers,
  getTrack,
  isRadonTestSku,
  resolveTrack,
  RadonTrackId,
} from './radon-tracks';
import { validateStageAdvance } from './radon-rules';

/**
 * עבודת ראדון — השאלון, קביעת המסלול, וההתקדמות בשלבים.
 *
 * העבודה חיה במקביל למשימה הרגילה ב-CRM ולא מחליפה אותה: taskId הוא קישור
 * רופף בלבד, כך ששום דבר בצינור הקיים לא משתנה.
 */
@Injectable()
export class RadonJobsService {
  private readonly logger = new Logger(RadonJobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** פתיחת עבודת ראדון. נקראת כשנבחר אחד מקודי בדיקות הראדון. */
  async create(data: {
    sku: string;
    taskId?: string | null;
    customerId?: string | null;
    leadId?: string | null;
    answers?: RadonAnswers;
  }) {
    const sku = (data.sku ?? '').trim();
    if (!isRadonTestSku(sku)) {
      throw new BadRequestException(`קוד השירות ${sku || '(ריק)'} אינו בדיקת ראדון`);
    }

    // עבודה קיימת לאותה משימה — מחזירים אותה במקום לפתוח כפילות.
    if (data.taskId) {
      const existing = await this.prisma.radonJob.findFirst({ where: { taskId: data.taskId } });
      if (existing) return this.decorate(existing);
    }

    const answers = data.answers ?? {};
    const resolution = resolveTrack(answers);

    const job = await this.prisma.radonJob.create({
      data: {
        sku,
        taskId: data.taskId ?? null,
        customerId: data.customerId ?? null,
        leadId: data.leadId ?? null,
        answers: answers as any,
        track: resolution.status === 'resolved' ? resolution.track.id : null,
        trackWarnings: resolution.warnings as any,
        detectorCount: answers.detectorCount ?? null,
        siteAddress: answers.siteAddress ?? null,
        contactName: answers.contactName ?? null,
        contactPhone: answers.contactPhone ?? null,
      },
    });
    return this.decorate(job);
  }

  /**
   * עדכון תשובות השאלון. המסלול מחושב מחדש בכל שמירה — כך שהמשתמש רואה
   * מיד לאן התשובות מובילות, וסתירה נחסמת ברגע שנוצרת.
   */
  async updateAnswers(id: string, answers: RadonAnswers) {
    const job = await this.prisma.radonJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('עבודת ראדון לא נמצאה');

    const merged: RadonAnswers = { ...(job.answers as RadonAnswers), ...answers };
    const resolution = resolveTrack(merged);

    if (resolution.status === 'conflict') {
      throw new BadRequestException(resolution.reason);
    }

    // שינוי מסלול אחרי שכבר שויכו גלאים מסכן את עקביות הנתונים.
    const nextTrack = resolution.status === 'resolved' ? resolution.track.id : null;
    if (job.track && nextTrack && nextTrack !== job.track) {
      const assigned = await this.prisma.radonDetectorAssignment.count({
        where: { jobId: id, releasedAt: null },
      });
      if (assigned > 0) {
        throw new BadRequestException(
          'לא ניתן לשנות את מסלול הבדיקה אחרי ששויכו גלאים לעבודה. יש לשחרר את הגלאים תחילה.',
        );
      }
    }

    const updated = await this.prisma.radonJob.update({
      where: { id },
      data: {
        answers: merged as any,
        track: nextTrack,
        trackWarnings: resolution.warnings as any,
        // אם המסלול השתנה — מתחילים את ציר השלבים מחדש.
        stageIndex: nextTrack !== job.track ? 0 : job.stageIndex,
        detectorCount: merged.detectorCount ?? job.detectorCount,
        siteAddress: merged.siteAddress ?? job.siteAddress,
        contactName: merged.contactName ?? job.contactName,
        contactPhone: merged.contactPhone ?? job.contactPhone,
      },
    });
    return this.decorate(updated);
  }

  async get(id: string) {
    const job = await this.prisma.radonJob.findUnique({
      where: { id },
      include: {
        detectors: {
          include: { detector: { select: { id: true, serialNumber: true, status: true, model: true } } },
          orderBy: { assignedAt: 'asc' },
        },
        alerts: { where: { resolvedAt: null, dismissedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!job) throw new NotFoundException('עבודת ראדון לא נמצאה');
    return this.decorate(job);
  }

  /** איתור עבודה לפי המשימה שאליה היא מקושרת — נקודת הכניסה מהממשק. */
  async getByTask(taskId: string) {
    const job = await this.prisma.radonJob.findFirst({
      where: { taskId },
      include: {
        detectors: {
          include: { detector: { select: { id: true, serialNumber: true, status: true, model: true } } },
        },
        alerts: { where: { resolvedAt: null, dismissedAt: null } },
      },
    });
    return job ? this.decorate(job) : null;
  }

  async list(params: { status?: string; track?: string } = {}) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.track) where.track = params.track;

    const jobs = await this.prisma.radonJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        detectors: { where: { releasedAt: null }, select: { id: true } },
        alerts: { where: { resolvedAt: null, dismissedAt: null }, select: { id: true, severity: true } },
      },
      take: 200,
    });
    return jobs.map((j) => this.decorate(j));
  }

  /**
   * קידום העבודה לשלב הבא. חוקי החסימה (סעיף 10 באפיון) נאכפים כאן —
   * למשל: אי-אפשר לעבור ל"גלאים בשטח" בלי שתועדו מספרי גלאים.
   */
  async advanceStage(id: string, toIndex?: number) {
    const job = await this.prisma.radonJob.findUnique({
      where: { id },
      include: {
        detectors: {
          where: { releasedAt: null },
          include: { detector: { select: { serialNumber: true, status: true } } },
        },
      },
    });
    if (!job) throw new NotFoundException('עבודת ראדון לא נמצאה');
    if (!job.track) {
      throw new BadRequestException('יש להשלים את שאלון הפתיחה לפני קידום העבודה');
    }

    const track = getTrack(job.track as RadonTrackId);
    const next = toIndex ?? job.stageIndex + 1;
    if (next < 0 || next >= track.stages.length) {
      throw new BadRequestException('שלב לא קיים במסלול זה');
    }

    const problems = validateStageAdvance({ job, track, toIndex: next });
    if (problems.length) {
      throw new BadRequestException(problems.join(' '));
    }

    const updated = await this.prisma.radonJob.update({
      where: { id },
      data: { stageIndex: next, status: this.statusForStage(track.stages[next]) },
    });
    return this.decorate(updated);
  }

  /** דיווח הצבה מהלקוח (מסלול 4) — התאריך והמיקומים מגיעים מהלקוח עצמו. */
  async reportClientPlacement(id: string, data: {
    placedAt: string;
    expectedEndAt?: string | null;
  }) {
    const job = await this.prisma.radonJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('עבודת ראדון לא נמצאה');
    if (!data.placedAt) throw new BadRequestException('חובה לציין את תאריך ההצבה');

    const placedAt = new Date(data.placedAt);
    if (Number.isNaN(placedAt.getTime())) throw new BadRequestException('תאריך הצבה לא תקין');

    return this.decorate(await this.prisma.radonJob.update({
      where: { id },
      data: {
        clientReportedAt: placedAt,
        placedAt: job.placedAt ?? placedAt,
        expectedEndAt: data.expectedEndAt ? new Date(data.expectedEndAt) : job.expectedEndAt,
        status: 'IN_FIELD',
      },
    }));
  }

  /** מיפוי שם השלב לסטטוס העבודה — לתצוגה ולסינון ברשימות. */
  private statusForStage(stageName: string): any {
    if (/סגירה|סגירת עבודה/.test(stageName)) return 'CLOSED';
    if (/שליחת דוח|דוח/.test(stageName)) return 'REPORTED';
    if (/אנליזה|תוצאות/.test(stageName)) return 'IN_ANALYSIS';
    if (/בשטח|בדיקה פעילה|תקופת בדיקה|הצבת גלאים/.test(stageName)) return 'IN_FIELD';
    return 'OPEN';
  }

  /** מעשיר את הרשומה בנתוני המסלול — כך שהממשק לא צריך להכיר את טבלת ההחלטה. */
  private decorate(job: any) {
    const track = job.track ? getTrack(job.track as RadonTrackId) : null;
    const answers = (job.answers ?? {}) as RadonAnswers;

    return {
      ...job,
      trackName: track?.name ?? null,
      trackSummary: track?.summary ?? null,
      stages: track?.stages ?? [],
      currentStage: track ? track.stages[job.stageIndex] ?? null : null,
      requiresLicensedInspector: track?.requiresLicensedInspector ?? false,
      isSelfService: track?.isSelfService ?? false,
      /** התשובות בעברית — לתצוגה ולתבניות ההודעות */
      answersLabeled: {
        purpose: answers.purpose ? RADON_LABELS.purpose[answers.purpose] : null,
        testType: answers.testType ? RADON_LABELS.testType[answers.testType] : null,
        method: answers.method ? RADON_LABELS.method[answers.method] : null,
        propertyType: answers.propertyType ? RADON_LABELS.propertyType[answers.propertyType] : null,
        groundContact: answers.groundContact ? RADON_LABELS.groundContact[answers.groundContact] : null,
      },
    };
  }
}
