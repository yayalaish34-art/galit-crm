import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * כשלקוח/משימה שהגיעו מתוכנית השותפים (`/affiliate`) מסומנים "לא רלוונטי" —
 * השותף שהפנה אותם צריך לקבל את הסיבה. השירות הזה מחבר בין שני העולמות:
 *
 *   Customer (notRelevantReason נכתב)
 *     └─ Task.customerId
 *         └─ Task.incomingLeadId → IncomingLead
 *             └─ IncomingLead.messageId שמתחיל ב-"affiliate-referral:<referralId>"
 *                 └─ AffiliateReferral
 *                     └─ Affiliate (phone/email)
 *
 * ה-messageId הסינתטי "affiliate-referral:<id>" נצרב ב-createIncomingLeadForReferral,
 * וזה החוט היחיד שחי לאורך הזרימה (אין FK ישיר ב-CRM אל ה-referral).
 *
 * מה השירות עושה כשהוא מופעל:
 *   1) מוצא את ה-referrals המקושרים (בד"כ 1, אבל בהגנה — אוסף הכול).
 *   2) מצמיד taskId ל-referral אם עוד לא היה — כך גם מסלול הלקוח ב-/affiliate
 *      פותר נכון את הסטטוס ה"אבוד" (resolveJourney חיפש taskId שמעולם לא נכתב).
 *   3) מעדכן status = 'LOST' (אידמפוטנטי).
 *   4) שולח התראה לוואטסאפ של השותף דרך גשר הבוט (POST /internal/affiliate/notify).
 *      best-effort: כישלון רישום/שליחה לא נזרק החוצה — הסיבה גלויה בפורטל גם בלעדיו.
 */
@Injectable()
export class AffiliateNotifierService {
  private readonly logger = new Logger(AffiliateNotifierService.name);
  private readonly TIMEOUT_MS = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  private botBase(): string | null {
    const raw = (process.env.VOICE_BOT_BASE_URL ?? '').trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  private botSecret(): string | null {
    const raw =
      (process.env.CUSTOMER_REMINDER_SECRET ?? '').trim() ||
      (process.env.INTERNAL_API_SECRET ?? '').trim();
    return raw || null;
  }

  /** נקודת כניסה ראשית: לקוח סומן "לא רלוונטי". */
  async onCustomerMarkedNotRelevant(
    customerId: string,
    reason: string | null,
    note: string | null,
  ): Promise<void> {
    const cleanReason = (reason ?? '').trim();
    if (!cleanReason) return; // ביטול סיווג / ריקון — לא שולחים כלום
    try {
      await this.processCustomer(customerId, cleanReason, (note ?? '').trim() || null);
    } catch (err) {
      this.logger.warn(
        `affiliate-notifier failed for customer ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async processCustomer(
    customerId: string,
    reason: string,
    note: string | null,
  ): Promise<void> {
    // משימות של הלקוח + הליד הנכנס שלהן (אם קיים).
    const tasks = await this.prisma.task.findMany({
      where: { customerId, incomingLeadId: { not: null } },
      select: { id: true, incomingLeadId: true },
    });
    const incomingLeadIds = tasks.map((t) => t.incomingLeadId!).filter(Boolean);
    if (incomingLeadIds.length === 0) return;

    const leads = await this.prisma.incomingLead.findMany({
      where: { id: { in: incomingLeadIds } },
      select: { id: true, messageId: true },
    });
    // ממפים ליד→referralId (ה-prefix נצרב ב-createIncomingLeadForReferral).
    const PREFIX = 'affiliate-referral:';
    const referralIdByLeadId = new Map<string, string>();
    for (const l of leads) {
      if (l.messageId?.startsWith(PREFIX)) {
        referralIdByLeadId.set(l.id, l.messageId.slice(PREFIX.length));
      }
    }
    if (referralIdByLeadId.size === 0) return;

    // לכל זוג (referral, task) שנמצא — מסמנים LOST ומצמידים taskId.
    for (const t of tasks) {
      if (!t.incomingLeadId) continue;
      const referralId = referralIdByLeadId.get(t.incomingLeadId);
      if (!referralId) continue;
      const ref = await this.prisma.affiliateReferral
        .findUnique({
          where: { id: referralId },
          include: { affiliate: { select: { id: true, name: true, phone: true, email: true } } },
        })
        .catch(() => null);
      if (!ref) continue;

      await this.prisma.affiliateReferral
        .update({
          where: { id: ref.id },
          data: {
            status: 'LOST',
            // מצמידים taskId אם עוד לא היה — resolveJourney בפורטל צריך את זה כדי
            // להציג "הפנייה נסגרה" + הסיבה.
            taskId: ref.taskId ?? t.id,
          },
        })
        .catch((e) => this.logger.warn(`update referral ${ref.id} failed: ${e?.message}`));

      await this.notifyAffiliate(ref.affiliate, ref.customerName, reason, note);
    }
  }

  private async notifyAffiliate(
    affiliate: { id: string; name: string; phone: string | null; email: string | null },
    customerName: string,
    reason: string,
    note: string | null,
  ): Promise<void> {
    const phone = (affiliate.phone ?? '').trim();
    if (!phone) {
      this.logger.log(
        `affiliate ${affiliate.id} has no phone — rejection reason viewable only in portal`,
      );
      return;
    }
    const text = this.buildMessage(customerName, reason, note);
    const base = this.botBase();
    const secret = this.botSecret();
    if (!base || !secret) {
      this.logger.warn('bot bridge not configured — skipping WhatsApp notification');
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
      try {
        const res = await fetch(`${base}/internal/affiliate/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify({ phone, text, affiliateId: affiliate.id }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          this.logger.warn(`bot /internal/affiliate/notify returned ${res.status}: ${body}`);
          return;
        }
        this.logger.log(`notified affiliate ${affiliate.id} about rejected customer "${customerName}"`);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn(
        `WhatsApp notify failed for affiliate ${affiliate.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private buildMessage(customerName: string, reason: string, note: string | null): string {
    const lines = [
      'שלום, זו הודעה אוטומטית מגלית — החברה לאיכות הסביבה.',
      '',
      `בדקנו את הלקוח שהפנית אלינו — ${customerName} — ולצערנו ההפניה סומנה כלא רלוונטית.`,
      `הסיבה: ${reason}.`,
    ];
    if (note) lines.push(`הערה נוספת: ${note}`);
    lines.push('', 'תודה רבה על ההפניה — מצפים לעוד לקוחות דרכך!');
    return lines.join('\n');
  }
}
