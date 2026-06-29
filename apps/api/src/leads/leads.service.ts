import { ForbiddenException, Injectable } from '@nestjs/common';
import { LeadStage, LeadStatus, Prisma, ProjectStatus, QuoteStatus, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        include: { assignedUser: true, customer: true, project: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        try {
          return await this.prisma.lead.findMany({
            orderBy: { createdAt: 'desc' },
          });
        } catch (e2) {
          if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === 'P2022') {
            return this.prisma.$queryRawUnsafe(`SELECT * FROM "Lead" ORDER BY "createdAt" DESC`);
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  async findOne(id: string) {
    return this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedUser: true,
        customer: true,
        project: true,
        opportunities: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async getActivities(id: string) {
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true },
    });
  }

  async create(data: any, user?: { id?: string }) {
    const normalized = await this.normalizeLeadPayload(data);
    const created = await this.prisma.lead.create({ data: normalized });
    await this.logActivity(created.id, 'CREATED', 'נוצר ליד', user?.id);
    return created;
  }

  async update(id: string, data: any, user?: { id?: string }) {
    const before = await this.prisma.lead.findUnique({ where: { id } });
    const normalized = await this.normalizeLeadPayload(data, { partial: true });
    const updated = await this.prisma.lead.update({ where: { id }, data: normalized });
    await this.logUpdateDiff(id, before, updated, user?.id);
    return updated;
  }

  async remove(id: string, actor?: { id?: string; role?: string }) {
    const role = (actor?.role || '').toUpperCase();

    // Stage 1: keep ADMIN/MANAGER operational even if flag is not set.
    if (role === 'ADMIN' || role === 'MANAGER') {
      return this.prisma.lead.delete({ where: { id } });
    }

    const userId = actor?.id;
    if (!userId) throw new ForbiddenException();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, canDeleteLeads: true },
    });

    if (!user?.canDeleteLeads) throw new ForbiddenException();

    return this.prisma.lead.delete({ where: { id } });
  }

  async updateStage(id: string, stage: LeadStage, user?: { id?: string }) {
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { stage },
    });
    await this.logActivity(id, 'STAGE', `עודכן שלב: ${stage}`, user?.id);
    return updated;
  }

  async convertToCustomer(id: string, user?: { id?: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) return null;
    if (lead.customerId) {
      await this.logActivity(id, 'CONVERT_TO_CUSTOMER', 'הליד כבר משויך ללקוח', user?.id);
      return this.prisma.customer.findUnique({ where: { id: lead.customerId } });
    }
    const name = lead.company || lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'לקוח חדש';
    const customer = await this.prisma.customer.create({
      data: {
        name,
        type: 'COMPANY',
        contactName: lead.fullName || name,
        phone: lead.phone || '',
        email: lead.email || '',
        city: lead.city || '',
        status: 'ACTIVE',
        services: lead.serviceType ? [lead.serviceType] : [],
        notes: lead.notes || null,
      },
    });
    await this.prisma.lead.update({ where: { id }, data: { customerId: customer.id } });
    await this.logActivity(id, 'CONVERT_TO_CUSTOMER', `נוצר לקוח: ${customer.name}`, user?.id);
    return customer;
  }

  async createQuoteFromLead(id: string, user?: { id?: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) return null;
    const customer = await this.convertToCustomer(id, user);
    const opportunity = await this.prisma.opportunity.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        projectOrServiceName: lead.serviceType || lead.service || 'שירות',
        estimatedValue: 0,
        pipelineStage: 'NEW',
        assignedUserId: lead.assignedUserId ?? user?.id ?? null,
        notes: lead.notes ?? null,
      },
    });
    const quote = await this.prisma.quote.create({
      data: {
        customerId: customer.id,
        leadId: lead.id,
        opportunityId: opportunity.id,
        service: lead.serviceType || lead.service || 'שירות',
        description: lead.notes || null,
        amount: 0,
        status: QuoteStatus.DRAFT,
        validTo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        validityDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        vatPercent: 17,
        amountBeforeVat: 0,
        totalAmount: 0,
        notes: `נוצר מליד ${lead.fullName || lead.firstName || ''}`.trim(),
      },
      include: { customer: true, opportunity: true, project: true },
    });
    await this.prisma.lead.update({ where: { id }, data: { leadStatus: LeadStatus.QUOTE_SENT } });
    await this.logActivity(
      id,
      'CREATE_QUOTE',
      `נוצרה הזדמנות + הצעת מחיר. הזדמנות: ${opportunity.id}, הצעה: ${quote.id}`,
      user?.id,
    );
    return quote;
  }

  async openProjectFromLead(id: string, user?: { id?: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) return null;
    if (lead.projectId) {
      await this.logActivity(id, 'OPEN_PROJECT', 'כבר קיים פרויקט לליד', user?.id);
      return this.prisma.project.findUnique({ where: { id: lead.projectId } });
    }
    const customer = lead.customerId ? await this.prisma.customer.findUnique({ where: { id: lead.customerId } }) : await this.convertToCustomer(id, user);
    const project = await this.prisma.project.create({
      data: {
        name: lead.serviceType ? `${lead.serviceType} – ${lead.fullName || customer.name}` : `פרויקט – ${lead.fullName || customer.name}`,
        client: customer?.name || lead.company || lead.fullName || 'לקוח',
        customerId: customer?.id ?? null,
        city: lead.city || null,
        address: lead.address || null,
        service: lead.serviceType || lead.service || null,
        serviceCategory: lead.serviceType || null,
        status: ProjectStatus.NEW,
        notes: lead.notes || null,
      },
    });
    await this.prisma.lead.update({ where: { id }, data: { projectId: project.id, leadStatus: LeadStatus.WON } });
    await this.logActivity(id, 'OPEN_PROJECT', `נפתח פרויקט: ${project.name}`, user?.id);
    return project;
  }

  private async logActivity(leadId: string, type: string, message?: string, createdById?: string) {
    try {
      await this.prisma.leadActivity.create({
        data: {
          leadId,
          type,
          message: message ?? null,
          createdById: createdById ?? null,
        },
      });
    } catch {
      // best-effort
    }
  }

  async addLeadActivity(
    leadId: string,
    input: { type?: string; message?: string },
    user?: { id?: string },
  ) {
    const type = (input?.type || 'MANUAL').toString();
    const message = (input?.message || '').toString().trim();
    if (!message) return null;
    await this.logActivity(leadId, type, message, user?.id);
    return this.prisma.leadActivity.findFirst({
      where: { leadId, type, message: message || undefined },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async logUpdateDiff(leadId: string, before: any, after: any, userId?: string) {
    if (!before || !after) return;
    const msgs: string[] = [];
    const track: Array<[string, string]> = [
      ['leadStatus', 'סטטוס'],
      ['nextFollowUpDate', 'פולואפ הבא'],
      ['followUp1Date', 'פולואפ 1'],
      ['followUp2Date', 'פולואפ 2'],
      ['assignedUserId', 'מטפל אחראי'],
      ['serviceType', 'סוג שירות'],
      ['source', 'מקור'],
      ['utm_source', 'utm_source'],
      ['city', 'עיר'],
    ];
    for (const [k, label] of track) {
      const b = (before as any)[k];
      const a = (after as any)[k];
      const bv = b instanceof Date ? b.toISOString() : b;
      const av = a instanceof Date ? a.toISOString() : a;
      if (bv !== av) msgs.push(`${label}: ${bv ?? '—'} → ${av ?? '—'}`);
    }
    if (msgs.length) await this.logActivity(leadId, 'UPDATED', msgs.join(' | '), userId);
  }

  private async normalizeLeadPayload(input: any, opts?: { partial?: boolean }) {
    const data = input ?? {};

    const fullName =
      data.fullName ||
      data.name ||
      [data.firstName, data.lastName].filter(Boolean).join(' ').trim() ||
      undefined;

    const serviceType = (data.serviceType || data.service || '').toString() || undefined;

    // Map stage/status to spec leadStatus when provided
    const statusCandidate = (data.leadStatus || data.stage || data.status || '').toString().toUpperCase();
    const leadStatus =
      (Object.values(LeadStatus) as string[]).includes(statusCandidate)
        ? (statusCandidate as LeadStatus)
        : undefined;

    const followUp1Date = data.followUp1Date ? new Date(data.followUp1Date) : undefined;
    const followUp2Date = data.followUp2Date ? new Date(data.followUp2Date) : undefined;
    const nextFollowUpDate = data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : undefined;

    const derivedNextFollowUpDate =
      nextFollowUpDate ??
      (() => {
        const dates = [followUp1Date, followUp2Date].filter(Boolean) as Date[];
        if (dates.length === 0) return undefined;
        // choose the earliest upcoming follow-up date
        return dates.sort((a, b) => a.getTime() - b.getTime())[0];
      })();

    let assignedUserId = data.assignedUserId ?? undefined;

    // Automation: default assignment by employee serviceDepartments / radon pool
    if (serviceType) {
      const isRadon = serviceType.toLowerCase() === 'radon' || serviceType === 'ראדון';
      if (isRadon) {
        assignedUserId = null; // radon pool
      } else if (!assignedUserId) {
        const candidates = await this.prisma.user.findMany({
          where: { status: UserStatus.ACTIVE, serviceDepartments: { has: serviceType } },
          select: { id: true, role: true },
        });

        // Simple rule: if multiple match, prioritize MANAGER -> EXPERT -> ADMIN -> SALES -> others.
        const priority: UserRole[] = [UserRole.MANAGER, UserRole.EXPERT, UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICIAN, UserRole.BILLING];
        const sorted = candidates
          .slice()
          .sort((a, b) => (priority.indexOf(a.role) === -1 ? 999 : priority.indexOf(a.role)) - (priority.indexOf(b.role) === -1 ? 999 : priority.indexOf(b.role)));

        assignedUserId = sorted[0]?.id ?? null;

        // Fallback: if no one is configured for that serviceType yet, keep legacy behavior.
        if (!assignedUserId) {
          const expert =
            (await this.prisma.user.findFirst({ where: { role: UserRole.MANAGER } })) ||
            (await this.prisma.user.findFirst({ where: { role: UserRole.SALES } })) ||
            (await this.prisma.user.findFirst({ where: { role: UserRole.ADMIN } }));
          assignedUserId = expert?.id ?? null;
        }
      }
    }

    const out: any = {};
    const setIf = (key: string, value: any) => {
      if (!opts?.partial || key in data) out[key] = value;
    };

    // Lead.firstName is required in the current schema.
    // For create flow, derive it from provided name/fullName when missing.
    if (!opts?.partial && !('firstName' in data)) {
      const derivedFirstName = (fullName || '').toString().trim();
      out.firstName = derivedFirstName || 'ליד';
    }

    setIf('fullName', fullName);
    setIf('phone', data.phone ?? undefined);
    setIf('email', data.email ?? undefined);
    setIf('city', data.city ?? undefined);
    setIf('address', data.address ?? undefined);
    setIf('source', data.source ?? undefined);
    setIf('utm_source', data.utm_source ?? undefined);
    setIf('utm_medium', data.utm_medium ?? undefined);
    setIf('utm_campaign', data.utm_campaign ?? undefined);
    setIf('utm_content', data.utm_content ?? undefined);
    setIf('utm_term', data.utm_term ?? undefined);
    setIf('serviceType', serviceType);
    if ('referralCompany' in data) setIf('referralCompany', data.referralCompany ?? null);
    if (leadStatus) setIf('leadStatus', leadStatus);
    if (followUp1Date) setIf('followUp1Date', followUp1Date);
    if (followUp2Date) setIf('followUp2Date', followUp2Date);
    if (derivedNextFollowUpDate) setIf('nextFollowUpDate', derivedNextFollowUpDate);
    if (assignedUserId !== undefined) setIf('assignedUserId', assignedUserId);

    // Keep legacy fields if present (don’t break current UI)
    if ('firstName' in data) setIf('firstName', data.firstName);
    if ('lastName' in data) setIf('lastName', data.lastName);
    if ('company' in data) setIf('company', data.company);
    if ('service' in data) setIf('service', data.service);
    if ('source' in data) setIf('source', data.source);
    if ('site' in data) setIf('site', data.site);
    if ('notes' in data) setIf('notes', data.notes);
    if ('stage' in data) setIf('stage', data.stage);
    if ('status' in data) setIf('status', data.status);
    if ('assignee' in data) setIf('assignee', data.assignee);
    if ('customerId' in data) setIf('customerId', data.customerId);
    if ('importLegacyId' in data) setIf('importLegacyId', data.importLegacyId != null ? String(data.importLegacyId).trim() || null : null);
    if ('projectId' in data) setIf('projectId', data.projectId || null);

    return out;
  }
}