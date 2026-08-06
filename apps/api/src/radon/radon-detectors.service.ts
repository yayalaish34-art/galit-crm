import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DETECTOR_STATUS_LABELS,
  RadonDetectorStatusId,
  allowedNextStatuses,
  canTransition,
  isAvailableForAssignment,
  isUnusableStatus,
} from './radon-detector-status';

/**
 * ניהול מלאי גלאי הראדון — "חיי הגלאי" (סעיף 7 + סעיף 11 באפיון).
 *
 * שני כללים נאכפים כאן ולא נסמכים על הממשק:
 *   1. מעבר סטטוס חייב להיות חוקי לפי מכונת המצבים.
 *   2. גלאי לא משויך לשתי עבודות במקביל — נבדק בקוד וגם ע״י אינדקס ייחודי
 *      חלקי ב-DB, כך שגם שתי בקשות מקבילות לא יוכלו להפר את הכלל.
 */
@Injectable()
export class RadonDetectorsService {
  private readonly logger = new Logger(RadonDetectorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** רשימת גלאים, עם סינון אופציונלי לפי סטטוס / חיפוש חופשי במספר סידורי. */
  async list(params: { status?: string; q?: string; availableOnly?: boolean } = {}) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.q?.trim()) {
      where.serialNumber = { contains: params.q.trim(), mode: 'insensitive' };
    }

    const rows = await this.prisma.radonDetector.findMany({
      where,
      orderBy: [{ status: 'asc' }, { serialNumber: 'asc' }],
      include: {
        assignments: {
          where: { releasedAt: null },
          select: { id: true, jobId: true, assignedAt: true, placedAt: true },
        },
      },
      take: 500,
    });

    const mapped = rows.map((d) => ({
      ...d,
      statusLabel: DETECTOR_STATUS_LABELS[d.status as RadonDetectorStatusId],
      activeAssignment: d.assignments[0] ?? null,
      available: isAvailableForAssignment(d.status as RadonDetectorStatusId) && !d.assignments.length,
      allowedNext: allowedNextStatuses(d.status as RadonDetectorStatusId),
      assignments: undefined,
    }));

