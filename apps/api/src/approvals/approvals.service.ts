import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ApprovalKind = 'EXEC_UNPAID_PRIVATE' | 'REPORT_UNPAID_PRIVATE';

/**
 * מי רשאי לאשר בקשות: יורם, גיא גבאי וגלית.
 * גלית רשומה כ-TECHNICIAN ולכן הייתה חסומה בעצמה ונדרשה לבקש אישור — הוספתה
 * לרשימה גם פוטרת אותה מהשער וגם מאפשרת לה לאשר לאחרים.
 *
 * למה לפי מייל ולא לפי role: RolesGuard נותן ל-ADMIN מעבר חופשי לכל @Roles,
 * ויש במערכת אדמין שלישי (guyf@galit.co.il) שלא אמור לאשר. הרשימה נשלטת
 * דרך APPROVAL_MANAGER_EMAILS (CSV) כדי שאפשר יהיה לשנות בלי דיפלוי.
 */
const DEFAULT_APPROVER_EMAILS = ['yoram@galit.co.il', 'guy@galit.co.il', 'galit@galit.co.il'];

export function approverEmails(): string[] {
  const raw = process.env.APPROVAL_MANAGER_EMAILS;
  const list = raw
    ? raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_APPROVER_EMAILS;
  return list.length ? list : DEFAULT_APPROVER_EMAILS;
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertApprover(userId: string | undefined) {
    if (!userId) throw new ForbiddenException('אין הרשאה לאשר בקשות');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const email = (user?.email || '').toLowerCase();
    if (!email || !approverEmails().includes(email)) {
      throw new ForbiddenException('רק יורם וגיא יכולים לאשר בקשות');
    }
  }

  /** האם המשתמש הנוכחי הוא מאשר — משמש את ה-frontend כדי להציג את מסך הבקשות. */
  async isApprover(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return approverEmails().includes((user?.email || '').toLowerCase());
  }

  /**
   * יצירת בקשת אישור. אידמפוטנטי: אם כבר קיימת בקשה PENDING לאותה משימה
   * ולאותו סוג — מוחזרת הבקשה הקיימת ולא נוצרת כפילות.
   */
  async create(
    userId: string | undefined,
    body: { taskId: string; kind: ApprovalKind; reason?: string },
  ) {
    if (!userId) throw new ForbiddenException('משתמש לא מזוהה');
    const { taskId, kind } = body;
    if (!taskId || !kind) throw new NotFoundException('חסר taskId או kind');

    const existing = await this.prisma.approvalRequest.findFirst({
      where: { taskId, kind, status: 'PENDING' },
    });
    if (existing) return this.decorate(existing);

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, customerId: true, customer: { select: { name: true } } },
    });
    if (!task) throw new NotFoundException('המשימה לא נמצאה');

    const created = await this.prisma.approvalRequest.create({
      data: {
        kind,
        taskId,
        customerId: task.customerId,
        customerName: task.customer?.name ?? null,
        taskTitle: task.title,
        reason: body.reason ?? null,
        requesterId: userId,
      },
    });
    return this.decorate(created);
  }

  /**
   * סטטוס הבקשה עבור העובד — נקרא ע"י הפופ-אפ בפולינג כדי לדעת מתי להשתחרר.
   * מוחזרת הבקשה האחרונה לאותה משימה+סוג (כולל APPROVED/REJECTED).
   */
  async statusFor(taskId: string, kind: ApprovalKind) {
    const req = await this.prisma.approvalRequest.findFirst({
      where: { taskId, kind },
      orderBy: { createdAt: 'desc' },
      include: { decider: { select: { name: true } } },
    });
    if (!req) return { status: 'NONE' as const };
    return {
      status: req.status,
      id: req.id,
      decidedAt: req.decidedAt,
      deciderName: req.decider?.name ?? null,
      decisionNote: req.decisionNote,
    };
  }

  /** כל הבקשות הממתינות — למסך המנהל. */
  async pending(userId: string | undefined) {
    await this.assertApprover(userId);
    const rows = await this.prisma.approvalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.decorate(r));
  }

  /** מונה לבאדג' בפעמון. מחזיר 0 למי שאינו מאשר (בלי לזרוק). */
  async pendingCount(userId: string | undefined) {
    if (!(await this.isApprover(userId))) return { count: 0 };
    const count = await this.prisma.approvalRequest.count({ where: { status: 'PENDING' } });
    return { count };
  }

  /**
   * הכרעה. ה-updateMany מותנה ב-status:'PENDING' כדי ששני מנהלים שלוחצים
   * במקביל לא ידרסו זה את הכרעת זה — הראשון זוכה.
   */
  async decide(
    userId: string | undefined,
    id: string,
    body: { approve: boolean; note?: string },
  ) {
    await this.assertApprover(userId);
    const res = await this.prisma.approvalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: body.approve ? 'APPROVED' : 'REJECTED',
        deciderId: userId,
        decidedAt: new Date(),
        decisionNote: body.note ?? null,
      },
    });
    if (res.count === 0) {
      const current = await this.prisma.approvalRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('הבקשה לא נמצאה');
      // כבר הוכרעה ע"י מנהל אחר — מחזירים את המצב הקיים במקום שגיאה.
      return this.decorate(current);
    }
    const updated = await this.prisma.approvalRequest.findUnique({ where: { id } });
    return this.decorate(updated!);
  }

  private decorate(r: any) {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      taskId: r.taskId,
      customerId: r.customerId,
      customerName: r.customerName,
      taskTitle: r.taskTitle,
      reason: r.reason,
      requesterId: r.requesterId,
      requesterName: r.requester?.name ?? null,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
    };
  }
}
