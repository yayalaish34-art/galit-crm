import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readMarketingConsent } from './marketing-consent.util';

/**
 * ── רשימת הדיוור ─────────────────────────────────────────────────────────────
 * "כל הלקוחות שאישרו דיוור" — מוצג כסקשן בדשבורד של יורם.
 *
 * מאיפה מגיע האישור: כל 9 טפסי הלידים באתר galit.co.il כוללים תיבת סימון
 * `marketing_consent`. הטפסים שולחים את הפנייה כמייל התראה, ה-CRM קולט אותו
 * כ-IncomingLead, ומהגוף נקרא האישור (ראה marketing-consent.util).
 *
 * שני מקורות אמת, לפי סדר עדיפות:
 *  1. `Customer.marketingOptOut` — סימון ידני של עובד בכרטיס. גובר על הכול.
 *  2. `Customer.marketingConsent` — האישור מהטופס, אחרי שנקלט לכרטיס.
 * לקוח שאין לו ערך שמור עדיין (null) נבדק לפי גוף הליד שממנו נוצר, כדי שהרשימה
 * תעבוד גם לפני ריצת ה-backfill.
 */
@Injectable()
export class MailingListService {
  private readonly logger = new Logger(MailingListService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * רשימת הלקוחות שמותר לדוור להם. כולל רק מי שיש לו מייל — הרשימה נועדה לדיוור.
   * `search` מסנן לפי שם/מייל/טלפון; `includeUnknown` מוסיף גם לקוחות שלא ידוע
   * לגביהם (לא אישרו ולא סירבו), שמוצגים בנפרד ולא נספרים כמאושרים.
   */
  async list(opts: { search?: string; includeUnknown?: boolean } = {}) {
    const search = (opts.search || '').trim();

    const customers = await this.prisma.customer.findMany({
      where: {
        status: { not: 'INACTIVE' },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { companyname: { contains: search, mode: 'insensitive' as const } },
                { contactName: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        companyname: true,
        contactName: true,
        email: true,
        phone: true,
        city: true,
        type: true,
        leadSource: true,
        createdAt: true,
        marketingConsent: true,
        marketingConsentAt: true,
        marketingConsentSource: true,
        marketingOptOut: true,
        marketingOptOutAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // ללקוחות שעוד לא נקרא להם אישור (null) — נסיון קריאה מגוף הליד המקורי.
    const unknownIds = customers.filter((c) => c.marketingConsent === null && !c.marketingOptOut).map((c) => c.id);
    const inferred = unknownIds.length ? await this.inferConsentFromLeads(unknownIds) : new Map();

    const rows = customers.map((c) => {
      const fromLead = inferred.get(c.id);
      const consent = c.marketingConsent !== null ? c.marketingConsent : (fromLead?.consent ?? null);
      return {
        id: c.id,
        name: (c.companyname || c.name || c.contactName || '').trim(),
        contactName: (c.contactName || '').trim(),
        email: (c.email || '').trim(),
        phone: (c.phone || '').trim(),
        city: (c.city || '').trim(),
        type: c.type,
        leadSource: c.leadSource || null,
        createdAt: c.createdAt,
        consent,
        consentAt: c.marketingConsentAt || fromLead?.at || null,
        consentSource: c.marketingConsentSource || fromLead?.source || null,
        /** true = האישור הוסק מגוף הליד ועדיין לא נשמר בכרטיס. */
        inferred: c.marketingConsent === null && fromLead?.consent === true,
        optOut: c.marketingOptOut,
        optOutAt: c.marketingOptOutAt,
      };
    });

    const withEmail = rows.filter((r) => r.email.includes('@'));
    const subscribed = withEmail.filter((r) => !r.optOut && r.consent === true);
    const optedOut = rows.filter((r) => r.optOut);
    const unknown = withEmail.filter((r) => !r.optOut && r.consent !== true);

    return {
      counts: {
        subscribed: subscribed.length,
        optedOut: optedOut.length,
        unknown: unknown.length,
        /** לקוחות שאישרו אבל אין להם מייל — לא ניתן לדוור אליהם בפועל. */
        consentedNoEmail: rows.filter((r) => !r.optOut && r.consent === true && !r.email.includes('@')).length,
      },
      subscribed,
      optedOut,
      unknown: opts.includeUnknown ? unknown : [],
    };
  }

  /**
   * קורא אישור דיוור מגוף הליד שממנו נוצר הלקוח. הקישור לקוח→ליד עובר דרך
   * המשימה: Task.customerId → Task.incomingLeadId → IncomingLead.body.
   *
   * `incomingLeadId` הוא שדה סקלרי בלי relation ב-schema, ולכן זו שאילתה בשני
   * שלבים ולא include — קודם המשימות, ואז הלידים לפי המזהים שנאספו.
   */
  private async inferConsentFromLeads(customerIds: string[]) {
    const out = new Map<string, { consent: boolean | null; at: Date | null; source: string | null }>();
    if (!customerIds.length) return out;
    try {
      const tasks = await this.prisma.task.findMany({
        where: { customerId: { in: customerIds }, incomingLeadId: { not: null } },
        select: { customerId: true, incomingLeadId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!tasks.length) return out;

      const leadIds = Array.from(new Set(tasks.map((t) => t.incomingLeadId).filter((v): v is string => !!v)));
      const leads = await this.prisma.incomingLead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, body: true, receivedAt: true, subject: true },
      });
      const leadById = new Map(leads.map((l) => [l.id, l]));

      for (const t of tasks) {
        if (!t.customerId || !t.incomingLeadId) continue;
        if (out.has(t.customerId)) continue; // הליד הראשון (הישן ביותר) קובע
        const lead = leadById.get(t.incomingLeadId);
        if (!lead) continue;
        const read = readMarketingConsent(lead.body);
        if (read.consent === null) continue;
        out.set(t.customerId, {
          consent: read.consent,
          at: lead.receivedAt || null,
          source: `טופס באתר — ${lead.subject || 'ליד'}`,
        });
      }
    } catch (e: any) {
      this.logger.warn(`inferConsentFromLeads failed: ${e?.message || e}`);
    }
    return out;
  }

  /**
   * סימון/ביטול "לא לכלול ברשימת הדיוור" מכרטיס הלקוח.
   * ההסרה תמיד גוברת על האישור מהטופס — לכן היא שדה נפרד ולא כתיבה על
   * marketingConsent, כדי שלא נאבד את העובדה שהלקוח כן אישר בזמנו.
   */
  async setOptOut(customerId: string, optOut: boolean, actorUserId?: string) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        marketingOptOut: optOut,
        marketingOptOutAt: optOut ? new Date() : null,
        marketingOptOutById: optOut ? actorUserId || null : null,
      },
      select: { id: true, marketingOptOut: true, marketingOptOutAt: true },
    });
  }

