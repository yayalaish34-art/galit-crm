import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { formatIsraeliPhone } from '../common/phone.util';

const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

/** המרה סובלנית של קלט תאריך (ISO/Date/null/undefined/ריק) ל-Date או null. */
function parseDateMaybe(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

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
    salesNotes?: string; nextFollowupAt?: string | Date | null;
    recruitedByUserId?: string | null;
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
        salesNotes: input.salesNotes?.trim() || null,
        nextFollowupAt: parseDateMaybe(input.nextFollowupAt),
        recruitedByUserId: input.recruitedByUserId || null,
      },
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true, isActive: true, createdAt: true, salesNotes: true, nextFollowupAt: true, recruitedByUserId: true },
    });
    this.logger.log(`affiliate created: ${a.username} (recruitedBy=${a.recruitedByUserId || '—'})`);
    return a;
  }

  /** עדכון פרטי שותף קיים (לא כולל סיסמה — זה נפרד). */
  async updateAffiliate(
    id: string,
    patch: {
      name?: string; commissionPct?: number;
      contactName?: string | null; email?: string | null; phone?: string | null;
      isActive?: boolean;
      salesNotes?: string | null; nextFollowupAt?: string | Date | null;
    },
    opts: { onlyIfRecruitedBy?: string } = {},
  ) {
    const existing = await this.prisma.affiliate.findUnique({
      where: { id },
      select: { id: true, recruitedByUserId: true },
    });
    if (!existing) throw new BadRequestException('השותף לא נמצא');
    if (opts.onlyIfRecruitedBy && existing.recruitedByUserId !== opts.onlyIfRecruitedBy) {
      throw new BadRequestException('אין הרשאה לעדכן שותף שלא גויס על ידך');
    }

    const data: any = {};
    if (patch.name != null) {
      const n = patch.name.trim();
      if (!n) throw new BadRequestException('שם השותף חסר');
      data.name = n;
    }
    if (patch.commissionPct != null && Number.isFinite(Number(patch.commissionPct))) {
      data.commissionPct = Number(patch.commissionPct);
    }
    if ('contactName' in patch) data.contactName = patch.contactName?.toString().trim() || null;
    if ('email' in patch) data.email = patch.email?.toString().trim() || null;
    if ('phone' in patch) data.phone = formatIsraeliPhone(patch.phone || '') || null;
    if (typeof patch.isActive === 'boolean') data.isActive = patch.isActive;
    if ('salesNotes' in patch) data.salesNotes = patch.salesNotes?.toString().trim() || null;
    if ('nextFollowupAt' in patch) data.nextFollowupAt = parseDateMaybe(patch.nextFollowupAt);

    const a = await this.prisma.affiliate.update({
      where: { id },
      data,
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true, isActive: true, createdAt: true, salesNotes: true, nextFollowupAt: true, recruitedByUserId: true },
    });
    return a;
  }

  /** קביעה/החלפת סיסמה לשותף קיים (לפי id או username). */
  async setPassword(idOrUsername: string, password: string, opts: { onlyIfRecruitedBy?: string } = {}) {
    if (!password || password.length < 6) throw new BadRequestException('סיסמה חייבת לפחות 6 תווים');
    const a = await this.prisma.affiliate.findFirst({
      where: { OR: [{ id: idOrUsername }, { username: { equals: idOrUsername, mode: 'insensitive' } }] },
      select: { id: true, recruitedByUserId: true },
    });
    if (!a) throw new BadRequestException('השותף לא נמצא');
    if (opts.onlyIfRecruitedBy && a.recruitedByUserId !== opts.onlyIfRecruitedBy) {
      throw new BadRequestException('אין הרשאה לשנות סיסמה לשותף שלא גויס על ידך');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.affiliate.update({ where: { id: a.id }, data: { passwordHash } });
    return { ok: true };
  }

  /**
   * רשימת שותפים (לצוות) עם סטטיסטיקות עמלה פר-שורה.
   * filter.recruitedByUserId — להציג רק שותפים שגויסו ע"י יוזר ספציפי (דשבורד "המכירות שלי").
   */
  async listAffiliates(filter?: { recruitedByUserId?: string }) {
    const where: any = {};
    if (filter?.recruitedByUserId) where.recruitedByUserId = filter.recruitedByUserId;

    const rows = await this.prisma.affiliate.findMany({
      where,
      select: {
        id: true, name: true, username: true, commissionPct: true,
        contactName: true, email: true, phone: true, isActive: true, createdAt: true,
        salesNotes: true, nextFollowupAt: true, recruitedByUserId: true,
        referrals: {
          select: { id: true, status: true, commissionAmount: true, commissionSettledAt: true, paidAt: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // חישוב סטטיסטיקות (totalReferrals / won / commission owed/paid / last activity) לפי מערך ה-referrals.
    return rows.map((a) => {
      const refs = a.referrals;
      const won = refs.filter((r) => r.status === 'WON').length;
      const totalCommission = refs.reduce((s, r) => s + (r.commissionAmount || 0), 0);
      const paidCommission = refs.filter((r) => r.commissionSettledAt).reduce((s, r) => s + (r.commissionAmount || 0), 0);
      const owedCommission = totalCommission - paidCommission;
      const lastReferralAt = refs.length
        ? refs.map((r) => r.createdAt).sort((x, y) => (y as any) - (x as any))[0]
        : null;
      return {
        id: a.id,
        name: a.name,
        username: a.username,
        commissionPct: a.commissionPct,
        contactName: a.contactName,
        email: a.email,
        phone: a.phone,
        isActive: a.isActive,
        createdAt: a.createdAt.toISOString(),
        salesNotes: a.salesNotes,
        nextFollowupAt: a.nextFollowupAt ? a.nextFollowupAt.toISOString() : null,
        recruitedByUserId: a.recruitedByUserId,
        stats: {
          totalReferrals: refs.length,
          won,
          totalCommission: Math.round(totalCommission * 100) / 100,
          owedCommission: Math.round(owedCommission * 100) / 100,
          paidCommission: Math.round(paidCommission * 100) / 100,
          lastReferralAt: lastReferralAt ? (lastReferralAt as Date).toISOString() : null,
        },
      };
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
      select: { id: true, name: true, username: true, commissionPct: true, contactName: true, email: true, phone: true, referrerOptions: true },
    });
    if (!a) throw new UnauthorizedException('שותף לא נמצא');
    const refs = await this.prisma.affiliateReferral.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
    });
    const totalCommission = refs.reduce((s, r) => s + (r.commissionAmount || 0), 0);
    const paidCommission = refs.filter((r) => r.commissionSettledAt).reduce((s, r) => s + (r.commissionAmount || 0), 0);
    const owedCommission = totalCommission - paidCommission;

    // עמלה ששולמה / ממתינה לתשלום לכל מפנה — כל המפנים ברשימה (גם בלי הפניות),
    // ועוד שמות ישנים שהוזנו בעבר ונמחקו מהרשימה.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const byReferrer = new Map<string, { name: string; referrals: number; paidCommission: number; owedCommission: number }>();
    for (const name of a.referrerOptions) byReferrer.set(name, { name, referrals: 0, paidCommission: 0, owedCommission: 0 });
    for (const r of refs) {
      if (!r.referredBy) continue;
      const row = byReferrer.get(r.referredBy) ?? { name: r.referredBy, referrals: 0, paidCommission: 0, owedCommission: 0 };
      row.referrals++;
      if (r.commissionSettledAt) row.paidCommission += r.commissionAmount || 0;
      else row.owedCommission += r.commissionAmount || 0;
      byReferrer.set(r.referredBy, row);
    }

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
      byReferrer: [...byReferrer.values()].map((row) => ({
        ...row,
        paidCommission: round2(row.paidCommission),
        owedCommission: round2(row.owedCommission),
      })),
      referrals: refs.map((r) => {
        const journey = journeyByReferral.get(r.id);
        return { ...this.publicReferral(r), journey, quoteAmount: journey?.quoteAmount ?? null };
      }),
    };
  }

  /**
   * מסע לקוח בן 11 שלבים (סגנון וולט) לכל הפניה — נגזר אוטומטית מה-CRM.
   * מחזיר: step 1..11, title/message ידידותיים, done (שולם לשותף), lost + reason.
   *
   * השלבים (totalSteps = 11):
   *  1) הפנייה התקבלה — ההפניה נוצרה; אף אחד עוד לא נגע.
   *  2) נציג גלית צפה בפנייה — IncomingLead != NEW או status=IN_PROGRESS.
   *  3) התחלנו לטפל בפנייה — Task נוצרה (עובד "התחיל לטפל").
   *  4) שוחחנו עם הלקוח — currentStage≥2 (שיחת מכירה) או processNotes.
   *  5) הצעת מחיר נשלחה — Quote.status = SENT.
   *  6) העסקה נסגרה בהצלחה! — Quote.status in (SIGNED, APPROVED).
   *  7) תואם מועד לביצוע — currentStage≥4 (תיאום).
   *  8) השירות בוצע — currentStage≥5 (ביצוע).
   *  9) הטיפול בלקוח הושלם — currentStage≥6 (דוח) או task.status=DONE.
   *  10) העמלה אושרה — paidAt של ההפניה (הלקוח שילם, העמלה חושבה).
   *  11) העמלה שולמה — commissionSettledAt (אנחנו העברנו תשלום לשותף).
   *
   * מצב חריג: "לא רלוונטי" — הלקוח סומן לא-רלוונטי ב-CRM / ההפניה LOST (עם סיבה).
   *
   * מקורות:
   *   AffiliateReferral.leadId ("affiliate-referral:<id>") → IncomingLead.messageId → status + taskId.
   *   משם: Task (status, currentStage, processNotes) → Customer (notRelevant) → Quote (status) + paidAt/commissionSettledAt.
   */
  private async resolveJourney(
    refs: Array<{ id: string; taskId: string | null; leadId?: string | null; status: string; paidAt: Date | null; commissionSettledAt: Date | null; commissionAmount: number | null; createdAt: Date }>,
  ): Promise<Map<string, {
    step: number; totalSteps: number; title: string; message: string; done: boolean; lost: boolean; reason: string | null;
    quoteAmount: number | null;
  }>> {
    const out = new Map<string, any>();
    const TOTAL = 11;

    // ── 1) ה-IncomingLeads המקושרים (לפי ה-messageId הסינתטי שנצרב ב-createIncomingLeadForReferral) ──
    const leadKeys = refs.map((r) => (r.leadId || '').trim()).filter(Boolean);
    const incomingLeads = leadKeys.length
      ? await this.prisma.incomingLead
          .findMany({ where: { messageId: { in: leadKeys } }, select: { messageId: true, status: true, taskId: true } })
          .catch(() => [] as any[])
      : [];
    const leadByKey = new Map<string, any>(incomingLeads.map((l: any) => [l.messageId, l]));

    // ── 2) ה-Tasks (גם מ-referral.taskId וגם מ-IncomingLead.taskId; בד"כ זה אותו דבר) ──
    const taskIds = new Set<string>();
    for (const r of refs) if (r.taskId) taskIds.add(r.taskId.trim());
    for (const l of incomingLeads as any[]) if (l.taskId) taskIds.add(String(l.taskId).trim());
    const tasks = taskIds.size
      ? await this.prisma.task
          .findMany({
            where: { id: { in: Array.from(taskIds) } },
            select: {
              id: true, status: true, customerId: true, leadId: true,
              currentStage: true, processNotes: true,
            },
          })
          .catch(() => [] as any[])
      : [];
    const taskById = new Map<string, any>(tasks.map((t: any) => [t.id, t]));

    // ── 3) לקוחות (לסטטוס "לא רלוונטי") ──
    const customerIds = Array.from(new Set(tasks.map((t: any) => t.customerId).filter(Boolean)));
    const customers = customerIds.length
      ? await this.prisma.customer
          .findMany({ where: { id: { in: customerIds } }, select: { id: true, notRelevantReason: true, notRelevantNote: true, notRelevantAt: true } })
          .catch(() => [] as any[])
      : [];
    const custById = new Map<string, any>(customers.map((c: any) => [c.id, c]));

    // ── 4) הצעות מחיר לפי משימה (linkedEntityId=taskId) — לסטטוס הצעה/חתימה ──
    const quotes = taskIds.size
      ? await this.prisma.quote
          .findMany({
            where: { linkedEntityId: { in: Array.from(taskIds) } } as any,
            select: { linkedEntityId: true, status: true, updatedAt: true, totalAmount: true, amount: true },
            orderBy: { updatedAt: 'desc' },
          })
          .catch(() => [] as any[])
      : [];
    const quoteByTask = new Map<string, any>();
    for (const q of quotes as any[]) {
      if (q.linkedEntityId && !quoteByTask.has(q.linkedEntityId)) quoteByTask.set(q.linkedEntityId, q);
    }

    const quoteAmountByReferral = new Map<string, number | null>();
    for (const r of refs) {
      const il: any = r.leadId ? leadByKey.get(r.leadId.trim()) : null;
      const taskId = (r.taskId || '').trim() || (il?.taskId ? String(il.taskId).trim() : '');
      const t: any = taskId ? taskById.get(taskId) : null;
      const cust: any = t?.customerId ? custById.get(t.customerId) : null;
      const quote: any = taskId ? quoteByTask.get(taskId) : null;
      const qStatus = String(quote?.status || '').toUpperCase();
      // סכום ההצעה שניתנה ללקוח (כולל מע"מ; amount = שדה ישן כגיבוי) — מוצג לשותף בכרטיס
      const quoteAmountRaw = Number(quote?.totalAmount) > 0 ? Number(quote.totalAmount) : Number(quote?.amount);
      quoteAmountByReferral.set(r.id, Number.isFinite(quoteAmountRaw) && quoteAmountRaw > 0 ? quoteAmountRaw : null);
      const tStatus = String(t?.status || '').toUpperCase();
      const currentStage = Number.isFinite(t?.currentStage) ? Number(t?.currentStage) : -1;
      const hasNotes = typeof t?.processNotes === 'string' && t.processNotes.trim().length > 0;

      // ── לא רלוונטי? (הלקוח סומן ב-CRM, או ההפניה LOST) ──
      const isLost = r.status === 'LOST' || !!cust?.notRelevantAt;
      if (isLost) {
        const reason = (cust?.notRelevantReason || cust?.notRelevantNote || '').trim() || null;
        out.set(r.id, {
          step: 2, totalSteps: TOTAL, lost: true, done: false, reason,
          title: 'הפנייה נסגרה',
          message: reason
            ? `בדקנו את הפנייה ולצערנו היא לא התאימה כרגע — הסיבה: ${reason}. תודה רבה על ההפניה, נשמח להמשך שיתוף הפעולה!`
            : 'בדקנו את הפנייה ולצערנו היא לא התאימה כרגע. תודה רבה על ההפניה — נשמח לעוד לקוחות!',
        });
        continue;
      }

      // ── 11) העמלה שולמה (אנחנו העברנו לשותף) ──
      if (r.commissionSettledAt) {
        const comm = r.commissionAmount != null ? `₪${Number(r.commissionAmount).toLocaleString('he-IL')}` : '';
        out.set(r.id, {
          step: 11, totalSteps: TOTAL, done: true, lost: false, reason: null,
          title: 'העמלה שולמה 🎉',
          message: comm
            ? `העמלה שלך על ההפניה (${comm}) שולמה. תודה ענקית על שיתוף הפעולה — מחכים ללקוח הבא!`
            : 'העמלה שלך הועברה. תודה ענקית על שיתוף הפעולה!',
        });
        continue;
      }

      // ── 10) העמלה אושרה — הלקוח שילם לנו, העמלה חושבה (ממתינה לתשלום לשותף) ──
      if (r.paidAt) {
        const comm = r.commissionAmount != null ? `₪${Number(r.commissionAmount).toLocaleString('he-IL')}` : '';
        out.set(r.id, {
          step: 10, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'העמלה אושרה 💸',
          message: comm
            ? `הלקוח שילם, והעמלה שלך (${comm}) אושרה לתשלום. נעדכן אותך ברגע שהתשלום יצא בפועל.`
            : 'הלקוח שילם, והעמלה שלך אושרה לתשלום. נעדכן אותך ברגע שהתשלום יצא בפועל.',
        });
        continue;
      }

      // ── 9) הטיפול בלקוח הושלם — currentStage≥6 (דוח) או task.status=DONE ──
      if (t && (tStatus === 'DONE' || currentStage >= 6)) {
        out.set(r.id, {
          step: 9, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'הטיפול בלקוח הושלם 📘',
          message: 'הדוח או תוצר השירות נמסר ללקוח. אנחנו ממתינים לתשלום כדי לסגור את ההפניה ולאשר את העמלה.',
        });
        continue;
      }

      // ── 8) השירות בוצע — currentStage≥5 (ביצוע) ──
      if (t && currentStage >= 5) {
        out.set(r.id, {
          step: 8, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'השירות בוצע ✅',
          message: 'צוות גלית ביצע את העבודה בשטח. ברגעים אלו מכינים את הדוח / תוצר השירות ללקוח.',
        });
        continue;
      }

      // ── 7) תואם מועד לביצוע — currentStage≥4 (תיאום) ──
      if (t && currentStage >= 4) {
        out.set(r.id, {
          step: 7, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'תואם מועד לביצוע 🗓️',
          message: 'תיאמנו מועד להגעת צוות גלית לביצוע השירות.',
        });
        continue;
      }

      // ── 6) העסקה נסגרה בהצלחה! — הצעה חתומה / אושרה ──
      if (qStatus === 'SIGNED' || qStatus === 'APPROVED') {
        out.set(r.id, {
          step: 6, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'העסקה נסגרה בהצלחה! ✍️',
          message: 'הלקוח אישר את הצעת המחיר וחתם — אנחנו כבר בתהליך הכנה לביצוע.',
        });
        continue;
      }

      // ── 5) הצעת מחיר נשלחה ──
      if (qStatus === 'SENT') {
        out.set(r.id, {
          step: 5, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'הצעת מחיר נשלחה ללקוח 📄',
          message: 'הכנו ושלחנו ללקוח הצעת מחיר מותאמת. מחכים לתשובתו — נעדכן אותך בכל התקדמות.',
        });
        continue;
      }

      // ── 4) שוחחנו עם הלקוח — שלב "שיחת מכירה" או מעבר (currentStage≥2), או processNotes קיימות ──
      if (t && (currentStage >= 2 || hasNotes)) {
        out.set(r.id, {
          step: 4, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'שוחחנו עם הלקוח 📞',
          message: 'יצרנו קשר עם הלקוח, ביררנו את הצורך והותאם לו השירות המתאים. בקרוב נשלח הצעת מחיר.',
        });
        continue;
      }

      // ── 3) התחלנו לטפל — Task קיימת (עובד "התחיל לטפל") אבל עוד בלי שיחה ──
      if (t) {
        out.set(r.id, {
          step: 3, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'התחלנו לטפל בפנייה ✉️',
          message: 'פתחנו משימה אצל הצוות המתאים — יוצרים קשר עם הלקוח ומתחילים לבדוק את הצרכים שלו.',
        });
        continue;
      }

      // ── 2) נציג ראה — IncomingLead כבר לא NEW (צפו/קלטו, גם אם לא פתחו משימה) ──
      const seen =
        r.status === 'IN_PROGRESS' ||
        (!!il && String(il.status || '').toUpperCase() !== 'NEW');
      if (seen) {
        out.set(r.id, {
          step: 2, totalSteps: TOTAL, done: false, lost: false, reason: null,
          title: 'נציג גלית ראה את הפנייה 👀',
          message: 'ההפניה שלך הגיעה לידי נציג אצלנו, שעוד רגע יתחיל לטפל בלקוח. נעדכן אותך בכל התקדמות.',
        });
        continue;
      }

      // ── 1) הפנייה התקבלה (ברירת מחדל) ──
      out.set(r.id, {
        step: 1, totalSteps: TOTAL, done: false, lost: false, reason: null,
        title: 'הפנייה התקבלה בהצלחה ✅',
        message: 'קיבלנו את הלקוח שהפנית — תודה רבה! הוא יועבר בקרוב לנציג המתאים, ונעדכן אותך בכל שלב.',
      });
    }
    for (const [id, j] of out) j.quoteAmount = quoteAmountByReferral.get(id) ?? null;
    return out;
  }

  /**
   * שדאוג טקסט חופשי של השותף (למשל הודעת וואטסאפ מועתקת) לשדות הטופס המובנים.
   * שימושי במיוחד לשותפים שמעדיפים להעתיק הודעה אחת ולא לעבור שדה-שדה.
   *
   * מחזיר שדות שה-UI יודע למלא בטופס. ערכים שלא נמצאו — ריקים. ה-AI מקבל הנחיה
   * מדויקת לנרמל מספרי טלפון, לזהות עיר/כתובת, ולסווג לסוג שירות (אחת מתוך
   * רשימת הקטגוריות של השותפים). כולל response_format=json_object כדי שהתשובה
   * תהיה JSON בטוח לפענוח.
   */
  async parseFreeText(affiliateId: string, rawText: string): Promise<{
    classification: 'PRIVATE' | 'COMPANY';
    customerName: string;
    companyName: string;
    customerPhone: string;
    customerEmail: string;
    serviceType: string;
    address: string;
    city: string;
    note: string;
  }> {
    const text = (rawText || '').trim();
    if (!text) throw new BadRequestException('טקסט ריק');
    if (text.length > 4000) throw new BadRequestException('הטקסט ארוך מדי');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new BadRequestException('שירות ה-AI אינו מוגדר בשרת');

    const SERVICE_OPTIONS = [
      'בדיקת קרינה',
      'מיגון קרינה',
      'בדיקת ראדון',
      'בדיקת אסבסט / סקר אסבסט',
      'בדיקת רעש / אקוסטיקה',
      'איכות אוויר / עובש',
      'בדיקת מים',
      'בדיקת ריח',
      'בדיקה תרמית / דוח אנרגטי',
      'קרקע / גז קרקע',
      'גהות ורעש תעסוקתי',
      'בנייה ירוקה',
      'חוות דעת סביבתית',
      'אחר',
    ];

    const systemPrompt =
      `אתה עוזר הזנה בפורטל שותפים של גלית — החברה לאיכות הסביבה. ` +
      `המשתמש מדביק הודעה חופשית (למשל וואטסאפ) שמתארת לקוח, ואתה מחלץ ממנה שדות מובנים. ` +
      `ענה **אך ורק** באובייקט JSON יחיד, בלי טקסט לפני/אחרי, בלי code fences. ` +
      `החזר את המפתחות הבאים (ריק אם לא ברור): classification ('PRIVATE' או 'COMPANY'), ` +
      `customerName (שם איש הקשר), companyName (שם החברה — רק אם classification=COMPANY), ` +
      `customerPhone (מספר ישראלי בפורמט 05X-XXXXXXX או 0X-XXXXXXX; רק הספרות + מקף), ` +
      `customerEmail, serviceType (אחד מהערכים הבאים בדיוק: ${SERVICE_OPTIONS.join(' / ')}; ` +
      `אם לא ברור בחר 'אחר'), address (רחוב+מספר), city (עיר), ` +
      `note (סיכום צורך הלקוח במשפט או שניים, בלי לחזור על טלפון/מייל/שם).\n` +
      `כללים: ` +
      `(1) אל תמציא מידע שלא קיים בטקסט — ערך לא ברור יישאר ריק. ` +
      `(2) אם רואים "עסק/חברה/בעמ/בע״מ/ח.פ" או שם של חברה → classification=COMPANY. ` +
      `(3) טלפון: נרמל ל-05x-xxxxxxx; קידומת 0 חוזרת גם אם המשתמש כתב 972.`;

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e: any) {
      this.logger.error(`parseFreeText OpenAI fetch failed: ${e?.message}`);
      throw new BadRequestException('פענוח AI נכשל — נסה שוב');
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`parseFreeText OpenAI ${res.status}: ${detail}`);
      throw new BadRequestException('פענוח ה-AI נכשל');
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new BadRequestException('לא התקבל פענוח מה-AI');

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadRequestException('ה-AI החזיר תשובה שלא ניתנת לפענוח');
    }

    const classification =
      String(parsed.classification || '').toUpperCase() === 'COMPANY' ? 'COMPANY' : 'PRIVATE';
    const serviceRaw = String(parsed.serviceType || '').trim();
    // גילוי-גרידא: GPT עלול להחזיר ווריאציה — אם לא התאמה מדויקת, 'אחר'.
    const serviceType = SERVICE_OPTIONS.includes(serviceRaw) ? serviceRaw : 'אחר';

    const phoneRaw = String(parsed.customerPhone || '').trim();
    const phoneNorm = phoneRaw ? formatIsraeliPhone(phoneRaw) || phoneRaw : '';

    this.logger.log(`parseFreeText for affiliate ${affiliateId}: ok (len=${text.length})`);

    return {
      classification,
      customerName: String(parsed.customerName || '').trim(),
      companyName: classification === 'COMPANY' ? String(parsed.companyName || '').trim() : '',
      customerPhone: phoneNorm,
      customerEmail: String(parsed.customerEmail || '').trim(),
      serviceType,
      address: String(parsed.address || '').trim(),
      city: String(parsed.city || '').trim(),
      note: String(parsed.note || '').trim(),
    };
  }

  /** השותף שולח לנו לקוח חדש. */
  async submitReferral(affiliateId: string, input: {
    customerName?: string; customerPhone?: string; customerEmail?: string; serviceType?: string; note?: string;
    referredBy?: string;
  }) {
    const customerName = (input.customerName || '').trim();
    if (!customerName) throw new BadRequestException('שם הלקוח חסר');
    if (!(input.customerPhone || '').trim() && !(input.customerEmail || '').trim()) {
      throw new BadRequestException('יש למלא טלפון או אימייל של הלקוח');
    }
    const referredBy = (input.referredBy || '').trim() || null;
    if (referredBy) {
      const aff = await this.prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { referrerOptions: true } });
      if (!aff?.referrerOptions.includes(referredBy)) throw new BadRequestException('המפנה שנבחר אינו ברשימה');
    }
    const r = await this.prisma.affiliateReferral.create({
      data: {
        affiliateId,
        customerName,
        customerPhone: formatIsraeliPhone(input.customerPhone) || null,
        customerEmail: input.customerEmail?.trim() || null,
        serviceType: input.serviceType?.trim() || null,
        note: input.note?.trim() || null,
        referredBy,
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
        referredBy,
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
    c: { customerName: string; customerPhone: string | null; customerEmail: string | null; serviceType: string | null; note: string | null; referredBy: string | null },
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
      c.referredBy ? `הופנה ע״י: ${c.referredBy}` : '',
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
    const journeyByReferral = await this.resolveJourney(refs);
    return refs.map((r) => ({
      ...this.publicReferral(r),
      affiliateName: r.affiliate.name,
      affiliateId: r.affiliateId,
      quoteAmount: journeyByReferral.get(r.id)?.quoteAmount ?? null,
    }));
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
    serviceType: string | null; note: string | null; referredBy: string | null; status: string; leadId: string | null; taskId: string | null;
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
      referredBy: r.referredBy,
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
