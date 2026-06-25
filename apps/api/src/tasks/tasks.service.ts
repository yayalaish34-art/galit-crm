import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({
    projectId,
    scope,
    user,
  }: {
    projectId?: string;
    scope?: string;
    user?: { id?: string; role?: string };
  } = {}) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');

    const baseWhere: any = projectId ? { projectId } : {};
    // מנהל מערכת רואה את כל המשימות. כל שאר העובדים רואים כברירת מחדל
    // רק את המשימות שלהם, אך יכולים לבקש את כולן באמצעות scope=all.
    if (role !== 'ADMIN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      if ((scope || '').toLowerCase() !== 'all') {
        baseWhere.ownerId = user.id;
      }
    }

    return this.prisma.task.findMany({
      where: Object.keys(baseWhere).length ? baseWhere : undefined,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, projectNumber: true } },
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, email: true, company: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async create(data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      if (data?.ownerId && data.ownerId !== user.id) throw new ForbiddenException();
      data = { ...data, ownerId: user.id };
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    if (!data?.title || !String(data.title).trim()) {
      data = { ...data, title: await this.buildTaskTitle(data) };
    }
    return this.prisma.task.create({ data });
  }

  /**
   * בניית כותרת אוטומטית למשימה כשלא הוזנה כותרת ידנית.
   * פורמט: "שם לקוח — שם מוצר". נופל לשם הליד אם אין לקוח, ומדלג על המוצר אם חסר.
   */
  private async buildTaskTitle(data: any): Promise<string> {
    const product = String(data?.productName ?? '').trim();
    let who = '';

    const customerId = data?.customerId ?? data?.customer?.connect?.id;
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true },
      });
      who = String(customer?.name ?? '').trim();
    }

    if (!who) {
      const leadId = data?.leadId ?? data?.lead?.connect?.id;
      if (leadId) {
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: { fullName: true },
        });
        who = String(lead?.fullName ?? '').trim();
      }
    }

    return [who, product].filter(Boolean).join(' — ') || 'משימה חדשה';
  }

  async update(id: string, data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      const existing = await this.prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
      if (!existing || existing.ownerId !== user.id) throw new ForbiddenException();
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    return this.prisma.task.update({ where: { id }, data });
  }

  async remove(id: string, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      const existing = await this.prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
      if (!existing || existing.ownerId !== user.id) throw new ForbiddenException();
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    return this.prisma.task.delete({ where: { id } });
  }

  /** רשימת קבצים מצורפים למשימה (ללא תוכן הקובץ עצמו) */
  listAttachments(taskId: string) {
    return this.prisma.taskAttachment.findMany({
      where: { taskId },
      select: { id: true, fileName: true, mimeType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAttachment(taskId: string, fileName: string, mimeType: string, data: Buffer) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new ForbiddenException('Task not found');
    return this.prisma.taskAttachment.create({
      data: { taskId, fileName, mimeType, data: Uint8Array.from(data) },
      select: { id: true, fileName: true, mimeType: true, createdAt: true },
    });
  }

  getAttachment(attachmentId: string) {
    return this.prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  }

  async removeAttachment(attachmentId: string) {
    return this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
  }
}