  /**
   * מעביר את האישור מגוף הלידים אל שדות הלקוח (backfill חד-פעמי / תחזוקה).
   * מריצים אותו מהדשבורד; הוא אידמפוטנטי ולא דורס לקוח שכבר סומן ידנית.
   */
  async backfillFromLeads(): Promise<{ scanned: number; updated: number }> {
    const pending = await this.prisma.customer.findMany({
      where: { marketingConsent: null },
      select: { id: true },
    });
    if (!pending.length) return { scanned: 0, updated: 0 };

    const inferred = await this.inferConsentFromLeads(pending.map((c) => c.id));
    let updated = 0;
    for (const [customerId, v] of inferred) {
      if (v.consent === null) continue;
      try {
        await this.prisma.customer.update({
          where: { id: customerId },
          data: {
            marketingConsent: v.consent,
            marketingConsentAt: v.at,
            marketingConsentSource: v.source,
          },
        });
        updated++;
      } catch (e: any) {
        this.logger.warn(`backfill failed for customer ${customerId}: ${e?.message || e}`);
      }
    }
    this.logger.log(`marketing consent backfill: scanned=${pending.length} updated=${updated}`);
    return { scanned: pending.length, updated };
  }

  /** ייצוא CSV של רשימת המדוורים — מה שיורם צריך כדי להזין למערכת דיוור. */
  async exportCsv(): Promise<string> {
    const { subscribed } = await this.list();
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['שם', 'איש קשר', 'אימייל', 'טלפון', 'עיר', 'מקור', 'תאריך אישור'];
    const lines = [header.join(',')];
    for (const r of subscribed) {
      lines.push([
        esc(r.name), esc(r.contactName), esc(r.email), esc(r.phone), esc(r.city),
        esc(r.consentSource || ''), esc(r.consentAt ? new Date(r.consentAt).toLocaleDateString('he-IL') : ''),
      ].join(','));
    }
    // BOM כדי ש-Excel בעברית יזהה UTF-8.
    return '﻿' + lines.join('\n');
  }
}
