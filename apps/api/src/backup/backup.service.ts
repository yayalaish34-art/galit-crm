import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * דשבורד בקרה/גיבוי למנהל — snapshot מלא של נתוני ה-CRM + בדיקת "סימני חיים" למסד.
 * נועד לתת בקרה: לראות שכל הנתונים קיימים, ולזהות מיד אם המסד נפל / התרוקן.
 */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  /** ספירת כל הטבלאות + בדיקת חיבור למסד. מהיר — לרענון תכוף. */
  async health() {
    const startedAt = Date.now();
    try {
      // בדיקת חיבור בסיסית
      await this.prisma.$queryRawUnsafe('SELECT 1');

      const [
        customers, leads, quotes, tasks, reports, projects,
        opportunities, documents, users, incomingLeads,
      ] = await Promise.all([
        this.prisma.customer.count(),
        this.prisma.lead.count(),
        this.prisma.quote.count(),
        this.prisma.task.count(),
        this.prisma.report.count(),
        this.prisma.project.count(),
        this.prisma.opportunity.count(),
        this.prisma.document.count(),
        this.prisma.user.count(),
        this.prisma.incomingLead.count(),
      ]);

      const counts = { customers, leads, quotes, tasks, reports, projects, opportunities, documents, users, incomingLeads };
      const totalRecords = customers + leads + quotes + tasks + reports + projects + opportunities + documents + incomingLeads;

      return {
        dbConnected: true,
        // המסד "בריא" אם הוא מחובר ויש בו לפחות עובדים (טבלת הליבה שתמיד אמורה להיות מאוכלסת)
        dbHealthy: users > 0,
        latencyMs: Date.now() - startedAt,
        counts,
        totalRecords,
        checkedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return {
        dbConnected: false,
        dbHealthy: false,
        latencyMs: Date.now() - startedAt,
        error: e?.message || String(e),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /** snapshot מלא — כל הרשומות של 5 טבלאות הליבה, לתצוגה בטבלאות. */
  async snapshot() {
    const [customers, leads, quotes, tasks, reports] = await Promise.all([
      this.prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, contactName: true, phone: true, email: true, city: true, status: true, leadSource: true, createdAt: true },
      }),
      this.prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, firstName: true, lastName: true, phone: true, email: true, company: true, city: true, serviceType: true, service: true, source: true, leadStatus: true, createdAt: true, assignedUser: { select: { name: true } } },
      }),
      this.prisma.quote.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, quoteNumber: true, customerName: true, service: true, amount: true, totalAmount: true, status: true, validTo: true, sentAt: true, createdAt: true, customer: { select: { name: true } } },
      }),
      this.prisma.task.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, type: true, status: true, priority: true, dueDate: true, createdAt: true, owner: { select: { name: true } }, customer: { select: { name: true } } },
      }),
      this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, reportType: true, status: true, reportDate: true, sentAt: true, createdAt: true, customer: { select: { name: true } }, createdBy: { select: { name: true } } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      customers: customers.map((c) => ({
        שם: c.name, סיווג: c.type, אישקשר: c.contactName, טלפון: c.phone,
        אימייל: c.email, עיר: c.city, סטטוס: c.status, מקור: c.leadSource ?? '', נוצר: c.createdAt,
      })),
      leads: leads.map((l) => ({
        שם: l.fullName || `${l.firstName} ${l.lastName ?? ''}`.trim(), טלפון: l.phone ?? '',
        אימייל: l.email ?? '', חברה: l.company ?? '', עיר: l.city ?? '',
        שירות: l.serviceType ?? l.service ?? '', מקור: l.source ?? '', סטטוס: l.leadStatus,
        מטפל: l.assignedUser?.name ?? '', נוצר: l.createdAt,
      })),
      quotes: quotes.map((q) => ({
        מספר: q.quoteNumber ?? '', לקוח: q.customer?.name ?? q.customerName ?? '', שירות: q.service,
        סכום: q.totalAmount ?? q.amount ?? 0, סטטוס: q.status, תוקף: q.validTo, נשלח: q.sentAt ?? '', נוצר: q.createdAt,
      })),
      tasks: tasks.map((t) => ({
        כותרת: t.title, לקוח: t.customer?.name ?? '', שלב: t.type, סטטוס: t.status,
        עדיפות: t.priority, מטפל: t.owner?.name ?? '', יעד: t.dueDate ?? '', נוצר: t.createdAt,
      })),
      reports: reports.map((r) => ({
        כותרת: r.title, לקוח: r.customer?.name ?? '', סוג: r.reportType, סטטוס: r.status,
        נוצרעי: r.createdBy?.name ?? '', תאריך: r.reportDate ?? '', נשלח: r.sentAt ?? '', נוצר: r.createdAt,
      })),
    };
  }
}