    return params.availableOnly ? mapped.filter((d) => d.available) : mapped;
  }

  /** גלאי בודד, כולל יומן התנועות שלו. */
  async get(id: string) {
    const d = await this.prisma.radonDetector.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
        assignments: { orderBy: { assignedAt: 'desc' }, take: 50 },
      },
    });
    if (!d) throw new NotFoundException('גלאי לא נמצא');
    return {
      ...d,
      statusLabel: DETECTOR_STATUS_LABELS[d.status as RadonDetectorStatusId],
      allowedNext: allowedNextStatuses(d.status as RadonDetectorStatusId),
    };
  }

  /** קליטת גלאי חדש למלאי. */
  async create(data: {
    serialNumber: string;
    model?: string | null;
    calibratedAt?: string | null;
    calibrationDue?: string | null;
    notes?: string | null;
  }, byUserId?: string) {
    const serial = (data.serialNumber ?? '').trim();
    if (!serial) throw new BadRequestException('מספר סידורי הוא שדה חובה');

    const exists = await this.prisma.radonDetector.findUnique({ where: { serialNumber: serial } });
    if (exists) throw new ConflictException(`גלאי עם מספר סידורי ${serial} כבר קיים במלאי`);

    const detector = await this.prisma.radonDetector.create({
      data: {
        serialNumber: serial,
        model: data.model?.trim() || null,
        calibratedAt: data.calibratedAt ? new Date(data.calibratedAt) : null,
        calibrationDue: data.calibrationDue ? new Date(data.calibrationDue) : null,
        notes: data.notes?.trim() || null,
      },
    });

    await this.prisma.radonDetectorEvent.create({
      data: { detectorId: detector.id, toStatus: 'IN_STOCK', note: 'נקלט למלאי', byUserId: byUserId ?? null },
    });
    return detector;
  }

  /**
   * שינוי סטטוס גלאי. כל שינוי נרשם ביומן התנועות.
   * מעבר לא חוקי נחסם עם הודעה שמפרטת לאן כן אפשר לעבור.
   */
  async changeStatus(id: string, to: RadonDetectorStatusId, opts: {
    note?: string | null;
    jobId?: string | null;
    heldByUserId?: string | null;
    byUserId?: string | null;
  } = {}) {
    const detector = await this.prisma.radonDetector.findUnique({ where: { id } });
    if (!detector) throw new NotFoundException('גלאי לא נמצא');

    const from = detector.status as RadonDetectorStatusId;
    if (!canTransition(from, to)) {
      const allowed = allowedNextStatuses(from).map((s) => DETECTOR_STATUS_LABELS[s]).join(', ');
      throw new BadRequestException(
        `לא ניתן לעבור מ"${DETECTOR_STATUS_LABELS[from]}" ל"${DETECTOR_STATUS_LABELS[to]}". ` +
        (allowed ? `מעברים אפשריים: ${allowed}.` : 'זהו סטטוס סופי.'),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.radonDetector.update({
        where: { id },
        data: {
          status: to,
          heldByUserId: opts.heldByUserId !== undefined ? opts.heldByUserId : detector.heldByUserId,
        },
      });

      await tx.radonDetectorEvent.create({
        data: {
          detectorId: id,
          jobId: opts.jobId ?? null,
          fromStatus: from,
          toStatus: to,
          note: opts.note?.trim() || null,
          byUserId: opts.byUserId ?? null,
        },
      });

      // גלאי שאבד/נפסל משוחרר מהעבודה — אחרת הוא תוקע אותה ואי-אפשר לשייך מחליף.
      if (isUnusableStatus(to)) {
        await tx.radonDetectorAssignment.updateMany({
          where: { detectorId: id, releasedAt: null },
          data: { releasedAt: new Date() },
        });
      }

      return updated;
    });
  }

  /**
   * שיוך גלאי לעבודה.
   *
   * האילוץ המרכזי מסעיף 7: אותו גלאי לא בשתי עבודות במקביל. הבדיקה בקוד נותנת
   * הודעת שגיאה ברורה; האינדקס הייחודי החלקי ב-DB הוא הרשת שתופסת מרוץ בין
   * שתי בקשות מקבילות (P2002).
   */
  async assign(detectorId: string, jobId: string, byUserId?: string) {
    const [detector, job] = await Promise.all([
      this.prisma.radonDetector.findUnique({
        where: { id: detectorId },
        include: { assignments: { where: { releasedAt: null }, select: { jobId: true } } },
      }),
      this.prisma.radonJob.findUnique({ where: { id: jobId }, select: { id: true } }),
    ]);

    if (!detector) throw new NotFoundException('גלאי לא נמצא');
    if (!job) throw new NotFoundException('עבודת ראדון לא נמצאה');

    const status = detector.status as RadonDetectorStatusId;
    if (isUnusableStatus(status)) {
      throw new BadRequestException(
        `גלאי ${detector.serialNumber} בסטטוס "${DETECTOR_STATUS_LABELS[status]}" ואינו שמיש.`,
      );
    }
    const active = detector.assignments[0];
    if (active) {
      throw new ConflictException(
        active.jobId === jobId
          ? `גלאי ${detector.serialNumber} כבר משויך לעבודה הזו.`
          : `גלאי ${detector.serialNumber} משויך כרגע לעבודה אחרת ואינו זמין.`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.radonDetectorAssignment.create({
          data: { detectorId, jobId },
        });
        // שיוך מסמן את הגלאי כשמור לעבודה — אלא אם הוא כבר בדרך/בשטח.
        if (status === 'IN_STOCK') {
          await tx.radonDetector.update({ where: { id: detectorId }, data: { status: 'RESERVED' } });
          await tx.radonDetectorEvent.create({
            data: {
              detectorId, jobId, fromStatus: status, toStatus: 'RESERVED',
              note: 'שויך לעבודה', byUserId: byUserId ?? null,
            },
          });
        }
        return assignment;
      });
    } catch (e: any) {
      // P2002 = הפרת האינדקס הייחודי החלקי — בקשה מקבילה הקדימה אותנו.
      if (e?.code === 'P2002') {
        throw new ConflictException(`גלאי ${detector.serialNumber} שויך זה עתה לעבודה אחרת.`);
      }
      throw e;
    }
  }

  /** שחרור גלאי מעבודה (בלי למחוק את היסטוריית השיוך). */
  async release(detectorId: string, jobId: string, byUserId?: string) {
    const active = await this.prisma.radonDetectorAssignment.findFirst({
      where: { detectorId, jobId, releasedAt: null },
    });
    if (!active) throw new NotFoundException('אין שיוך פעיל של הגלאי לעבודה הזו');

    await this.prisma.radonDetectorAssignment.update({
      where: { id: active.id },
      data: { releasedAt: new Date() },
    });
    await this.prisma.radonDetectorEvent.create({
      data: { detectorId, jobId, toStatus: 'IN_STOCK', note: 'שוחרר מהעבודה', byUserId: byUserId ?? null },
    });
    return { released: true };
  }

  /** תיעוד הצבה בשטח — מספר גלאי + מיקום + תמונה (חובה במסלול טופס 4). */
  async recordPlacement(assignmentId: string, data: {
    placementNote?: string | null;
    placedAt?: string | null;
    photoBase64?: string | null;
  }, byUserId?: string) {
    const assignment = await this.prisma.radonDetectorAssignment.findUnique({
      where: { id: assignmentId },
      include: { detector: true },
    });
    if (!assignment) throw new NotFoundException('שיוך לא נמצא');
    if (assignment.releasedAt) throw new BadRequestException('השיוך כבר שוחרר');

    const note = data.placementNote?.trim();
    if (!note) throw new BadRequestException('חובה לרשום את מיקום ההצבה של הגלאי');

    const updated = await this.prisma.radonDetectorAssignment.update({
      where: { id: assignmentId },
      data: {
        placementNote: note,
        placedAt: data.placedAt ? new Date(data.placedAt) : new Date(),
        photoBase64: data.photoBase64 ?? assignment.photoBase64,
      },
    });

    const status = assignment.detector.status as RadonDetectorStatusId;
    if (canTransition(status, 'DEPLOYED')) {
      await this.changeStatus(assignment.detectorId, 'DEPLOYED', {
        jobId: assignment.jobId, note: `הוצב: ${note}`, byUserId,
      });
    }
    return updated;
  }

  /** תמונת מצב של המלאי — לתצוגה בראש מסך הגלאים. */
  async summary() {
    const grouped = await this.prisma.radonDetector.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.status] = g._count._all;

    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const available = (counts['IN_STOCK'] ?? 0);
    const inField = (counts['DEPLOYED'] ?? 0) + (counts['WITH_CLIENT'] ?? 0) + (counts['WITH_EMPLOYEE'] ?? 0);

    return {
      total,
      available,
      inField,
      unusable: (counts['LOST'] ?? 0) + (counts['DISQUALIFIED'] ?? 0),
      byStatus: Object.entries(counts).map(([status, count]) => ({
        status,
        label: DETECTOR_STATUS_LABELS[status as RadonDetectorStatusId] ?? status,
        count,
      })),
    };
  }
}
