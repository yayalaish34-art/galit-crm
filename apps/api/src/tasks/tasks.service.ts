import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({ projectId, user }: { projectId?: string; user?: { id?: string; role?: string } } = {}) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');

    const baseWhere: any = projectId ? { projectId } : {};
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      baseWhere.ownerId = user.id;
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
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
    return this.prisma.task.create({ data });
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

