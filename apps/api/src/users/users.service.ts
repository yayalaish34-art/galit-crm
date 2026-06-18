import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User, UserRole, UserStatus, WorkMode, WorkStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { encryptSecret, decryptSecret } from '../common/crypto.util';

// ── AES-256-CBC encryption helpers for SMTP password (shared util) ──
const encryptSmtpPassword = encryptSecret;
export const decryptSmtpPassword = decryptSecret;

/** Fields that must never be sent to the frontend (heavy or secret) */
const OMIT_SENSITIVE = {
  password: true as const,
  smtpPassword: true as const,
  mailSignatureImage: true as const,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCanManageUsers(actor?: { id?: string; role?: string }) {
    const role = (actor?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');

    // Role-based fallback (stage 1 operational behavior).
    if (role === 'ADMIN' || role === 'MANAGER') return;

    const userId = actor?.id;
    if (!userId) throw new UnauthorizedException('Missing user id');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, canManageUsers: true },
    });

    if (!user?.canManageUsers) throw new ForbiddenException();
  }

  /**
   * List users for UI (dropdowns, admin screens). Access is enforced by RolesGuard on the controller.
   * Does not require canManageUsers — that flag applies to destructive/admin mutations only.
   * Omits password; falls back to raw SQL if Prisma schema is ahead of DB (P2022).
   */
  async findAll(_actor?: { id?: string; role?: string }) {
    try {
      return await this.prisma.user.findMany({
        omit: OMIT_SENSITIVE,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "User"`);
        return rows.map((r) => {
          const u = this.normalizeUserRow(r);
          const { password: _omit, smtpPassword: _omit2, ...safe } = u;
          return safe;
        });
      }
      throw e;
    }
  }

  async findOne(id: string, _actor?: { id?: string; role?: string }) {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        omit: OMIT_SENSITIVE,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "User" WHERE id = $1 LIMIT 1`,
          id,
        );
        const row = rows[0];
        if (!row) return null;
        const u = this.normalizeUserRow(row);
        const { password: _omit, smtpPassword: _omit2, ...safe } = u;
        return safe;
      }
      throw e;
    }
  }

  async create(data: any, actor?: { id?: string; role?: string }) {
    await this.assertCanManageUsers(actor);

    const {
      password,
      role,
      status,
      phone,
      department,
      serviceDepartments,
      canViewFinance,
      canEditFinance,
      canDeleteCustomers,
      canDeleteLeads,
      canManageUsers,
      canManagePermissions,
      canViewAllRecords,
      ...rest
    } = data || {};

    if (!password || !rest?.email || !rest?.name) {
      throw new BadRequestException('שם, אימייל וסיסמה הם שדות חובה.');
    }

    const normalizedRole =
      (role || UserRole.SALES).toString().toUpperCase() as UserRole;
    const normalizedStatus =
      (status || UserStatus.ACTIVE).toString().toUpperCase() as UserStatus;

    const normalizedServiceDepartments: string[] = Array.isArray(serviceDepartments)
      ? serviceDepartments.map((x) => String(x)).filter(Boolean)
      : department
        ? [String(department)]
        : [];

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const payload: Prisma.UserCreateInput = {
      name: rest.name,
      email: rest.email,
      password: hashedPassword,
      role: normalizedRole,
      status: normalizedStatus,
      phone: phone ?? null,
      department: department ?? normalizedServiceDepartments[0] ?? null,
      serviceDepartments: normalizedServiceDepartments,
      canViewFinance: !!canViewFinance,
      canEditFinance: !!canEditFinance,
      canDeleteCustomers: !!canDeleteCustomers,
      canDeleteLeads: !!canDeleteLeads,
      canManageUsers: !!canManageUsers,
      canManagePermissions: !!canManagePermissions,
      canViewAllRecords: !!canViewAllRecords,
    };

    try {
      return await this.prisma.user.create({
        data: payload,
        omit: OMIT_SENSITIVE,
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('UsersService.create error:', e);
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        Array.isArray((e.meta as any)?.target) &&
        (e.meta as any).target.includes('email')
      ) {
        throw new BadRequestException('אימייל זה כבר קיים במערכת.');
      }
      throw e;
    }
  }

  async update(id: string, data: any, actor?: { id?: string; role?: string }) {
    await this.assertCanManageUsers(actor);

    const normalized: any = { ...(data || {}) };
    // Image fields are handled via dedicated endpoints — never via generic update.
    delete normalized.mailSignatureImage;
    delete normalized.mailSignatureImageType;
    if ('password' in normalized) {
      const p = normalized.password;
      if (p === undefined || p === null || String(p).trim() === '') {
        delete normalized.password;
      } else {
        normalized.password = await bcrypt.hash(String(p), 10);
      }
    }
    // ── SMTP password: encrypt if provided, skip if empty ──
    if ('smtpPassword' in normalized) {
      const sp = normalized.smtpPassword;
      if (sp === undefined || sp === null || String(sp).trim() === '') {
        delete normalized.smtpPassword; // don't overwrite existing
      } else {
        normalized.smtpPassword = encryptSmtpPassword(String(sp));
      }
    }
    if ('serviceDepartments' in normalized) {
      normalized.serviceDepartments = Array.isArray(normalized.serviceDepartments)
        ? normalized.serviceDepartments.map((x: any) => String(x)).filter(Boolean)
        : [];
      // keep legacy field in sync for display-only
      if (!('department' in normalized)) normalized.department = normalized.serviceDepartments[0] ?? null;
    }
    return this.prisma.user.update({ where: { id }, data: normalized, omit: OMIT_SENSITIVE });
  }

  /** Set or clear the user's signature image (base64 in, stored as bytes). */
  async setSignatureImage(
    id: string,
    dataBase64: string | null,
    mimeType: string | null,
    _actor?: { id?: string; role?: string },
  ) {
    // A user may edit their own; managers may edit anyone.
    if (_actor?.id !== id) {
      await this.assertCanManageUsers(_actor);
    }
    if (!dataBase64) {
      await this.prisma.user.update({
        where: { id },
        data: { mailSignatureImage: null, mailSignatureImageType: null },
      });
      return { success: true, cleared: true };
    }
    // Strip a data-URL prefix if present.
    const clean = dataBase64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(clean, 'base64');
    if (buf.length > 2 * 1024 * 1024) {
      throw new BadRequestException('תמונת החתימה גדולה מדי (מקסימום 2MB)');
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        mailSignatureImage: Uint8Array.from(buf),
        mailSignatureImageType: mimeType || 'image/png',
      },
    });
    return { success: true };
  }

  /** Return the signature image as base64 for preview. */
  async getSignatureImage(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { mailSignatureImage: true, mailSignatureImageType: true },
    });
    if (!u?.mailSignatureImage) return { dataBase64: null, mimeType: null };
    return {
      dataBase64: Buffer.from(u.mailSignatureImage).toString('base64'),
      mimeType: u.mailSignatureImageType || 'image/png',
    };
  }

  async remove(id: string, actor?: { id?: string; role?: string }) {
    await this.assertCanManageUsers(actor);
    /** לא מוחקים רשומת משתמש — רק מסמנים כלא פעיל (לא יכול להתחבר) */
    return this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
    });
  }

  /** העברת שיוכים בין עובדים (מנהלים בלבד) */
  async transferAssignments(
    fromUserId: string,
    toUserId: string,
    options: {
      leads?: boolean;
      customers?: boolean;
      tasks?: boolean;
      projects?: boolean;
      quotes?: boolean;
      /** לא בשימוש — פעילויות שומרות createdById כהיסטוריה */
      activities?: boolean;
    },
    actor?: { id?: string; role?: string },
  ) {
    await this.assertCanManageUsers(actor);
    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      throw new BadRequestException('יש לבחור עובד מקור ויעד שונים');
    }
    const [from, to] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fromUserId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: toUserId }, select: { id: true } }),
    ]);
    if (!from || !to) throw new BadRequestException('משתמש לא נמצא');

    const counts: Record<string, number> = {};

    await this.prisma.$transaction(async (tx) => {
      if (options.leads) {
        const r = await tx.lead.updateMany({
          where: { assignedUserId: fromUserId },
          data: { assignedUserId: toUserId },
        });
        counts.leads = r.count;
      }
      if (options.customers) {
        /** "לקוחות" = הזדמנויות מכירה משויכות לעובד (אין owner ישיר על Customer) */
        const r = await tx.opportunity.updateMany({
          where: { assignedUserId: fromUserId },
          data: { assignedUserId: toUserId },
        });
        counts.customers = r.count;
      } else if (options.quotes) {
        /** "הצעות מחיר" = הזדמנויות שיש להן לפחות הצעת מחיר אחת */
        const quoteOpps = await tx.quote.findMany({
          where: { opportunityId: { not: null } },
          select: { opportunityId: true },
          distinct: ['opportunityId'],
        });
        const ids = quoteOpps.map((q) => q.opportunityId).filter(Boolean) as string[];
        if (ids.length) {
          const r = await tx.opportunity.updateMany({
            where: { id: { in: ids }, assignedUserId: fromUserId },
            data: { assignedUserId: toUserId },
          });
          counts.quotes = r.count;
        } else {
          counts.quotes = 0;
        }
      }
      if (options.tasks) {
        const r = await tx.task.updateMany({
          where: { ownerId: fromUserId },
          data: { ownerId: toUserId },
        });
        counts.tasks = r.count;
      }
      if (options.projects) {
        const a = await tx.project.updateMany({
          where: { assignedTechnicianId: fromUserId },
          data: { assignedTechnicianId: toUserId },
        });
        const b = await tx.project.updateMany({
          where: { assignedReportWriterId: fromUserId },
          data: { assignedReportWriterId: toUserId },
        });
        counts.projects = a.count + b.count;
      }
      /** לא מעדכנים LeadActivity.createdById — שומרים יוצר היסטורי */
      if (options.activities) {
        counts.activities = 0;
      }
    });

    return { ok: true, counts };
  }

  /** העתקת תפקיד והרשאות משדות מעובד קיים */
  async copyPermissionsFromUser(fromUserId: string, toUserId: string, actor?: { id?: string; role?: string }) {
    await this.assertCanManageUsers(actor);
    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      throw new BadRequestException('יש לבחור עובד מקור ויעד שונים');
    }
    const from = await this.prisma.user.findUnique({ where: { id: fromUserId } });
    if (!from) throw new BadRequestException('משתמש מקור לא נמצא');

    return this.prisma.user.update({
      where: { id: toUserId },
      data: {
        role: from.role,
        canViewFinance: from.canViewFinance,
        canEditFinance: from.canEditFinance,
        canDeleteCustomers: from.canDeleteCustomers,
        canDeleteLeads: from.canDeleteLeads,
        canManageUsers: from.canManageUsers,
        canManagePermissions: from.canManagePermissions,
        canViewAllRecords: from.canViewAllRecords,
        serviceDepartments: [...(from.serviceDepartments || [])],
        department: from.department ?? null,
      },
    });
  }

  /**
   * Map a raw DB row to User when some Prisma columns were missing before migration
   * (defaults match schema.prisma).
   */
  private normalizeUserRow(row: Record<string, unknown>): User {
    const r = row as Record<string, any>;
    const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(v as string | number) : null);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      password: String(r.passwordHash ?? r.password ?? ''),
      role: r.role as UserRole,
      status: r.status as UserStatus,
      phone: r.phone ?? null,
      department: r.department ?? null,
      serviceDepartments: Array.isArray(r.serviceDepartments) ? r.serviceDepartments : [],
      createdAt: d(r.createdAt) ?? new Date(),
      updatedAt: d(r.updatedAt) ?? new Date(),
      canViewFinance: Boolean(r.canViewFinance ?? false),
      canEditFinance: Boolean(r.canEditFinance ?? false),
      canDeleteCustomers: Boolean(r.canDeleteCustomers ?? false),
      canDeleteLeads: Boolean(r.canDeleteLeads ?? false),
      canManageUsers: Boolean(r.canManageUsers ?? false),
      canManagePermissions: Boolean(r.canManagePermissions ?? false),
      canViewAllRecords: Boolean(r.canViewAllRecords ?? false),
      workStatus: (r.workStatus as WorkStatus) ?? WorkStatus.OFFLINE,
      isOnline: Boolean(r.isOnline ?? false),
      lastSeenAt: r.lastSeenAt ? d(r.lastSeenAt) : null,
      currentWorkMode: (r.currentWorkMode as WorkMode | null) ?? null,
      currentProjectId: r.currentProjectId ?? null,
    } as User;
  }

  async updatePresence(
    id: string,
    data: { isOnline?: boolean; currentWorkMode?: WorkMode | null; currentProjectId?: string | null; lastSeenAt?: Date },
    actor?: { id?: string; role?: string },
  ) {
    const role = (actor?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    const isAdmin = role === 'ADMIN';
    if (!isAdmin && actor?.id !== id) throw new ForbiddenException();

    const payload: any = {};
    if (typeof data.isOnline === 'boolean') payload.isOnline = data.isOnline;
    if ('currentWorkMode' in data) payload.currentWorkMode = data.currentWorkMode ?? null;
    if ('currentProjectId' in data) payload.currentProjectId = data.currentProjectId ?? null;
    payload.lastSeenAt = data.lastSeenAt ?? new Date();

    return this.prisma.user.update({
      where: { id },
      data: payload,
      select: { id: true, isOnline: true, lastSeenAt: true, currentWorkMode: true, currentProjectId: true, role: true, name: true },
    });
  }

  async activeNow(actor?: { id?: string; role?: string }) {
    const role = (actor?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    const now = new Date();
    const threshold = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes

    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ isOnline: true }, { lastSeenAt: { gte: threshold } }],
      },
      select: { id: true, name: true, email: true, role: true, isOnline: true, lastSeenAt: true, currentWorkMode: true, currentProjectId: true, currentProject: { select: { id: true, name: true } } },
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
    });

    const techIds = users.filter((u) => u.role === UserRole.TECHNICIAN).map((u) => u.id);
    const techProjects = techIds.length
      ? await this.prisma.project.findMany({
          where: { assignedTechnicianId: { in: techIds }, status: { in: ['SCHEDULED', 'ON_THE_WAY', 'FIELD_WORK_DONE', 'WAITING_DATA'] as any } },
          select: { id: true, name: true, assignedTechnicianId: true },
          orderBy: [{ updatedAt: 'desc' }],
        })
      : [];

    return users.map((u) => ({
      ...u,
      activeNow: true,
      currentProject: u.currentProject ?? (
        u.role === UserRole.TECHNICIAN
          ? (() => {
              const p = techProjects.find((x) => x.assignedTechnicianId === u.id);
              return p ? { id: p.id, name: p.name } : null;
            })()
          : null
      ),
    }));
  }

  /**
   * בדיקת חיבור SMTP עם הגדרות אישיות של משתמש.
   * מקבל או את ה-ID של המשתמש (קורא מה-DB ומפענח סיסמה),
   * או הגדרות ישירות מה-body (לבדיקה לפני שמירה).
   */
  async testSmtpConnection(
    userId: string,
    override?: { smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string; smtpSecure?: boolean },
  ): Promise<{ ok: true; message: string }> {
    let host: string | undefined;
    let port: number;
    let user: string | undefined;
    let pass: string | undefined;
    let secure: boolean;

    if (override?.smtpHost && override?.smtpUser && override?.smtpPassword) {
      // Use values from body (pre-save test)
      host = override.smtpHost;
      port = override.smtpPort || 587;
      user = override.smtpUser;
      pass = override.smtpPassword;
      secure = !!override.smtpSecure;
    } else {
      // Read from DB
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPassword: true, smtpSecure: true },
      });
      if (!dbUser?.smtpHost || !dbUser?.smtpUser || !dbUser?.smtpPassword) {
        throw new BadRequestException('הגדרות SMTP לא מוגדרות למשתמש זה');
      }
      host = dbUser.smtpHost;
      port = dbUser.smtpPort || 587;
      user = dbUser.smtpUser;
      pass = decryptSmtpPassword(dbUser.smtpPassword);
      secure = !!dbUser.smtpSecure;
    }

    if (!host || !user || !pass) {
      throw new BadRequestException('חסרים שדות SMTP — יש למלא host, user וסיסמה');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
    });

    try {
      await transporter.verify();
      return { ok: true, message: 'חיבור SMTP תקין' };
    } catch (e: any) {
      throw new BadRequestException(`חיבור SMTP נכשל: ${e.message || e}`);
    }
  }
}

