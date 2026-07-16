import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OpportunityStage, Prisma, QuoteStatus, ReportStatus, UserRole, WorkMode, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
/**
 * תחילת היום (חצות) לפי שעון ישראל, כ-Date ב-UTC — נקודת ה-cutoff ל"באיחור".
 * משימה נחשבת באיחור רק אם תאריך היעד שלה *לפני* תחילת היום הנוכחי בשעון ישראל,
 * כלומר משימה שתאריך היעד שלה היום — בכל שעה — עדיין אינה באיחור. תואם את חישוב
 * הרשימה בצד הלקוח (today.setHours(0,0,0,0)), כדי שהכרטיס והרשימה יסכימו.
 * ה-offset נגזר מ-Intl (Asia/Jerusalem) ולכן מטפל ב-DST אוטומטית.
 */
function startOfTodayIsrael(now = new Date()): Date {
  // התאריך הקלנדרי (YYYY-MM-DD) כפי שהוא בישראל כרגע.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // e.g. "2026-07-12"
  // ה-offset של ישראל כרגע (‎+02:00/+03:00), במילישניות.
  const offLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset',
  }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(offLabel);
  const offsetMs = m
    ? (m[1] === '-' ? -1 : 1) * ((Number(m[2]) * 60 + Number(m[3] || '0')) * 60_000)
    : 2 * 60 * 60_000;
  // חצות מקומית בישראל = חצות-UTC-של-אותו-יום פחות ה-offset.
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - offsetMs);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** ברירת המחדל ליעד ההכנסות החודשי — כשעדיין לא הוגדר יעד בהגדרות. */
  private static readonly DEFAULT_MONTHLY_REVENUE_TARGET = 450_000;

  /**
   * קורא את יעד ההכנסות החודשי שנשמר בהגדרות (SystemSetting key="targets",
   * שדה monthlyRevenueTarget) — מוזן ע"י מנהל במסך "יעדים". נופל לברירת מחדל
   * אם לא הוגדר / לא תקין. best-effort — לא זורק (כדי לא להפיל את הדשבורד).
   */
  private async getMonthlyRevenueTarget(): Promise<number> {
    try {
      const s: any = await this.prisma.systemSetting.findUnique({ where: { key: 'targets' } });
      const raw = s?.value?.monthlyRevenueTarget;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* נופל לברירת המחדל */
    }
    return DashboardService.DEFAULT_MONTHLY_REVENUE_TARGET;
  }

  /**
   * מעדכן את יעד ההכנסות השנתי (SystemSetting key="targets"). המנהל מזין יעד *שנתי*
   * בכרטיס "עמידה ביעד מכירות שנתי", ואנחנו שומרים אותו כיעד *חודשי* (שנתי ÷ 12),
   * כי כל שאר הדשבורד עובד מול היעד החודשי. משמר שדות אחרים שקיימים ב-value.
   * מנהל/אדמין בלבד. מחזיר את היעד השנתי והחודשי שנשמרו.
   */
  async setAnnualRevenueTarget(annualTarget: number, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    const annual = Math.round(Number(annualTarget));
    if (!Number.isFinite(annual) || annual <= 0) {
      throw new BadRequestException('יעד שנתי חייב להיות מספר חיובי');
    }
    const monthly = Math.round(annual / 12);

    const existing: any = await this.prisma.systemSetting.findUnique({ where: { key: 'targets' } }).catch(() => null);
    const prevValue = existing && typeof existing.value === 'object' && existing.value ? existing.value : {};
    const value = { ...prevValue, monthlyRevenueTarget: monthly };

    await this.prisma.systemSetting.upsert({
      where: { key: 'targets' },
      create: { key: 'targets', value },
      update: { value },
    });

    return { monthlyRevenueTarget: monthly, annualRevenueTarget: monthly * 12 };
  }

  async manager(user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    try {
    // יעד ההכנסות החודשי — מהגדרות המנהל ("יעדים"), עם נפילה לברירת מחדל.
    const monthlyRevenueTarget = await this.getMonthlyRevenueTarget();

    const now = new Date();
    const som = startOfMonth(now);
    const sow = startOfWeek(now);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // חלון שביעות רצון מתגלגל — תמיד 30 הימים האחרונים, לא "לכל החיים".
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      users,
      opportunities,
      quotes,
      leads,
      projects,
      tasks,
      reportsWaitingCount,
      ratedReviews,
      customerTypeCounts,
      classifications,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.EXPERT, UserRole.TECHNICIAN] },
        },
        select: { id: true, name: true, email: true, role: true, status: true, isOnline: true, lastSeenAt: true, currentWorkMode: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.opportunity.findMany({
        include: {
          assignedUser: { select: { id: true, name: true, role: true } },
          customer: { select: { id: true, name: true } },
          lead: { select: { id: true, fullName: true, phone: true, email: true, serviceType: true, source: true, utm_source: true, createdAt: true, updatedAt: true, assignedUserId: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.quote.findMany({
        include: {
          customer: { select: { id: true, name: true } },
          opportunity: { select: { id: true, pipelineStage: true, assignedUserId: true, projectOrServiceName: true } },
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      // מקור הלידים האמיתי = IncomingLead (לידים שנכנסו מהמייל), לא טבלת Lead שנשארת ריקה.
      this.prisma.incomingLead.findMany({
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.project.findMany({
        include: {
          assignedTechnician: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.task.findMany({
        select: { id: true, status: true, dueDate: true },
      }),

      this.prisma.report.count({
        where: { status: ReportStatus.WAITING_DATA },
      }),

      // ביקורות שנקלטו בפועל (הלקוח בחר פרצוף) — rating לא-null. משמש לכרטיס "שביעות רצון".
      // חלון מתגלגל: רק דירוגים מ-30 הימים האחרונים (ratedAt >= thirtyDaysAgo), כך שהמדד תמיד מתעדכן.
      this.prisma.reviewRequest.findMany({
        where: { rating: { not: null }, ratedAt: { gte: thirtyDaysAgo } },
        select: { rating: true, feedback: true, ratedAt: true, customerId: true, customerName: true },
        orderBy: [{ ratedAt: 'desc' }],
      }),

      // פילוח לקוחות — ספירת לקוחות אמיתית לפי קוד הסיווג (Customer.type).
      this.prisma.customer.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      // תוויות הסיווגים (COMPANY/PUBLIC/PRIVATE + סיווגים שנוספו בהגדרות) — למיפוי קוד→שם בעברית.
      this.prisma.customerClassification.findMany({
        select: { code: true, labelHe: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { labelHe: 'asc' }],
      }),
    ]);

    // Won revenue this month: approved/signed quotes updated this month (best available proxy)
    const wonQuotesThisMonth = quotes.filter((q) =>
      (q.status === QuoteStatus.APPROVED || q.status === (QuoteStatus as any).SIGNED) &&
      q.updatedAt >= som,
    );
    const wonRevenueThisMonth = wonQuotesThisMonth.reduce((a, q) => a + Number(q.totalAmount ?? q.amount ?? 0), 0);

    // Pipeline: open opportunities (not WON/LOST) sum estimatedValue
    const openOpps = opportunities.filter((o) => o.pipelineStage !== OpportunityStage.WON && o.pipelineStage !== OpportunityStage.LOST);
    const openPipelineValue = openOpps.reduce((a, o) => a + Number(o.estimatedValue ?? 0), 0);

    // Weighted forecast by stage (simple and explainable)
    const stageWeight: Record<string, number> = {
      NEW: 0.15,
      QUALIFIED: 0.25,
      PROPOSAL: 0.4,
      NEGOTIATION: 0.55,
      WON: 1,
      LOST: 0,
    };
    const weightedPipeline = openOpps.reduce((a, o) => a + Number(o.estimatedValue ?? 0) * (stageWeight[o.pipelineStage] ?? 0.25), 0);
    const forecastRealistic = wonRevenueThisMonth + weightedPipeline;
    const forecastWorst = wonRevenueThisMonth + openPipelineValue * 0.15;
    const forecastBest = wonRevenueThisMonth + openPipelineValue * 0.55;

    // Win-rate team: opps won/(won+lost)
    const wonOpps = opportunities.filter((o) => o.pipelineStage === OpportunityStage.WON);
    const lostOpps = opportunities.filter((o) => o.pipelineStage === OpportunityStage.LOST);
    const teamWinRate = (wonOpps.length + lostOpps.length) === 0 ? 0 : wonOpps.length / (wonOpps.length + lostOpps.length);

    // לידים פתוחים = חדשים שממתינים או בטיפול (IncomingLead: NEW / ACTIVE).
    const openLeads = leads.filter((l) => ['NEW', 'ACTIVE'].includes((l.status as any) || ''));

    // Leaderboard: group by assigned user (opps assignedUserId; leads assignedUserId)
    const reps = users.filter((u) => u.role === UserRole.SALES || u.role === UserRole.EXPERT);

    const repRows = reps.map((rep) => {
      const repOpps = opportunities.filter((o) => o.assignedUserId === rep.id);
      const repOpenOpps = repOpps.filter((o) => o.pipelineStage !== OpportunityStage.WON && o.pipelineStage !== OpportunityStage.LOST);
      const repWonOpps = repOpps.filter((o) => o.pipelineStage === OpportunityStage.WON);
      const repLostOpps = repOpps.filter((o) => o.pipelineStage === OpportunityStage.LOST);

      const repWonQuotesThisMonth = wonQuotesThisMonth.filter((q) => q.opportunity?.assignedUserId === rep.id);
      const repWonRevenueThisMonth = repWonQuotesThisMonth.reduce((a, q) => a + Number(q.totalAmount ?? q.amount ?? 0), 0);

      const repPipelineValue = repOpenOpps.reduce((a, o) => a + Number(o.estimatedValue ?? 0), 0);

      const repOpenLeads = openLeads.filter((l) => l.ownerId === rep.id);
      const weeklyActivity = leads.filter((l) => l.ownerId === rep.id && l.updatedAt >= sow && l.status === 'ACTIVE').length;

      const stuckDeals14 = repOpenOpps.filter((o) => o.createdAt < fourteenDaysAgo).length;

      const winRate = (repWonOpps.length + repLostOpps.length) === 0 ? 0 : repWonOpps.length / (repWonOpps.length + repLostOpps.length);

      // Temporary: derive quota target evenly until a real quota system exists
      const quotaTarget = Math.round(monthlyRevenueTarget / Math.max(1, reps.length));
      const attainmentPct = quotaTarget === 0 ? 0 : repWonRevenueThisMonth / quotaTarget;

      return {
        repId: rep.id,
        repName: rep.name,
        quotaTarget,
        attainmentPct,
        wonRevenueThisMonth: repWonRevenueThisMonth,
        wonDealsCount: repWonQuotesThisMonth.length,
        personalWinRate: winRate,
        pipelineValue: repPipelineValue,
        openLeadsCount: repOpenLeads.length,
        weeklyActivity,
        stuckDealsOver14: stuckDeals14,
        stages: {
          // IncomingLead תומך רק ב-NEW/ACTIVE. ACTIVE = "בטיפול" → מוצג תחת FU_1.
          NEW: repOpenLeads.filter((l) => (l.status as any) === 'NEW').length,
          FU_1: repOpenLeads.filter((l) => (l.status as any) === 'ACTIVE').length,
          FU_2: 0,
          QUOTE_SENT: 0,
          WON: repWonOpps.length,
          LOST: repLostOpps.length,
        },
      };
    }).sort((a, b) => b.wonRevenueThisMonth - a.wonRevenueThisMonth);

    // Charts
    const pipelineStagesByRep = repRows.map((r) => ({
      rep: r.repName,
      NEW: r.stages.NEW,
      'FU-1': r.stages.FU_1,
      'FU-2': r.stages.FU_2,
      'Quote Sent': r.stages.QUOTE_SENT,
      WON: r.stages.WON,
      LOST: r.stages.LOST,
    }));

    const leadSourcesMap = new Map<string, number>();
    for (const l of leads) {
      // אין UTM ב-IncomingLead — מקור = דומיין המייל השולח (best-effort).
      const domain = (l.fromEmail || '').split('@')[1];
      const key = (domain || 'לא ידוע').toString();
      leadSourcesMap.set(key, (leadSourcesMap.get(key) || 0) + 1);
    }
    const leadSourcesPie = Array.from(leadSourcesMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // פילוח לקוחות אמיתי — כמות לקוחות לכל סיווג, ממופה לתווית העברית מטבלת הסיווגים.
    // מוצגים כל הסיווגים שקיימים בטבלה (כולל כאלה שנוספו בהגדרות); קודים ללא תווית מקבלים "אחר".
    const classificationLabel = new Map<string, string>(
      (classifications as { code: string; labelHe: string }[]).map((c) => [c.code, c.labelHe]),
    );
    // צבעי הפילוח: משפחת ירוק→צהוב (ירוק עמוק / ירוק-טורקיז / צהוב-זהב), במקום שבעה גווני
    // ירוק שנראו זהים. הסדר קבוע ומאומת מול ה-validator: בעוגה כל פרוסה מושווית לכל פרוסה
    // אחרת, ובטווח הצר ירוק↔צהוב אי אפשר להפריד יותר משלושה גוונים (רביעי מתנגש בצהוב גם
    // לראייה תקינה) — לכן הזנב מתאחד ל"אחר" באפור כהה במקום לקבל גוון רביעי.
    const SEGMENT_PALETTE = ['#008300', '#1baf7a', '#eda100'];
    const SEGMENT_OTHER_COLOR = '#52514e'; // אפור כהה ניטרלי — "אחר" אינו קטגוריה, ונפרד מהגוונים
    const MAX_SEGMENT_SLICES = 3;
    const allSegments = (customerTypeCounts as { type: string | null; _count: { _all: number } }[])
      .map((row) => {
        const code = (row.type || '').trim();
        const name = classificationLabel.get(code) || (code ? code : 'אחר');
        return { name, value: row._count._all };
      })
      // איחוד רשומות שנופלות לאותה תווית (למשל קודים לא ממופים → "אחר").
      .reduce<{ name: string; value: number }[]>((acc, cur) => {
        const hit = acc.find((s) => s.name === cur.name);
        if (hit) hit.value += cur.value;
        else acc.push({ ...cur });
        return acc;
      }, [])
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
    // ארבעת הגדולים מקבלים גוון; כל השאר (זנב ארוך של סיווגים זניחים) מתאחדים לפרוסת "אחר".
    const headSegments = allSegments.slice(0, MAX_SEGMENT_SLICES);
    const tailTotal = allSegments.slice(MAX_SEGMENT_SLICES).reduce((sum, s) => sum + s.value, 0);
    const customerSegments = headSegments.map((s, i) => ({ ...s, color: SEGMENT_PALETTE[i] }));
    if (tailTotal > 0) {
      // אם כבר יש פרוסת "אחר" מהסיווגים עצמם — מוסיפים אליה את הזנב במקום ליצור פרוסה כפולה.
      const existingOther = customerSegments.find((s) => s.name === 'אחר');
      if (existingOther) {
        existingOther.value += tailTotal;
        existingOther.color = SEGMENT_OTHER_COLOR;
      } else {
        customerSegments.push({ name: 'אחר', value: tailTotal, color: SEGMENT_OTHER_COLOR });
      }
    }

    // Quota progress: approximate cumulative by week from won quotes updatedAt
    const days = [1, 8, 15, 22, 29];
    const quotaProgress = days.map((day) => {
      const cutoff = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59);
      const row: any = { day: String(day) };
      for (const r of repRows) {
        const repWonUpTo = wonQuotesThisMonth
          .filter((q) => q.opportunity?.assignedUserId === r.repId && q.updatedAt <= cutoff)
          .reduce((a, q) => a + Number(q.totalAmount ?? q.amount ?? 0), 0);
        row[r.repName] = r.quotaTarget ? Math.min(100, Math.round((repWonUpTo / r.quotaTarget) * 100)) : 0;
      }
      return row;
    });

    // Conversion funnel: leads -> quotes sent -> won (approved)
    const leadsCount = leads.length;
    const quotesSentCount = quotes.filter((q) => q.status === QuoteStatus.SENT && q.createdAt >= som).length;
    const wonCount = wonQuotesThisMonth.length;
    const conversionFunnel = [
      { step: 'לידים', value: leadsCount },
      { step: 'הצעה נשלחה', value: quotesSentCount },
      { step: 'זכייה', value: wonCount },
    ];

    // Alerts
    const agingDeals = openOpps
      .filter((o) => o.createdAt < fourteenDaysAgo)
      .slice(0, 10)
      .map((o) => ({
        rep: o.assignedUser?.name || 'לא משויך',
        deal: o.projectOrServiceName,
        ageDays: Math.ceil((now.getTime() - o.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
        value: Number(o.estimatedValue ?? 0),
        stage: o.pipelineStage,
        level: o.createdAt < new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000) ? 'red' : 'yellow',
      }));

    // Leads with no activity: use updatedAt (best approximation until full activity log exists)
    const inactiveLeads = leads
      .filter((l) => l.updatedAt < sevenDaysAgo && ['NEW', 'ACTIVE'].includes((l.status as any) || ''))
      .slice(0, 10)
      .map((l) => ({
        rep: users.find((u) => u.id === l.ownerId)?.name || 'לא משויך',
        leadName: l.fromName || l.subject || 'ליד',
        phone: '',
        serviceType: l.subject || '',
        lastActivity: l.updatedAt.toISOString().slice(0, 10),
        inactiveDays: Math.ceil((now.getTime() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
        level: l.updatedAt < new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) ? 'red' : 'yellow',
      }));

    // Breakdowns
    const leadsByServiceMap = new Map<string, number>();
    for (const l of leads) {
      // אין שדה שירות ב-IncomingLead — נגזר מנושא המייל (subject).
      const key = (l.subject || 'אחר').toString();
      leadsByServiceMap.set(key, (leadsByServiceMap.get(key) || 0) + 1);
    }
    const leadsByServiceType = Array.from(leadsByServiceMap.entries())
      .map(([service, value]) => ({ service, value }))
      .sort((a, b) => b.value - a.value);

    const openProjectsFiltered = projects.filter((p) => !['CLOSED', 'CANCELLED'].includes((p.status as any) || ''));
    const projectsOpenCount = openProjectsFiltered.length;
    const projectsInFieldCount = openProjectsFiltered.filter((p) => ['ON_THE_WAY', 'FIELD_WORK_DONE'].includes((p.status as any) || '')).length;

    const openProjects = openProjectsFiltered
      .map((p) => ({
        id: p.id,
        title: p.name,
        client: p.client,
        status: p.status,
        priority: p.urgency ?? null,
        dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
        technician: p.assignedTechnician?.name || null,
        updatedAt: p.updatedAt.toISOString(),
      }))
      .sort((a, b) => {
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 10);

    // IncomingLead.status = NEW / ACTIVE / DISMISSED. ממפים למונחי הדשבורד.
    const leadStatusOf = (l: any) => ((l?.status || '') as string).toUpperCase();

    // Incoming leads feed + who took each one (which employee). Most recent first.
    const recentLeadsTaken = [...leads]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 15)
      .map((l) => {
        const owner = l.ownerId ? users.find((u) => u.id === l.ownerId) : null;
        return {
          id: l.id,
          name: l.fromName || l.subject || 'ליד',
          phone: '',
          source: l.fromEmail || '—',
          serviceType: l.subject || '—',
          createdAt: l.createdAt.toISOString(),
          status: leadStatusOf(l),
          assignedUserId: l.ownerId || null,
          assignedUserName: owner?.name || null,
        };
      });

    const leadStatuses = leads.map(leadStatusOf);
    const leadsNew = leadStatuses.filter((s) => s === 'NEW').length;
    const leadsInTreatment = leadStatuses.filter((s) => s === 'ACTIVE').length;
    const leadsWon = 0; // אין סטטוס "נסגר בהצלחה" ב-IncomingLead — ליד שנסגר הופך ללקוח/הזמנה במקום אחר.
    const leadsLost = leadStatuses.filter((s) => s === 'DISMISSED').length;

    // ── לידים חדשים ברבעון (נתוני אמת לפי createdAt) + השוואה לרבעון הקודם ──
    // רבעון = 3 חודשים קלנדריים. סופרים לפי מועד יצירת הליד, לא לפי הסטטוס הנוכחי.
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const thisQuarterStart = new Date(now.getFullYear(), qStartMonth, 1);
    const prevQuarterStart = new Date(now.getFullYear(), qStartMonth - 3, 1); // JS מנרמל חודש שלילי לשנה הקודמת
    const leadsNewThisQuarter = leads.filter((l) => l.createdAt >= thisQuarterStart).length;
    const leadsNewPrevQuarter = leads.filter((l) => l.createdAt >= prevQuarterStart && l.createdAt < thisQuarterStart).length;
    // אחוז שינוי מול הרבעון הקודם. אם ברבעון הקודם היו 0 לידים — אין בסיס להשוואה (null).
    const leadsQuarterChangePct = leadsNewPrevQuarter > 0
      ? Math.round(((leadsNewThisQuarter - leadsNewPrevQuarter) / leadsNewPrevQuarter) * 100)
      : null;

    // ── שביעות רצון לקוחות מתוך הביקורות שנקלטו בפועל (ReviewRequest.rating) ──
    const reviewRatings = ratedReviews.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
    const reviewsCount = reviewRatings.length;
    const reviewsAvg = reviewsCount ? reviewRatings.reduce((a, n) => a + n, 0) / reviewsCount : 0;
    // CSAT = אחוז הלקוחות ששבעי רצון (דירוג 4-5) מתוך כלל המדרגים.
    const reviewsSatisfiedPct = reviewsCount
      ? Math.round((reviewRatings.filter((n) => n >= 4).length / reviewsCount) * 100)
      : null;
    // פירוט לרשימה שנפתחת בלחיצה — שם הלקוח, הדירוג, והסיבה (המשוב החופשי, אם נכתב).
    const reviewsList = ratedReviews
      .filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5)
      .map((r) => ({
        customerId: r.customerId ?? null,
        customerName: r.customerName || 'לקוח',
        rating: Number(r.rating),
        reason: (r.feedback || '').trim() || null,
        ratedAt: r.ratedAt ? r.ratedAt.toISOString() : null,
      }));

    const openTaskStatuses = new Set<TaskStatus>([TaskStatus.OPEN, TaskStatus.IN_PROGRESS]);
    const overdueCutoff = startOfTodayIsrael(now); // באיחור = לפני תחילת היום (שעון ישראל), לא "כרגע"
    const tasksOpen = tasks.filter((t) => openTaskStatuses.has((t.status as TaskStatus) || TaskStatus.OPEN)).length;
    const tasksOverdue = tasks.filter((t) => {
      if (!t.dueDate) return false;
      if (!openTaskStatuses.has((t.status as TaskStatus) || TaskStatus.OPEN)) return false;
      return t.dueDate.getTime() < overdueCutoff.getTime();
    }).length;
    const quotesOpenActive = quotes.filter((q) => q.status === QuoteStatus.DRAFT || q.status === QuoteStatus.SENT).length;

    // Presence rule (stable + simple):
    // active now if isOnline=true OR lastSeenAt within last 10 minutes
    const threshold = new Date(now.getTime() - 10 * 60 * 1000);
    const workingNow = users
      .filter((u) => (u as any).isOnline === true || ((u as any).lastSeenAt && (u as any).lastSeenAt >= threshold))
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        isOnline: (u as any).isOnline ?? false,
        lastSeenAt: (u as any).lastSeenAt ?? null,
        currentWorkMode: (u as any).currentWorkMode ?? null,
        currentProjectId: (u as any).currentProjectId ?? null,
      }));

    // Optionally attach current project for technicians
    const techIds = workingNow.filter((u) => u.role === UserRole.TECHNICIAN).map((u) => u.id);
    const techProjects = techIds.length
      ? await this.prisma.project.findMany({
          where: { assignedTechnicianId: { in: techIds }, status: { in: ['SCHEDULED', 'ON_THE_WAY', 'FIELD_WORK_DONE', 'WAITING_DATA'] as any } },
          select: { id: true, name: true, assignedTechnicianId: true },
          orderBy: [{ updatedAt: 'desc' }],
        })
      : [];

    const selectedProjectIds = Array.from(new Set(workingNow.map((u) => u.currentProjectId).filter(Boolean))) as string[];
    const selectedProjects = selectedProjectIds.length
      ? await this.prisma.project.findMany({
          where: { id: { in: selectedProjectIds } },
          select: { id: true, name: true },
        })
      : [];

    const workingNowEmployees = workingNow.map((u) => {
      const currentProject = u.role === UserRole.TECHNICIAN ? techProjects.find((p) => p.assignedTechnicianId === u.id) : undefined;
      const selected = u.currentProjectId ? selectedProjects.find((p) => p.id === u.currentProjectId) : undefined;
      return {
        ...u,
        activeNow: true,
        locationLabel: u.currentWorkMode === WorkMode.FIELD ? 'FIELD' : u.currentWorkMode === WorkMode.OFFICE ? 'OFFICE' : null,
        currentProject: selected ? { id: selected.id, name: selected.name } : (currentProject ? { id: currentProject.id, name: currentProject.name } : null),
      };
    });

    return {
      updatedAt: now.toISOString(),
      config: { monthlyRevenueTarget },
      kpis: {
        monthlyRevenueTarget,
        wonRevenueThisMonth,
        attainmentPct: monthlyRevenueTarget ? wonRevenueThisMonth / monthlyRevenueTarget : 0,
        openPipelineValue,
        pipelinePctOfTarget: monthlyRevenueTarget ? openPipelineValue / monthlyRevenueTarget : 0,
        forecast: {
          best: Math.round(forecastBest),
          realistic: Math.round(forecastRealistic),
          worst: Math.round(forecastWorst),
        },
        teamWinRate,
      },
      leaderboard: repRows.map((r, idx) => ({ rank: idx + 1, ...r })),
      charts: {
        pipelineStagesByRep,
        leadSourcesPie,
        quotaProgress,
        conversionFunnel,
        customerSegments,
      },
      alerts: {
        agingDeals,
        inactiveLeads,
      },
      breakdowns: {
        leadsByServiceType,
        openProjects,
      },
      recentLeadsTaken,
      coreCounts: {
        leadsNew,
        leadsInTreatment,
        leadsWon,
        leadsLost,
        leadsNewThisQuarter,
        leadsNewPrevQuarter,
        leadsQuarterChangePct,
        tasksOpen,
        tasksOverdue,
        quotesOpenActive,
        projectsOpen: projectsOpenCount,
        projectsInField: projectsInFieldCount,
        reportsWaiting: reportsWaitingCount,
      },
      reviews: {
        count: reviewsCount,
        avg: Math.round(reviewsAvg * 10) / 10, // עיגול לספרה אחת אחרי הנקודה (למשל 4.6)
        satisfiedPct: reviewsSatisfiedPct,
        list: reviewsList,
      },
      workingNowEmployees,
      assumptions: {
        monthlyRevenueTarget: 'From SystemSetting("targets").monthlyRevenueTarget (manager-configured), default 450,000',
        wonRevenueThisMonth: 'Sum of APPROVED (and legacy SIGNED) quotes where updatedAt is within current month',
        pipeline: 'Sum of estimatedValue for opportunities not WON/LOST',
        winRate: 'Opportunities WON / (WON+LOST)',
        weeklyActivity: 'Count of leads updated this week with leadStatus FU_1/FU_2 (no meetings/events table yet)',
        inactivity: 'Lead.updatedAt older than 7 days (no activity log yet)',
      },
    };
    } catch {
      return this.managerEmptyPayload();
    }
  }

  /**
   * Personal dashboard for a single employee — real per-employee sales metrics
   * pulled from the correct tables (leads/opportunities/quotes/tasks) and scoped
   * to the requesting user. Used by the non-manager employee dashboard.
   */
  async me(user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    const userId = user?.id;
    if (!userId) throw new UnauthorizedException('Missing user id');

    try {
      const now = new Date();
      const som = startOfMonth(now);

      const [me, leads, opportunities, quotes, tasks] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } }),
        this.prisma.incomingLead.findMany({
          where: { ownerId: userId },
          orderBy: [{ createdAt: 'desc' }],
        }),
        this.prisma.opportunity.findMany({
          where: { assignedUserId: userId },
          select: { id: true, estimatedValue: true, pipelineStage: true, createdAt: true },
        }),
        // A quote "belongs" to the user if they are its sales rep / performer,
        // or it sits on an opportunity / lead assigned to them.
        this.prisma.quote.findMany({
          where: {
            OR: [
              { salesRepresentativeId: userId },
              { performerUserId: userId },
              { opportunity: { assignedUserId: userId } },
              { lead: { assignedUserId: userId } },
            ],
          },
          select: { id: true, status: true, totalAmount: true, amount: true, updatedAt: true },
        }),
        this.prisma.task.findMany({
          where: { ownerId: userId },
          select: { id: true, status: true, dueDate: true },
        }),
      ]);

      const leadStatusOf = (l: any) => ((l?.status || '') as string).toUpperCase();
      const statuses = leads.map(leadStatusOf);
      const leadsNew = statuses.filter((s) => s === 'NEW').length;
      const leadsInTreatment = statuses.filter((s) => s === 'ACTIVE').length;
      const leadsWon = 0; // אין סטטוס WON ב-IncomingLead.
      const leadsLost = statuses.filter((s) => s === 'DISMISSED').length;
      const totalLeads = leads.length;

      const isWon = (q: any) => q.status === QuoteStatus.APPROVED || q.status === (QuoteStatus as any).SIGNED;
      const quotesSent = quotes.filter((q) => q.status === QuoteStatus.SENT).length;
      const quotesApproved = quotes.filter(isWon).length;
      const openQuotes = quotes.filter((q) => q.status === QuoteStatus.DRAFT || q.status === QuoteStatus.SENT).length;
      const wonRevenueTotal = quotes.filter(isWon).reduce((a, q) => a + Number(q.totalAmount ?? q.amount ?? 0), 0);
      const wonRevenueThisMonth = quotes
        .filter((q) => isWon(q) && q.updatedAt >= som)
        .reduce((a, q) => a + Number(q.totalAmount ?? q.amount ?? 0), 0);

      const openOpps = opportunities.filter((o) => o.pipelineStage !== OpportunityStage.WON && o.pipelineStage !== OpportunityStage.LOST);
      const pipelineValue = openOpps.reduce((a, o) => a + Number(o.estimatedValue ?? 0), 0);
      const wonOpps = opportunities.filter((o) => o.pipelineStage === OpportunityStage.WON).length;
      const lostOpps = opportunities.filter((o) => o.pipelineStage === OpportunityStage.LOST).length;
      const winRate = (wonOpps + lostOpps) === 0 ? 0 : wonOpps / (wonOpps + lostOpps);

      const openTaskStatuses = new Set<TaskStatus>([TaskStatus.OPEN, TaskStatus.IN_PROGRESS]);
      const overdueCutoff = startOfTodayIsrael(now); // באיחור = לפני תחילת היום (שעון ישראל), לא "כרגע"
      const openTasks = tasks.filter((t) => openTaskStatuses.has((t.status as TaskStatus) || TaskStatus.OPEN)).length;
      const overdueTasks = tasks.filter((t) => {
        if (!t.dueDate) return false;
        if (!openTaskStatuses.has((t.status as TaskStatus) || TaskStatus.OPEN)) return false;
        return t.dueDate.getTime() < overdueCutoff.getTime();
      }).length;

      const conversionLeadToQuote = totalLeads === 0 ? 0 : Math.round((quotesSent / totalLeads) * 100);
      const conversionQuoteToWon = quotesSent === 0 ? 0 : Math.round((quotesApproved / quotesSent) * 100);

      const bySource = new Map<string, number>();
      const byService = new Map<string, number>();
      for (const l of leads) {
        const domain = ((l as any).fromEmail || '').split('@')[1];
        const src = (domain || 'לא ידוע').toString();
        bySource.set(src, (bySource.get(src) || 0) + 1);
        const svc = ((l as any).subject || 'אחר').toString();
        byService.set(svc, (byService.get(svc) || 0) + 1);
      }
      const leadsBySource = Array.from(bySource.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
      const leadsByServiceType = Array.from(byService.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

      const recentLeads = leads.slice(0, 8).map((l) => ({
        id: l.id,
        name: l.fromName || l.subject || 'ליד',
        phone: '',
        serviceType: l.subject || '',
        source: l.fromEmail || '',
        status: leadStatusOf(l),
        createdAt: l.createdAt ? l.createdAt.toISOString() : null,
      }));

      return {
        updatedAt: now.toISOString(),
        user: { id: me?.id || userId, name: me?.name || '', role: me?.role || role },
        kpis: {
          leadsNew,
          leadsInTreatment,
          leadsWon,
          leadsLost,
          totalLeads,
          openTasks,
          overdueTasks,
          openQuotes,
          quotesSent,
          quotesApproved,
          wonRevenueThisMonth,
          wonRevenueTotal,
          pipelineValue,
          winRate,
          conversionLeadToQuote,
          conversionQuoteToWon,
        },
        leadsBySource,
        leadsByServiceType,
        recentLeads,
      };
    } catch {
      return this.meEmptyPayload(userId, role);
    }
  }

  private meEmptyPayload(userId: string, role: string) {
    return {
      updatedAt: new Date().toISOString(),
      user: { id: userId, name: '', role },
      kpis: {
        leadsNew: 0,
        leadsInTreatment: 0,
        leadsWon: 0,
        leadsLost: 0,
        totalLeads: 0,
        openTasks: 0,
        overdueTasks: 0,
        openQuotes: 0,
        quotesSent: 0,
        quotesApproved: 0,
        wonRevenueThisMonth: 0,
        wonRevenueTotal: 0,
        pipelineValue: 0,
        winRate: 0,
        conversionLeadToQuote: 0,
        conversionQuoteToWon: 0,
      },
      leadsBySource: [],
      leadsByServiceType: [],
      recentLeads: [],
    };
  }

  /** Safe JSON when Prisma schema is ahead of DB (missing columns / relations). */
  private managerEmptyPayload() {
    const now = new Date();
    const monthlyRevenueTarget = DashboardService.DEFAULT_MONTHLY_REVENUE_TARGET;
    return {
      updatedAt: now.toISOString(),
      config: { monthlyRevenueTarget },
      kpis: {
        monthlyRevenueTarget,
        wonRevenueThisMonth: 0,
        attainmentPct: 0,
        openPipelineValue: 0,
        pipelinePctOfTarget: 0,
        forecast: { best: 0, realistic: 0, worst: 0 },
        teamWinRate: 0,
      },
      leaderboard: [],
      charts: {
        pipelineStagesByRep: [],
        leadSourcesPie: [],
        quotaProgress: [],
        conversionFunnel: [
          { step: 'לידים', value: 0 },
          { step: 'הצעה נשלחה', value: 0 },
          { step: 'זכייה', value: 0 },
        ],
        customerSegments: [],
      },
      alerts: { agingDeals: [], inactiveLeads: [] },
      breakdowns: { leadsByServiceType: [], openProjects: [] },
      recentLeadsTaken: [],
      coreCounts: {
        leadsNew: 0,
        leadsInTreatment: 0,
        leadsWon: 0,
        leadsLost: 0,
        leadsNewThisQuarter: 0,
        leadsNewPrevQuarter: 0,
        leadsQuarterChangePct: null,
        tasksOpen: 0,
        tasksOverdue: 0,
        quotesOpenActive: 0,
        projectsOpen: 0,
        projectsInField: 0,
        reportsWaiting: 0,
      },
      reviews: { count: 0, avg: 0, satisfiedPct: null, list: [] },
      workingNowEmployees: [],
      assumptions: {
        monthlyRevenueTarget: 'Default 450,000 (settings unavailable in fallback path)',
        wonRevenueThisMonth: 'Fallback: apply DB migrations (P2022 schema drift)',
        pipeline: 'Sum of estimatedValue for opportunities not WON/LOST',
        winRate: 'Opportunities WON / (WON+LOST)',
        weeklyActivity: 'Count of leads updated this week with leadStatus FU_1/FU_2 (no meetings/events table yet)',
        inactivity: 'Lead.updatedAt older than 7 days (no activity log yet)',
      },
    };
  }
}

