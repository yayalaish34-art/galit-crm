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
        select: { rating: true, feedback: true, ratedAt: true, customerId: true, customerName: true, taskId: true },
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
    // צבעי הפילוח: **צבע קבוע לכל קטגוריה** (לא לפי דירוג/גודל הפרוסה). כך פרוסה של
    // "לקוח פרטי" תמיד ירוקה, "פוטנציאלי" ירוק-טורקיז, "חברה/קבלן" צהוב-זהב — בלי תלות
    // באיזה סיווג הכי גדול. הצבעים ממופים לפי התווית העברית (labelHe מטבלת הסיווגים).
    // כל קטגוריה שאינה במפה (כולל "אחר" והזנב הארוך) מקבלת אפור כהה ניטרלי.
    // משפחת ירוק→צהוב: הטווח הצר מאפשר עד שלושה גוונים נפרדים לעין, לכן שלוש קטגוריות
    // מרכזיות מקבלות גוון והשאר מתאחד ל"אחר" אפור.
    const SEGMENT_OTHER_COLOR = '#52514e'; // אפור כהה ניטרלי — "אחר" אינו קטגוריה, ונפרד מהגוונים
    const SEGMENT_COLOR_BY_LABEL: Record<string, string> = {
      'לקוח פרטי': '#008300',   // ירוק עמוק
      'לקוח פוטנציאלי': '#1baf7a', // ירוק-טורקיז
      'חברה / קבלן': '#eda100', // צהוב-זהב
    };
    const colorForSegment = (name: string): string => SEGMENT_COLOR_BY_LABEL[name] || SEGMENT_OTHER_COLOR;
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
    // שלוש הקטגוריות הגדולות מוצגות כפרוסות; כל השאר (זנב ארוך של סיווגים זניחים) מתאחדים
    // לפרוסת "אחר". הצבע נקבע לפי הקטגוריה (colorForSegment), לא לפי הדירוג.
    const headSegments = allSegments.slice(0, MAX_SEGMENT_SLICES);
    const tailTotal = allSegments.slice(MAX_SEGMENT_SLICES).reduce((sum, s) => sum + s.value, 0);
    const customerSegments = headSegments.map((s) => ({ ...s, color: colorForSegment(s.name) }));
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
    // פנייה שנדחתה (DISMISSED) אינה נספרת כליד — זהה לסינון במודאל leadsAnalytics.
    const countableLeads = leads.filter((l) => l.status !== 'DISMISSED');
    const leadsNewThisQuarter = countableLeads.filter((l) => l.createdAt >= thisQuarterStart).length;
    const leadsNewPrevQuarter = countableLeads.filter((l) => l.createdAt >= prevQuarterStart && l.createdAt < thisQuarterStart).length;
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
    // פירוט לרשימה שנפתחת בלחיצה — שם הלקוח, הדירוג, הסיבה, וכן העובד המטפל וסיווג הלקוח.
    const reviewsList = await this.enrichReviews(ratedReviews);

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
  /**
   * מנרמל ערך "מקור הגעה" גולמי (מהטופס / מיובא) לתווית עברית קנונית אחת.
   * ה-DB מכיל תערובת: קודים אנגליים ישנים (PHONE/FACEBOOK/…), ערכים עבריים
   * שהעובד בחר (פייסבוק/אתר/…), וערכי "אחר" חופשיים. הפונקציה מאחדת אותם
   * כדי שהפילוח יספור "פייסבוק" ו-FACEBOOK יחד. ערך ריק → "לא צוין".
   */
  private normalizeLeadSource(raw?: string | null): string {
    const s = (raw || '').trim();
    if (!s) return 'לא צוין';
    const map: Record<string, string> = {
      PHONE: 'טלפון', 'טלפון': 'טלפון',
      SITE: 'אתר', 'אתר': 'אתר', WEBSITE: 'אתר',
      WHATSAPP: 'וואטסאפ', 'וואטסאפ': 'וואטסאפ',
      FACEBOOK: 'פייסבוק', 'פייסבוק': 'פייסבוק',
      INSTAGRAM: 'אינסטגרם', 'אינסטגרם': 'אינסטגרם',
      TIKTOK: 'טיק טוק', 'טיק טוק': 'טיק טוק', 'טיקטוק': 'טיק טוק',
      GOOGLE: 'גוגל אדס', 'גוגל': 'גוגל אדס', 'גוגל אדס': 'גוגל אדס', 'גוגל אדוורדס': 'גוגל אדס',
      REFERRAL: 'המלצה', 'הפניה': 'המלצה', 'המלצה': 'המלצה',
      RETURNING_CUSTOMER: 'לקוח חוזר', CUSTOMER: 'לקוח חוזר', 'לקוח חוזר': 'לקוח חוזר',
      OTHER: 'אחר', 'אחר': 'אחר',
    };
    return map[s] || map[s.toUpperCase()] || s;
  }

  /**
   * מחלץ "מקור הגעה" מנושא/גוף מייל של IncomingLead — לטבלה אין עמודת source.
   * זהה ללוגיקת leadSourcePage בפרונט (dashboard/page.tsx), לפי סדר עדיפות:
   * 1) תווית מפורשת ("מקור: ...", "דף נחיתה: ...", "utm_source=...")
   * 2) URL מלא של אחד מאתרי גלית — דומיין + הנתיב הראשון
   * 3) שם דומיין galit-* כטקסט חופשי
   * ריק → הפילוח יסווג כ"לא צוין".
   */
  private extractSourceFromEmail(subject?: string | null, body?: string | null): string {
    const hay = `${subject || ''}\n${body || ''}`;
    const labelRe =
      /(?:^|\n)\s*(?:מקור(?:\s*הפנייה|\s*הליד)?|עמוד(?:\s*מקור)?|אתר|דף\s*נחיתה|landing\s*page|source|utm_source)\s*[:=：]\s*([^\n<>]+)/i;
    const lbl = hay.match(labelRe);
    if (lbl && lbl[1].trim()) {
      return lbl[1].trim().replace(/^https?:\/\//i, '').replace(/[.,;]\s*$/, '').slice(0, 80);
    }
    const url = hay.match(/https?:\/\/([a-z0-9.-]*galit[a-z0-9.-]*)(\/[a-z0-9\-_/]*)?/i);
    if (url) {
      const host = url[1].replace(/^www\./i, '');
      const firstSeg = (url[2] || '').split('/').filter(Boolean)[0] || '';
      return (firstSeg ? `${host}/${firstSeg}` : host).slice(0, 80);
    }
    const dom = hay.match(/\bgalit[a-z0-9-]*(?:\.co\.il|\.com|\.net)?\b/i);
    if (dom) return dom[0].replace(/^www\./i, '').slice(0, 80);
    return '';
  }

  /**
   * גבולות חלון הזמן לפי התקופה שנבחרה. מחזיר { start, prevStart } —
   * prevStart מתחיל את התקופה הקודמת (באורך זהה) להשוואת מגמה.
   *
   * 'quarter' = רבעון קלנדרי (1/1, 1/4, 1/7, 1/10) — זהה להגדרה בכרטיס
   * "לידים חדשים ברבעון" בדשבורד המנהל. בעבר זה היה 90 יום מתגלגלים, מה
   * שגרם לכך ש"חודש" (30 יום) יצא גדול מ"רבעון" באמצע רבעון קלנדרי.
   * שאר התקופות מתגלגלות: 'month'/'last30' (30 יום), 'half' (180), 'year' (365).
   */
  private leadPeriodWindow(period: string, now = new Date()) {
    const day = 24 * 60 * 60 * 1000;
    if (period === 'quarter') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qStartMonth, 1);
      const prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1); // JS מנרמל חודש שלילי לשנה הקודמת
      const spanDays = Math.max(1, Math.round((now.getTime() - start.getTime()) / day));
      return { start, prevStart, spanDays };
    }
    const spanDays = period === 'year' ? 365 : period === 'half' ? 180 : 30;
    const start = new Date(now.getTime() - spanDays * day);
    const prevStart = new Date(now.getTime() - 2 * spanDays * day);
    return { start, prevStart, spanDays };
  }

  /** צורת פריט ביקורת מועשר — כולל שם העובד המטפל וסיווג הלקוח (מעבר לנתוני הבסיס). */
  private rawRatedReviewShape = null as unknown as {
    rating: number | null;
    feedback: string | null;
    ratedAt: Date | null;
    customerId: string | null;
    customerName: string | null;
    taskId: string | null;
  };

  /**
   * מעשיר רשימת ReviewRequest שדורגו בשני שדות שלא נשמרים ברשומת הביקורת עצמה:
   *  - ownerName: העובד שטיפל — נגזר דרך taskId → task.ownerId → user.name. הביקורת נשלחת
   *    אוטומטית מיד אחרי שהדוח נשלח ללקוח (report-mail.service), אותו רגע שבו המשימה מסומנת
   *    DONE — כך שבעל המשימה הוא העובד ש"עשה את הלקוח" עבור ביקורת זו.
   *  - customerType/customerTypeLabel: סיווג הלקוח (Customer.type + תווית עברית מטבלת הסיווגים).
   * best-effort: אם ה-join נכשל, מחזירים את הרשימה עם ownerName=null/customerType=null.
   */
  private async enrichReviews(
    reviews: Array<typeof this.rawRatedReviewShape>,
  ): Promise<
    Array<{
      customerId: string | null;
      customerName: string;
      rating: number;
      reason: string | null;
      ratedAt: string | null;
      ownerName: string | null;
      customerType: string | null;
      customerTypeLabel: string | null;
    }>
  > {
    const valid = reviews.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5);

    // אוספים מזהי משימות ולקוחות ייחודיים לשליפה מרוכזת (בלי N+1).
    const taskIds = Array.from(new Set(valid.map((r) => r.taskId).filter((v): v is string => !!v)));
    const customerIds = Array.from(new Set(valid.map((r) => r.customerId).filter((v): v is string => !!v)));

    const [tasks, customers, classifications] = await Promise.all([
      taskIds.length
        ? this.prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, owner: { select: { name: true } } },
          })
        : Promise.resolve([] as Array<{ id: string; owner: { name: string | null } | null }>),
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, type: true },
          })
        : Promise.resolve([] as Array<{ id: string; type: string | null }>),
      this.prisma.customerClassification.findMany({ select: { code: true, labelHe: true } }),
    ]);

    const ownerByTask = new Map(tasks.map((t) => [t.id, t.owner?.name || null]));
    const typeByCustomer = new Map(customers.map((c) => [c.id, c.type || null]));
    const labelByCode = new Map(
      (classifications as Array<{ code: string; labelHe: string }>).map((c) => [c.code, c.labelHe]),
    );

    return valid.map((r) => {
      const type = r.customerId ? typeByCustomer.get(r.customerId) || null : null;
      return {
        customerId: r.customerId ?? null,
        customerName: r.customerName || 'לקוח',
        rating: Number(r.rating),
        reason: (r.feedback || '').trim() || null,
        ratedAt: r.ratedAt ? r.ratedAt.toISOString() : null,
        ownerName: r.taskId ? ownerByTask.get(r.taskId) || null : null,
        customerType: type,
        customerTypeLabel: type ? labelByCode.get(type) || type : null,
      };
    });
  }

  /**
   * אנליטיקת לידים למסך שנפתח בלחיצה על כרטיס "לידים חדשים" בדשבורד מנהל.
   * מקור האמת = IncomingLead בלבד (פניות שנכנסו מהמייל) — אותו מקור כמו כרטיס
   * "לידים חדשים ברבעון", כדי ששני המספרים יהיו עקביים. מסונן לפי createdAt
   * בתקופה הנבחרת, ללא פניות שנדחו (DISMISSED). "מקור הגעה" מחולץ מגוף המייל.
   *
   * מחזיר:
   *  - period, range: התקופה בפועל.
   *  - stats: נתונים קרים (סה"כ, ממוצע ליום, שינוי מול תקופה קודמת, המקור המוביל, #מקורות).
   *  - bySource: פילוח לפי מקור הגעה מנורמל (שם, כמות, אחוז), ממוין יורד.
   *  - timeSeries: סדרת-זמן לפי דלי מתאים (יום/שבוע/חודש) לגרף מגמה.
   *  - byBroker: פילוח חברות מפנות (referralCompany) — למקרה "המלצה/אחר".
   */
  async leadsAnalytics(user?: { id?: string; role?: string }, periodRaw?: string) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException();
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    const period = ['month', 'quarter', 'half', 'year', 'last30'].includes((periodRaw || '').toLowerCase())
      ? (periodRaw as string).toLowerCase()
      : 'last30';
    const now = new Date();
    const { start, prevStart, spanDays } = this.leadPeriodWindow(period, now);

    try {
      // מקור האמת היחיד = IncomingLead (פניות שנכנסו מהמייל) — זהה למקור של כרטיס
      // "לידים חדשים ברבעון" בדשבורד המנהל, כדי שהכרטיס והמודאל שנפתח בלחיצה עליו
      // יספרו בדיוק את אותו הדבר. בעבר נספרו כאן Customer+Lead, מה שהחזיר מספר גדול
      // יותר מהרבעוני (85 מול 47) — שילוב בלתי-אפשרי שנבע משתי טבלאות שונות.
      // DISMISSED (פנייה שנדחתה) לא נספרת כליד.
      const incoming = await this.prisma.incomingLead.findMany({
        where: { createdAt: { gte: prevStart }, status: { not: 'DISMISSED' } },
        select: { id: true, subject: true, body: true, createdAt: true },
      });

      // ל-IncomingLead אין עמודת "מקור הגעה" — הוא מחולץ מהנושא/גוף המייל
      // (תווית "מקור:"/"utm_source="/דומיין גלית), בדיוק כמו בכרטיס הליד בפרונט.
      type Row = { source?: string | null; createdAt: Date; referralCompany?: string | null };
      const allRows: Row[] = incoming.map((l) => ({
        source: this.extractSourceFromEmail(l.subject, l.body),
        createdAt: l.createdAt,
        referralCompany: null as string | null,
      }));
      const inWindow = allRows.filter((r) => r.createdAt >= start);
      const inPrevWindow = allRows.filter((r) => r.createdAt >= prevStart && r.createdAt < start);

      // ── פילוח לפי מקור הגעה מנורמל ──
      const sourceMap = new Map<string, number>();
      for (const r of inWindow) {
        const key = this.normalizeLeadSource(r.source);
        sourceMap.set(key, (sourceMap.get(key) || 0) + 1);
      }
      const total = inWindow.length;
      const bySource = Array.from(sourceMap.entries())
        .map(([name, value]) => ({ name, value, pct: total ? Math.round((value / total) * 1000) / 10 : 0 }))
        .sort((a, b) => b.value - a.value);

      // ── פילוח חברות מפנות (הדס/גינדי/אחר) — נספר רק כשיש referralCompany ──
      const brokerMap = new Map<string, number>();
      for (const r of inWindow) {
        const b = (r.referralCompany || '').trim();
        if (b) brokerMap.set(b, (brokerMap.get(b) || 0) + 1);
      }
      const byBroker = Array.from(brokerMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // ── סדרת-זמן: דלי לפי אורך התקופה (יום ל-30/90, שבוע ל-180, חודש לשנה) ──
      const bucketMode = spanDays <= 90 ? 'day' : spanDays <= 180 ? 'week' : 'month';
      const tsMap = new Map<string, number>();
      const labelFor = (d: Date): string => {
        if (bucketMode === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (bucketMode === 'week') {
          const ws = startOfWeek(d);
          return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      for (const r of inWindow) {
        const k = labelFor(r.createdAt);
        tsMap.set(k, (tsMap.get(k) || 0) + 1);
      }
      const timeSeries = Array.from(tsMap.entries())
        .map(([bucket, value]) => ({ bucket, value }))
        .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

      // ── נתונים קרים ──
      const prevTotal = inPrevWindow.length;
      const changePct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
      const avgPerDay = spanDays ? Math.round((total / spanDays) * 10) / 10 : 0;
      const topSource = bySource[0] || null;
      const specifiedCount = total - (sourceMap.get('לא צוין') || 0);

      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays, bucketMode },
        stats: {
          total,
          prevTotal,
          changePct,
          avgPerDay,
          sourcesCount: bySource.filter((s) => s.name !== 'לא צוין').length,
          topSourceName: topSource ? topSource.name : null,
          topSourceValue: topSource ? topSource.value : 0,
          specifiedPct: total ? Math.round((specifiedCount / total) * 100) : 0,
        },
        bySource,
        byBroker,
        timeSeries,
      };
    } catch (e) {
      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays, bucketMode: 'day' },
        stats: { total: 0, prevTotal: 0, changePct: null, avgPerDay: 0, sourcesCount: 0, topSourceName: null, topSourceValue: 0, specifiedPct: 0 },
        bySource: [],
        byBroker: [],
        timeSeries: [],
        error: 'unavailable',
      };
    }
  }

  /**
   * אנליטיקת ביקורות לקוחות למודאל שנפתח בלחיצה על כרטיס "שביעות רצון" בדשבורד המנהל.
   * מקור האמת = ReviewRequest שדורגו בפועל (rating לא-null), מסוננים לפי ratedAt בתקופה הנבחרת.
   * period=last30(ברירת מחדל)|quarter|half|year.
   *
   * מחזיר:
   *  - period, range: התקופה בפועל.
   *  - stats: סה"כ ביקורות, ממוצע כוכבים, CSAT (% דירוג 4-5), ושינוי CSAT מול התקופה הקודמת.
   *  - byType: פילוח לפי סיווג לקוח (כמות + ממוצע), לסינון/תצוגה.
   *  - byOwner: פילוח לפי העובד המטפל (כמות + ממוצע).
   *  - list: הרשימה המלאה המועשרת (עובד + סיווג לכל ביקורת) — הפרונט מסנן לפי סיווג בצד הלקוח.
   */
  async reviewsAnalytics(user?: { id?: string; role?: string }, periodRaw?: string) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException();
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    const period = ['quarter', 'half', 'year', 'last30'].includes((periodRaw || '').toLowerCase())
      ? (periodRaw as string).toLowerCase()
      : 'last30';
    const now = new Date();
    const { start, prevStart, spanDays } = this.leadPeriodWindow(period, now);

    try {
      // כל הביקורות שדורגו מ-prevStart ואילך (התקופה הנוכחית + הקודמת, למגמת CSAT).
      const rated = await this.prisma.reviewRequest.findMany({
        where: { rating: { not: null }, ratedAt: { gte: prevStart } },
        select: { rating: true, feedback: true, ratedAt: true, customerId: true, customerName: true, taskId: true },
        orderBy: [{ ratedAt: 'desc' }],
      });

      const inWindow = rated.filter((r) => r.ratedAt && r.ratedAt >= start);
      const inPrevWindow = rated.filter((r) => r.ratedAt && r.ratedAt >= prevStart && r.ratedAt < start);

      const list = await this.enrichReviews(inWindow);

      const ratings = list.map((r) => r.rating);
      const count = ratings.length;
      const avg = count ? Math.round((ratings.reduce((a, n) => a + n, 0) / count) * 10) / 10 : 0;
      const csat = count ? Math.round((ratings.filter((n) => n >= 4).length / count) * 100) : null;

      const prevRatings = inPrevWindow.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
      const prevCsat = prevRatings.length
        ? Math.round((prevRatings.filter((n) => n >= 4).length / prevRatings.length) * 100)
        : null;
      const csatChangePct = csat != null && prevCsat != null ? csat - prevCsat : null;

      // ── פילוח לפי סיווג לקוח (כמות + ממוצע כוכבים) ──
      const typeAgg = new Map<string, { code: string | null; sum: number; n: number }>();
      for (const r of list) {
        const label = r.customerTypeLabel || 'ללא סיווג';
        const cur = typeAgg.get(label) || { code: r.customerType, sum: 0, n: 0 };
        cur.sum += r.rating;
        cur.n += 1;
        typeAgg.set(label, cur);
      }
      const byType = Array.from(typeAgg.entries())
        .map(([name, v]) => ({ name, code: v.code, value: v.n, avg: Math.round((v.sum / v.n) * 10) / 10 }))
        .sort((a, b) => b.value - a.value);

      // ── פילוח לפי העובד המטפל (כמות + ממוצע כוכבים) ──
      const ownerAgg = new Map<string, { sum: number; n: number }>();
      for (const r of list) {
        const name = r.ownerName || 'לא ידוע';
        const cur = ownerAgg.get(name) || { sum: 0, n: 0 };
        cur.sum += r.rating;
        cur.n += 1;
        ownerAgg.set(name, cur);
      }
      const byOwner = Array.from(ownerAgg.entries())
        .map(([name, v]) => ({ name, value: v.n, avg: Math.round((v.sum / v.n) * 10) / 10 }))
        .sort((a, b) => b.value - a.value);

      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays },
        stats: { count, avg, csat, prevCsat, csatChangePct },
        byType,
        byOwner,
        list,
      };
    } catch (e) {
      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays },
        stats: { count: 0, avg: 0, csat: null, prevCsat: null, csatChangePct: null },
        byType: [],
        byOwner: [],
        list: [],
        error: 'unavailable',
      };
    }
  }

  /**
   * אנליטיקת הכנסות למסך שנפתח בלחיצה על כרטיס "הכנסה" בדשבורד המנהל.
   * "הכנסה" = הצעות מחיר שאושרו/נחתמו (APPROVED/SIGNED) — כל הצעה שמהנדס הוציא
   * וסומנה כמאושרת. הסכום נלקח מ-Quote.totalAmount (נפילה ל-amount) — אותו סכום
   * שממוזג למסמך/מייל, אך מהשדה המובנה (אמין יותר מפירסור טקסט המייל).
   * מסונן לפי updatedAt (תאריך הסגירה בפועל — אין שדה won-date ייעודי).
   *
   * מחזיר:
   *  - stats: סה"כ הכנסה, מס' הזמנות, ממוצע להזמנה, שינוי מול תקופה קודמת.
   *  - byEngineer: פילוח לפי מהנדס/נציג (opportunity.assignedUserId), ממוין יורד.
   *  - timeSeries: הכנסה לאורך זמן (דלי יום/שבוע/חודש), לגרף מגמה.
   *  - orders: רשימת ההזמנות (הצעות מאושרות) לתצוגת "הכנסות לפי הזמנות".
   */
  async revenueAnalytics(user?: { id?: string; role?: string }, periodRaw?: string) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException();
    if (role !== 'ADMIN' && role !== 'MANAGER') throw new ForbiddenException();

    const period = ['month', 'quarter', 'half', 'year', 'last30'].includes((periodRaw || '').toLowerCase())
      ? (periodRaw as string).toLowerCase()
      : 'last30';
    const now = new Date();
    const { start, prevStart, spanDays } = this.leadPeriodWindow(period, now);

    try {
      // כל המשתמשים (למיפוי מזהה→שם מהנדס) + הצעות מאושרות/נחתמות מהתקופה + התקופה הקודמת.
      const [users, quotes] = await Promise.all([
        this.prisma.user.findMany({ select: { id: true, name: true } }),
        this.prisma.quote.findMany({
          where: {
            status: { in: [QuoteStatus.APPROVED, (QuoteStatus as any).SIGNED] },
            updatedAt: { gte: prevStart },
          },
          include: {
            customer: { select: { id: true, name: true } },
            opportunity: { select: { assignedUserId: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
      ]);
      const userName = new Map<string, string>(users.map((u) => [u.id, u.name]));

      const amountOf = (q: any) => Number(q.totalAmount ?? q.amount ?? 0);
      const inWindow = quotes.filter((q) => q.updatedAt >= start);
      const inPrevWindow = quotes.filter((q) => q.updatedAt >= prevStart && q.updatedAt < start);

      const total = inWindow.reduce((a, q) => a + amountOf(q), 0);
      const prevTotal = inPrevWindow.reduce((a, q) => a + amountOf(q), 0);
      const changePct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
      const ordersCount = inWindow.length;
      const avgPerOrder = ordersCount ? Math.round(total / ordersCount) : 0;

      // ── פילוח לפי מהנדס/נציג (עקבי עם הלידרבורד: opportunity.assignedUserId) ──
      const engMap = new Map<string, { revenue: number; count: number }>();
      for (const q of inWindow) {
        const uid = q.opportunity?.assignedUserId || '';
        const name = (uid && userName.get(uid)) || 'לא משויך';
        const cur = engMap.get(name) || { revenue: 0, count: 0 };
        cur.revenue += amountOf(q);
        cur.count += 1;
        engMap.set(name, cur);
      }
      const byEngineer = Array.from(engMap.entries())
        .map(([name, v]) => ({ name, revenue: Math.round(v.revenue), count: v.count, pct: total ? Math.round((v.revenue / total) * 1000) / 10 : 0 }))
        .sort((a, b) => b.revenue - a.revenue);

      // ── סדרת-זמן: דלי לפי אורך התקופה (יום/שבוע/חודש), סכום ההכנסה בכל דלי ──
      const bucketMode = spanDays <= 90 ? 'day' : spanDays <= 180 ? 'week' : 'month';
      const labelFor = (d: Date): string => {
        if (bucketMode === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (bucketMode === 'week') {
          const ws = startOfWeek(d);
          return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const tsMap = new Map<string, number>();
      for (const q of inWindow) {
        const k = labelFor(q.updatedAt);
        tsMap.set(k, (tsMap.get(k) || 0) + amountOf(q));
      }
      const timeSeries = Array.from(tsMap.entries())
        .map(([bucket, value]) => ({ bucket, value: Math.round(value) }))
        .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

      // ── רשימת ההזמנות (הצעות מאושרות) — לתצוגת "הכנסות לפי הזמנות" ──
      const orders = inWindow.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber || q.orderReferenceNumber || '—',
        customerName: q.customer?.name || q.customerName || '—',
        engineerName: (q.opportunity?.assignedUserId && userName.get(q.opportunity.assignedUserId)) || q.salesRepresentativeName || q.executorName || 'לא משויך',
        amount: Math.round(amountOf(q)),
        status: q.status,
        date: q.updatedAt.toISOString(),
      }));

      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays, bucketMode },
        stats: { total: Math.round(total), prevTotal: Math.round(prevTotal), changePct, ordersCount, avgPerOrder },
        byEngineer,
        timeSeries,
        orders,
      };
    } catch (e) {
      return {
        updatedAt: now.toISOString(),
        period,
        range: { start: start.toISOString(), end: now.toISOString(), spanDays, bucketMode: 'day' },
        stats: { total: 0, prevTotal: 0, changePct: null, ordersCount: 0, avgPerOrder: 0 },
        byEngineer: [],
        timeSeries: [],
        orders: [],
        error: 'unavailable',
      };
    }
  }

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

