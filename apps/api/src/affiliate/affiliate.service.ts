import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { formatIsraeliPhone } from '../common/phone.util';

const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

// שלבי צינור הזרימה — תואם ל-progressSteps בדשבורד. אינדקס = currentStage של המשימה.
const PIPELINE_STAGES = [
  'פתיחת פנייה', 'התאמת הפתרון', 'שיחת מכירה', 'פולואפ', 'תיאום',
  'ביצוע', 'דוח', 'גבייה', 'משוב', 'נסגר',
];

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ── ניהול (צד הצוות שלנו) ──────────────────────────────────────────────────

  /** יצירת שותף חדש עם שם משתמש + סיסמה. מחזיר את השותף (בלי ה-hash). */
  async createAffiliate(input: {
    name: string; username: string; password: string;
    commissionPct?: number; contactName?: string; email?: string; phone?: string;
  }) {
    const name = (input.name || '').trim();
    const username = (input.username || '').trim();
    if (!name) throw new BadRequestException('שם השותף חסר');
    if (!USERNAME_RE.test(username)) throw new BadRequestException('שם משתמש חייב 3–64 תווים: אותיות, ספרות, . _ -');
    if (!input.password || input.password.length < 6) throw new BadRequestException('סיסמה חייבת לפחות 6 תווים');

    const clash = await this.prisma.affiliate.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
    if (clash) throw new BadRequestException(`שם המשתמש "${username}" כבר תפוס`);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const a = await this.prisma.affiliate.create({
      data: {
        name, username, passwordHash,
        commissionPct: Number.isFinite(input.commissionPct) ? Number(input.commissionPct) : 10,
        contactName: input.contactName?.trim() || null,
        email: input.email?.trim() || null,
        phone: formatIsraeliPhone(input.phone) || null,
      },
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true, isActive: true, createdAt: true },
    });
    this.logger.log(`affiliate created: ${a.username}`);
    return a;
  }

  /** קביעה/החלפת סיסמה לשותף קיים (לפי id או username). */
  async setPassword(idOrUsername: string, password: string) {
    if (!password || password.length < 6) throw new BadRequestException('סיסמה חייבת לפחות 6 תווים');
    const a = await this.prisma.affiliate.findFirst({
      where: { OR: [{ id: idOrUsername }, { username: { equals: idOrUsername, mode: 'insensitive' } }] },
      select: { id: true },
    });
    if (!a) throw new BadRequestException('השותף לא נמצא');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.affiliate.update({ where: { id: a.id }, data: { passwordHash } });
    return { ok: true };
  }

  /** רשימת כל השותפים (לצוות). */
  listAffiliates() {
    return this.prisma.affiliate.findMany({
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true, isActive: true, createdAt: true, _count: { select: { referrals: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── התחברות שותף ────────────────────────────────────────────────────────────

  async login(username: string, password: string) {
    const uname = (username || '').trim();
    const pw = typeof password === 'string' ? password : '';
    if (!uname || !pw) throw new UnauthorizedException('שם משתמש או סיסמה שגויים');

    const a = await this.prisma.affiliate.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } });
    // compare קבוע-זמן גם על שם לא-קיים כדי לא לחשוף אם הוא קיים.
    const hash = a?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000u';
    const ok = await bcrypt.compare(pw, hash);
    if (!a || !ok || !a.isActive) throw new UnauthorizedException('שם משתמש או סיסמה שגויים');

    const accessToken = this.jwt.sign({ sub: a.id, type: 'affiliate', name: a.name });
    return { accessToken, affiliate: { id: a.id, name: a.name, username: a.username, commissionPct: a.commissionPct } };
  }

  // ── פורטל השותף ─────────────────────────────────────────────────────────────

  /** הפרופיל + סיכום העמלות של השותף המחובר. */
  async me(affiliateId: string) {
    const a = await this.prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true },
    });
    if (!a) throw new UnauthorizedException('שותף לא נמצא');
    const refs = await this.prisma.affiliateReferral.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
    });
    const totalCommission = refs.reduce((s, r) => s + (r.commissionAmount || 0), 0);
    const paidCommission = refs.filter((r) => r.commissionSettledAt).reduce((s, r) => s + (r.commissionAmount || 0), 0);
    const owedCommission = totalCommission - paidCommission;

    // מסע לקוח בן 4 שלבים (סגנון וולט) — נגזר אוטומטית מה-CRM לכל הפניה. best-effort.
    const journeyByReferral = await this.resolveJourney(refs);

    return {
      affiliate: a,
      stats: {
        totalReferrals: refs.length,
        won: refs.filter((r) => r.status === 'WON').length,
        totalCommission: Math.round(totalCommission * 100) / 100,
        owedCommission: Math.round(owedCommission * 100) / 100,
        paidCommission: Math.round(paidCommission * 100) / 100,
      },
      referrals: refs.map((r) => ({ ...this.publicReferral(r), journey: journeyByReferral.get(r.id) })),
    };
  }

  /**
   * מסע לקוח בן 4 שלבים (סגנון וולט) לכל הפניה — נגזר מה-CRM. מחזיר:
   *  - step: 1..4 (השלב הנוכחי), title/message ידידותיים, done (הושלם/שולם), lost (לא רלוונטי) + reason.
   * מקורות: משימה מקושרת (taskId) → לקוח (notRelevant) → הצעת מחיר (status SENT/SIGNED/APPROVED), ו-paidAt של ההפניה.
   *
   * השלבים:
   *  1) התקבל  — תמיד (ההפניה נוצרה).
   *  2) בטיפול / הצעת מחיר הוגשה — כשמתחילים לטפל / כשנשלחה הצעה.
   *  3) הצעה חתומה / הזמנה — כשההצעה נחתמה (SIGNED/APPROVED).
   *  4) שולם — כשהתקבל תשלום (paidAt) → מציגים עמלה.
   * מצב חריג: "לא רלוונטי" — כשהלקוח סומן לא-רלוונטי ב-CRM / ההפניה LOST (עם סיבה).
   */
  private async resolveJourney(
    refs: Array<{ id: string; taskId: string | null; status: string; paidAt: Date | null; commissionAmount: number | null; createdAt: Date }>,
  ): Promise<Map<string, {
    step: number; title: string; message: string; done: boolean; lost: boolean; reason: string | null;
  }>> {
    const out = new Map<string, any>();

    // ── שליפת המשימות המקושרות + הלקוחות + ההצעות (ב-batch) ──
    const taskIds = refs.map((r) => (r.taskId || '').trim()).filter(Boolean);
    const tasks = taskIds.length
      ? await this.prisma.task
          .findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true, customerId: true, leadId: true } })
          .catch(() => [] as any[])
      : [];
    const taskById = new Map<string, any>(tasks.map((t: any) => [t.id, t]));

    const customerIds = Array.from(new Set(tasks.map((t: any) => t.customerId).filter(Boolean)));
    const customers = customerIds.length
      ? await this.prisma.customer
          .findMany({ where: { id: { in: customerIds } }, select: { id: true, notRelevantReason: true, notRelevantNote: true, notRelevantAt: true } })
          .catch(() => [] as any[])
      : [];
    const custById = new Map<string, any>(customers.map((c: any) => [c.id, c]));

    // הצעות מחיר לפי משימה מקושרת (linkedEntityId=taskId) — לסטטוס הצעה/חתימה.
    const quotes = taskIds.length
      ? await this.prisma.quote
          .findMany({ where: { linkedEntityId: { in: taskIds } } as any, select: { linkedEntityId: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } })
          .catch(() => [] as any[])
      : [];
    const quoteByTask = new Map<string, any>();
    for (const q of quotes as any[]) { if (q.linkedEntityId && !quoteByTask.has(q.linkedEntityId)) quoteByTask.set(q.linkedEntityId, q); }

    for (const r of refs) {
      const t: any = r.taskId ? taskById.get(r.taskId.trim()) : null;
      const cust: any = t?.customerId ? custById.get(t.customerId) : null;
      const quote: any = r.taskId ? quoteByTask.get(r.taskId.trim()) : null;
      const qStatus = String(quote?.status || '').toUpperCase();

      // ── לא רלוונטי? (הלקוח סומן ב-CRM, או ההפניה LOST) ──
      const isLost = r.status === 'LOST' || !!cust?.notRelevantAt;
      if (isLost) {
        const reason = (cust?.notRelevantReason || cust?.notRelevantNote || '').trim() || null;
        out.set(r.id, {
          step: 2, lost: true, done: false, reason,
          title: 'הפנייה נסגרה',
          message: reason
            ? `בדקנו את הפנייה ולצערנו היא לא התאימה כרגע — הסיבה: ${reason}. תודה רבה על ההפניה, נשמח להמשך שיתוף הפעולה!`
            : 'בדקנו את הפנייה ולצערנו היא לא התאימה כרגע. תודה רבה על ההפניה — נשמח לעוד לקוחות!',
        });
        continue;
      }

      // ── שולם? (שלב 4) ──
      if (r.paidAt) {
        const comm = r.commissionAmount != null ? `₪${Number(r.commissionAmount).toLocaleString('he-IL')}` : '';
        out.set(r.id, {
          step: 4, done: true, lost: false, reason: null,
          title: 'העסקה נסגרה — התקבל תשלום 🎉',
          message: comm
            ? `הלקוח שילם והעסקה נסגרה בהצלחה! העמלה שלך על ההפניה: ${comm}. תודה ענקית — מחכים ללקוח הבא שלך!`
            : 'הלקוח שילם והעסקה נסגרה בהצלחה! העמלה שלך עודכנה. תודה ענקית על ההפניה!',
        });
        continue;
      }

      // ── הצעה חתומה / הזמנה (שלב 3) ──
      if (qStatus === 'SIGNED' || qStatus === 'APPROVED') {
        out.set(r.id, {
          step: 3, done: false, lost: false, reason: null,
          title: 'ההצעה אושרה — יוצאים לדרך! ✍️',
          message: 'הלקוח אישר את הצעת המחיר וחתם — אנחנו כבר בתהליך ביצוע. עוד רגע נסגור, והעמלה שלך בדרך!',
        });
        continue;
      }

      // ── הצעת מחיר הוגשה (שלב 2) ──
      if (qStatus === 'SENT') {
        out.set(r.id, {
          step: 2, done: false, lost: false, reason: null,
          title: 'הצעת מחיר הוגשה ללקוח 📄',
          message: 'הכנו והגשנו ללקוח הצעת מחיר מותאמת. מחכים לתשובתו — נעדכן אותך בכל התקדמות!',
        });
        continue;
      }

      // ── בטיפול / התקבל (שלב 1–2) ──
      const inProgress = r.status === 'IN_PROGRESS' || !!t;
      out.set(r.id, {
        step: inProgress ? 2 : 1,
        done: false, lost: false, reason: null,
        title: inProgress ? 'הלקוח בטיפול אצלנו 🤝' : 'הפנייה התקבלה בהצלחה ✅',
        message: inProgress
          ? 'צוות המומחים שלנו כבר בקשר עם הלקוח ובוחן את הצרכים שלו. נעדכן אותך ברגע שנתקדם!'
          : 'קיבלנו את הלקוח שהפנית — תודה רבה! אנחנו מתחילים איתו תהליך ונעדכן אותך בכל שלב.',
      });
    }
    return out;
  }

  /** השותף שולח לנו לקוח חדש. */
  async submitReferral(affiliateId: string, input: {
    customerName?: string; customerPhone?: string; customerEmail?: string; serviceType?: string; note?: string;
  }) {
    const customerName = (input.customerName || '').trim();
    if (!customerName) throw new BadRequestException('שם הלקוח חסר');
    if (!(input.customerPhone || '').trim() && !(input.customerEmail || '').trim()) {
      throw new BadRequestException('יש למלא טלפון או אימייל של הלקוח');
    }
    const r = await this.prisma.affiliateReferral.create({
      data: {
        affiliateId,
        customerName,
        customerPhone: formatIsraeliPhone(input.customerPhone) || null,
        customerEmail: input.customerEmail?.trim() || null,
        serviceType: input.serviceType?.trim() || null,
        note: input.note?.trim() || null,
        status: 'NEW',
      },
    });
    this.logger.log(`referral submitted by affiliate ${affiliateId}: ${customerName}`);

    // ── יצירת "ליד נכנס" כדי שההפניה תתנהג בדיוק כמו ליד רגיל ──
    // מקפיץ פופ-אפ צידי אצל כל העובדים, מופיע בסקשן הלידים, וניתן לתפיסה/שיוך ("התחל טיפול").
    // מסומן במקור "תוכנית השותפים — <שם השותף>". best-effort: כישלון לא מפיל את ההפניה.
    try {
      await this.createIncomingLeadForReferral(r.id, affiliateId, {
        customerName,
        customerPhone: formatIsraeliPhone(input.customerPhone) || null,
        customerEmail: input.customerEmail?.trim() || null,
        serviceType: input.serviceType?.trim() || null,
        note: input.note?.trim() || null,
      });
    } catch (e: any) {
      this.logger.warn(`createIncomingLeadForReferral failed for ${r.id}: ${e?.message || e}`);
    }

    return this.publicReferral(r);
  }

  /**
   * יוצר IncomingLead (status=NEW) עבור הפניית שותף, בפורמט שה-frontend כבר יודע לקרוא
   * (parseLeadBody: "שם מלא/טלפון נייד/אימייל/סוג השירות/תוכן הפנייה"). כך ההפניה מופיעה
   * בסקשן הלידים + פופ-אפ צידי אצל כל העובדים, וניתנת לתפיסה/שיוך כמו ליד רגיל.
   * ownerId — משתמש פעיל כלשהו (ADMIN/MANAGER מועדף) רק כ"בעל תיבה" ראשוני; ליד NEW גלוי לכולם.
   */
  private async createIncomingLeadForReferral(
    referralId: string,
    affiliateId: string,
    c: { customerName: string; customerPhone: string | null; customerEmail: string | null; serviceType: string | null; note: string | null },
  ): Promise<void> {
    const aff = await this.prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { name: true } });
    const affName = (aff?.name || 'שותף').trim();
    const sourceLabel = `תוכנית השותפים — ${affName}`;

    // בעל-תיבה ראשוני: מנהל/אדמין פעיל, אחרת כל משתמש פעיל. נדרש FK תקין ל-owner.
    const owner =
      (await this.prisma.user.findFirst({
        where: { status: 'ACTIVE' as any, role: { in: ['ADMIN', 'MANAGER'] as any } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })) ||
      (await this.prisma.user.findFirst({ where: { status: 'ACTIVE' as any }, select: { id: true }, orderBy: { createdAt: 'asc' } }));
    if (!owner?.id) {
      this.logger.warn('createIncomingLeadForReferral: no active user to own the lead — skipping');
      return;
    }

    // גוף בפורמט תוויות שה-frontend קורא (parseLeadBody) + ציון המקור.
    const bodyLines = [
      `שם מלא: ${c.customerName}`,
      c.customerPhone ? `טלפון נייד: ${c.customerPhone}` : '',
      c.customerEmail ? `אימייל: ${c.customerEmail}` : '',
      c.serviceType ? `סוג השירות: ${c.serviceType}` : '',
      `תוכן הפנייה: ${c.note || 'הפניה מתוכנית השותפים'}`,
      '',
      `מקור: ${sourceLabel}`,
    ].filter(Boolean);

    await this.prisma.incomingLead.create({
      data: {
        // messageId ייחודי סינתטי — מונע כפילות ומסמן שהמקור הוא הפניית שותף.
        messageId: `affiliate-referral:${referralId}`,
        internetMessageId: `affiliate-referral:${referralId}`,
        subject: `הפניה מ${affName} (תוכנית השותפים) — ${c.serviceType || c.customerName}`,
        body: bodyLines.join('\n'),
        fromName: sourceLabel,
        fromEmail: null,
        receivedAt: new Date(),
        ownerId: owner.id,
        status: 'NEW',
      },
    });

    // קישור רופף חזרה להפניה — למעקב.
    await this.prisma.affiliateReferral
      .update({ where: { id: referralId }, data: { leadId: `affiliate-referral:${referralId}` } })
      .catch(() => undefined);
  }

  // ── ניהול הפניות (צד הצוות) ─────────────────────────────────────────────────

  /** כל ההפניות (לצוות), מועשרות בשם השותף. אפשר לסנן לפי status/affiliateId. */
  async listReferrals(filter?: { status?: string; affiliateId?: string }) {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.affiliateId) where.affiliateId = filter.affiliateId;
    const refs = await this.prisma.affiliateReferral.findMany({
      where,
      include: { affiliate: { select: { id: true, name: true, commissionPct: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return refs.map((r) => ({ ...this.publicReferral(r), affiliateName: r.affiliate.name, affiliateId: r.affiliateId }));
  }

  /** עדכון סטטוס הפניה + קישור רופף ל-lead/task (לצוות). */
  async updateReferral(id: string, patch: { status?: string; leadId?: string | null; taskId?: string | null }) {
    const data: any = {};
    if (patch.status && ['NEW', 'IN_PROGRESS', 'WON', 'LOST'].includes(patch.status)) data.status = patch.status;
    if ('leadId' in patch) data.leadId = patch.leadId || null;
    if ('taskId' in patch) data.taskId = patch.taskId || null;
    const r = await this.prisma.affiliateReferral.update({ where: { id }, data });
    return this.publicReferral(r);
  }

  /**
   * חישוב עמלה כשלקוח שהופנה שילם. נקרא מהוק ב-TasksService.update כשמתווספת
   * הערת "שולם" למשימה שמקושרת להפניה. paidAmount = הסכום ששולם; commissionPct
   * נלקח מהשותף ונצרב. אידמפוטנטי — לא כותב שוב אם כבר חושב (paidAt קיים).
   */
  async recordPaymentByTaskId(taskId: string, paidAmount: number): Promise<void> {
    if (!taskId || !Number.isFinite(paidAmount) || paidAmount <= 0) return;
    const ref = await this.prisma.affiliateReferral.findFirst({
      where: { taskId },
      include: { affiliate: { select: { commissionPct: true } } },
    });
    if (!ref) return; // המשימה לא קשורה להפניה של שותף
    if (ref.paidAt) return; // כבר חושב — אידמפוטנטי
    const pct = ref.affiliate.commissionPct ?? 0;
    const commissionAmount = Math.round(paidAmount * (pct / 100) * 100) / 100;
    await this.prisma.affiliateReferral.update({
      where: { id: ref.id },
      data: { paidAmount, commissionPct: pct, commissionAmount, paidAt: new Date(), status: 'WON' },
    });
    this.logger.log(`affiliate commission recorded: referral ${ref.id} paid=${paidAmount} commission=${commissionAmount}`);
  }

  /** סימון עמלה כ"שולמה לשותף" (מעקב תשלומי-עמלה יוצא). */
  async settleCommission(referralId: string) {
    const r = await this.prisma.affiliateReferral.update({
      where: { id: referralId },
      data: { commissionSettledAt: new Date() },
    });
    return this.publicReferral(r);
  }

  /** צורה ציבורית של הפניה (בלי שדות פנימיים מיותרים). */
  private publicReferral(r: {
    id: string; customerName: string; customerPhone: string | null; customerEmail: string | null;
    serviceType: string | null; note: string | null; status: string; leadId: string | null; taskId: string | null;
    paidAmount: number | null; commissionPct: number | null; commissionAmount: number | null;
    paidAt: Date | null; commissionSettledAt: Date | null; createdAt: Date;
  }) {
    return {
      id: r.id,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerEmail: r.customerEmail,
      serviceType: r.serviceType,
      note: r.note,
      status: r.status,
      leadId: r.leadId,
      taskId: r.taskId,
      paidAmount: r.paidAmount,
      commissionPct: r.commissionPct,
      commissionAmount: r.commissionAmount,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      commissionSettledAt: r.commissionSettledAt ? r.commissionSettledAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
