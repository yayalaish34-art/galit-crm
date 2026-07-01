import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  UserStatus,
  ProjectStatus,
  LeadStage,
  LeadStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = [
    {
      email: 'admin@galit.local',
      name: 'Admin',
      role: UserRole.ADMIN,
    },
    {
      email: 'billing@galit.local',
      name: 'Billing',
      role: UserRole.BILLING,
    },
    {
      email: 'technician@galit.local',
      name: 'Technician',
      role: UserRole.TECHNICIAN,
    },
    {
      email: 'sales@galit.local',
      name: 'Sales',
      role: UserRole.SALES,
    },
    {
      email: 'manager@galit.local',
      name: 'Manager',
      role: UserRole.MANAGER,
    },
    {
      email: 'expert@galit.local',
      name: 'Expert',
      role: UserRole.EXPERT,
    },
  ] as const;

  const passwordPlain = '1234';
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        password: hashedPassword,
        role: user.role,
        status: UserStatus.ACTIVE,
      },
      create: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        status: UserStatus.ACTIVE,
      },
    });
  }

  const tech = await prisma.user.findFirst({ where: { role: UserRole.TECHNICIAN } });
  const projects = [
    { id: 'P-3001', name: 'בדיקת קרינה - אתר עזריאלי', client: 'אפקון', status: ProjectStatus.SCHEDULED, progress: 72, city: 'תל אביב', dueDate: new Date('2026-03-17'), siteVisitDate: new Date('2026-03-17'), siteVisitTime: '09:00', assignedTechnicianId: tech?.id ?? null },
    { id: 'P-3002', name: 'בדיקת אקוסטיקה - מגדל חיפה', client: 'שיכון ובינוי', status: ProjectStatus.ON_THE_WAY, progress: 35, city: 'חיפה', dueDate: new Date('2026-03-22'), siteVisitDate: new Date('2026-03-22'), siteVisitTime: '10:30', assignedTechnicianId: tech?.id ?? null },
    { id: 'P-3003', name: 'בדיקת ראדון - בית פרטי', client: 'שרה לוי', status: ProjectStatus.SCHEDULED, progress: 10, city: 'רעננה', dueDate: new Date('2026-03-28'), siteVisitDate: new Date('2026-03-28'), siteVisitTime: '14:00', assignedTechnicianId: null },
  ];
  for (const p of projects) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: { name: p.name, client: p.client, status: p.status, progress: p.progress, city: p.city, dueDate: p.dueDate, siteVisitDate: p.siteVisitDate, siteVisitTime: p.siteVisitTime, assignedTechnicianId: p.assignedTechnicianId },
      create: p,
    });
  }

  const salesUsers = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.EXPERT] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const assigneeIds = salesUsers.map((u) => u.id);
  const pickAssignee = (idx: number) => (assigneeIds.length ? assigneeIds[idx % assigneeIds.length] : null);

  const customersDemo = [
    { name: 'יואב כהן', type: 'PRIVATE', contactName: 'יואב כהן', phone: '052-7312048', email: 'yoav.cohen.home@gmail.com', city: 'רעננה', services: ['קרינה', 'ראדון'], notes: 'בדיקת קרינה לפני רכישת בית פרטי בשכונה ותיקה.' },
    { name: 'ענבל לוי', type: 'PRIVATE', contactName: 'ענבל לוי', phone: '054-9021143', email: 'inbal.levi1987@gmail.com', city: 'גבעתיים', services: ['אקוסטיקה / רעש'], notes: 'בדיקת רעש למערכת מיזוג בדירה חדשה.' },
    { name: 'קבוצת שקד הנדסה בע"מ', type: 'COMPANY', contactName: 'רועי שרון', phone: '050-6674421', email: 'roi.sharon@shaked-eng.co.il', city: 'פתח תקווה', services: ['אקוסטיקה / רעש', 'דוח אקוסטי'], notes: 'הכנת דוח אקוסטי להיתר בנייה בפרויקט מגורים.' },
    { name: 'אורן בנייה ויזמות', type: 'COMPANY', contactName: 'מורן אורן', phone: '052-4819027', email: 'moran@orenyazamut.co.il', city: 'אשדוד', services: ['אסבסט', 'דיגום סביבתי'], notes: 'סקר אסבסט לפני פירוק גג במבנה מסחרי.' },
    { name: 'איילת גת אדריכלות', type: 'COMPANY', contactName: 'איילת גת', phone: '053-3301188', email: 'ayelet@agat-arch.co.il', city: 'תל אביב', services: ['אקוסטיקה / רעש', 'איכות אוויר'], notes: 'ליווי אקוסטי ואיכות אוויר לתכנון משרדים.' },
    { name: 'בית ספר אורנים', type: 'PUBLIC', contactName: 'דנה מלמד', phone: '052-6047730', email: 'dana.melamed@oranim-school.org.il', city: 'כפר סבא', services: ['בדיקות סביבתיות', 'איכות אוויר'], notes: 'בדיקות סביבתיות תקופתיות במבני חינוך.' },
    { name: 'עיריית נס ציונה', type: 'PUBLIC', contactName: 'אילן פרץ', phone: '050-2290114', email: 'ilan.peretz@nsz.muni.il', city: 'נס ציונה', services: ['דיגום סביבתי', 'אקוסטיקה / רעש'], notes: 'בדיקות רעש סביב מוקדי תנועה ותלונות תושבים.' },
    { name: 'מרכז רפואי גליל ים', type: 'PUBLIC', contactName: 'סיון כץ', phone: '052-1884039', email: 'sivan.katz@galilyam-med.org.il', city: 'הרצליה', services: ['מיגון קרינה', 'קרינה'], notes: 'מדידות קרינה ומיגון בחדרי ציוד רפואי.' },
    { name: 'אלמוג ניהול נכסים', type: 'COMPANY', contactName: 'טל אלמוג', phone: '054-5112293', email: 'tal@almog-management.co.il', city: 'חולון', services: ['ראדון', 'איכות אוויר'], notes: 'בדיקות ראדון ואיכות אוויר בבנייני מגורים.' },
    { name: 'מפעלי רם פלסט בע"מ', type: 'COMPANY', contactName: 'ירון בראון', phone: '050-9031126', email: 'yaron@ramplast.co.il', city: 'קריית גת', services: ['איכות אוויר', 'דיגום סביבתי'], notes: 'ניטור איכות אוויר תעסוקתי בקווי ייצור.' },
    { name: 'אוסם הנדסה תשתיות', type: 'COMPANY', contactName: 'ניר שפירא', phone: '052-7118934', email: 'nir.shapira@osem-infra.co.il', city: 'נתניה', services: ['קרינה', 'מיגון קרינה'], notes: 'מיפוי קרינה בסמוך לחדר שנאים ותכנון מיגון.' },
    { name: 'לירון כהן', type: 'PRIVATE', contactName: 'לירון כהן', phone: '054-3702119', email: 'liron.kohen.home@gmail.com', city: 'מודיעין', services: ['ראדון', 'קרינה'], notes: 'בדיקת ראדון לפני אכלוס בית קרקע.' },
    { name: 'שמשון פרויקטים בע"מ', type: 'COMPANY', contactName: 'עדי שמש', phone: '053-7819052', email: 'adi@shimshon-projects.co.il', city: 'באר שבע', services: ['אסבסט', 'איכות אוויר'], notes: 'ליווי סביבתי לפרויקט תמ"א בשכונה ותיקה.' },
    { name: 'תיכון גולדה', type: 'PUBLIC', contactName: 'מיכל רוט', phone: '050-4441932', email: 'michal.rot@golda-high.edu.il', city: 'ירושלים', services: ['אקוסטיקה / רעש', 'בדיקות סביבתיות'], notes: 'בדיקות רעש בכיתות ומדידת הדהוד.' },
    { name: 'אלון מערכות מיזוג', type: 'COMPANY', contactName: 'ארז אלון', phone: '052-9183401', email: 'erez@alon-hvac.co.il', city: 'רמת גן', services: ['אקוסטיקה / רעש'], notes: 'בדיקות רעש למערכות מיזוג בפרויקט משרדים.' },
    { name: 'בית אבן יזמות', type: 'COMPANY', contactName: 'נועה דקל', phone: '054-1297740', email: 'noa@beit-even.co.il', city: 'חדרה', services: ['דוח אקוסטי', 'דיגום סביבתי'], notes: 'דרישות סביבתיות להיתר בנייה במגרש מורכב.' },
    { name: 'אחוזת כרמל ניהול', type: 'COMPANY', contactName: 'גיא בן עטר', phone: '052-6003417', email: 'guy@carmel-estate.co.il', city: 'חיפה', services: ['איכות אוויר', 'עובש'], notes: 'דיגום עובש ואיכות אוויר בבניין מגורים.' },
    { name: 'מועצה מקומית קדימה', type: 'PUBLIC', contactName: 'קרן ברק', phone: '050-6710825', email: 'keren.barak@kadima.muni.il', city: 'קדימה', services: ['דיגום סביבתי', 'אסבסט'], notes: 'בדיקות אסבסט במבני ציבור ישנים.' },
    { name: 'אופק יזמות ובנייה', type: 'COMPANY', contactName: 'חן רז', phone: '053-2299804', email: 'chen@ofek-build.co.il', city: 'אשקלון', services: ['קרינה', 'מיגון קרינה'], notes: 'בדיקת קרינה סמוך לקו מתח בפרויקט מגורים.' },
    { name: 'מכללת עתיד השרון', type: 'PUBLIC', contactName: 'נעמה צור', phone: '052-4993331', email: 'naama.tzur@atid-college.ac.il', city: 'הוד השרון', services: ['איכות אוויר', 'בדיקות סביבתיות'], notes: 'בדיקות איכות אוויר במעבדות לימוד.' },
    { name: 'דניאל פרטי', type: 'PRIVATE', contactName: 'דניאל בר', phone: '054-8081175', email: 'daniel.bar.home@gmail.com', city: 'ראשון לציון', services: ['אסבסט', 'קרינה'], notes: 'סקר אסבסט וקרינה לפני שיפוץ בית פרטי.' },
    { name: 'רימון אדריכלים', type: 'COMPANY', contactName: 'שקד רימון', phone: '050-3007148', email: 'shaked@rimon-arch.co.il', city: 'נהריה', services: ['דוח אקוסטי', 'ראדון'], notes: 'דרישות אקוסטיות וראדון לבית ספר חדש.' },
    { name: 'טכנו-מד תעשיות', type: 'COMPANY', contactName: 'אבי בן שושן', phone: '052-9152086', email: 'avi@technomed.co.il', city: 'יבנה', services: ['קרינה', 'איכות אוויר'], notes: 'בדיקות קרינה סביב ציוד תעשייתי ופליטות.' },
    { name: 'הדר ניהול פרויקטים', type: 'COMPANY', contactName: 'רוני הדר', phone: '053-1742281', email: 'roni@hadar-pm.co.il', city: 'תל אביב', services: ['ליווי סביבתי', 'דיגום סביבתי'], notes: 'ליווי סביבתי מלא לפרויקט בנייה רב-שנתי.' },
    { name: 'יפעת גלילי', type: 'PRIVATE', contactName: 'יפעת גלילי', phone: '052-4117609', email: 'yifat.galili@gmail.com', city: 'פרדס חנה', services: ['ראדון', 'איכות אוויר'], notes: 'בדיקות ראדון ועובש לפני מעבר לבית.' },
  ] as const;

  let createdCustomers = 0;
  for (const c of customersDemo) {
    const exists = await prisma.customer.findFirst({
      where: {
        OR: [{ email: c.email }, { phone: c.phone }, { name: c.name }],
      },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.customer.create({
      data: {
        name: c.name,
        type: c.type,
        contactName: c.contactName,
        phone: c.phone,
        email: c.email,
        city: c.city,
        status: 'ACTIVE',
        services: [...c.services],
        notes: c.notes,
      },
    });
    createdCustomers += 1;
  }

  const leadsDemo = [
    { firstName: 'תומר', lastName: 'מזרחי', fullName: 'תומר מזרחי', phone: '052-7001181', email: 'tomer.mizrahi@gmail.com', company: 'לקוח פרטי', source: 'אתר', city: 'רחובות', site: 'רחובות, שכונת המדע', service: 'קרינה', serviceType: 'בדיקת קרינה לפני קניית בית', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'רוצה בדיקה מלאה לפני חתימה על חוזה.' },
    { firstName: 'ליאת', lastName: 'שמש', fullName: 'ליאת שמש', phone: '054-2203914', email: 'liat.shemesh@gmail.com', company: 'פרטי', source: 'פייסבוק', city: 'רמת השרון', site: 'רחוב הבנים 12', service: 'ראדון', serviceType: 'בדיקת ראדון בבית פרטי', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'חשש מערכי ראדון במרתף.' },
    { firstName: 'עומר', lastName: 'פרנק', fullName: 'עומר פרנק', phone: '050-6221417', email: 'omer@frank-build.co.il', company: 'פרנק בנייה', source: 'קבלן', city: 'נתיבות', site: 'אתר בנייה שכונת נווה', service: 'אסבסט', serviceType: 'סקר אסבסט לפני פירוק גג', stage: LeadStage.QUOTE_SENT, leadStatus: LeadStatus.QUOTE_SENT, notes: 'מבקש הצעת מחיר דחופה לשבוע הקרוב.' },
    { firstName: 'שירי', lastName: 'עמית', fullName: 'שירי עמית', phone: '052-3098842', email: 'shiri.amit@amityazamut.co.il', company: 'עמית יזמות', source: 'גוגל', city: 'חולון', site: 'פרויקט מגורים חדש', service: 'אקוסטיקה / רעש', serviceType: 'דוח אקוסטי להיתר בנייה', stage: LeadStage.NEGOTIATION, leadStatus: LeadStatus.NEGOTIATION, notes: 'צריכה עמידה מלאה בדרישות ועדה.' },
    { firstName: 'אביב', lastName: 'גרין', fullName: 'אביב גרין', phone: '053-7719280', email: 'aviv.green@greenoffices.co.il', company: 'גרין אופיס', source: 'וואטסאפ', city: 'תל אביב', site: 'מגדל משרדים', service: 'איכות אוויר', serviceType: 'בדיקות איכות אוויר במשרד', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'יש תלונות עובדים על ריחות ועייפות.' },
    { firstName: 'מיכל', lastName: 'אביטל', fullName: 'מיכל אביטל', phone: '054-1189030', email: 'michal.avital@gmail.com', company: 'לקוחה פרטית', source: 'המלצה', city: 'מודיעין', site: 'בית פרטי', service: 'דיגום סביבתי', serviceType: 'דיגום עובש בדירה', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.FU_1, notes: 'מבקשת דיגום ותיעוד עבור ביטוח.' },
    { firstName: 'אילן', lastName: 'דיין', fullName: 'אילן דיין', phone: '050-2016775', email: 'ilan.dayan@urban-noise.co.il', company: 'אורבן נויז', source: 'גוגל', city: 'בת ים', site: 'בניין מגורים', service: 'אקוסטיקה / רעש', serviceType: 'בדיקות רעש למערכת מיזוג', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.FU_2, notes: 'רעש רק בשעות ערב, נדרש תיאום מדידה.' },
    { firstName: 'דניאלה', lastName: 'שור', fullName: 'דניאלה שור', phone: '052-9911134', email: 'daniela.shor@municipal.org.il', company: 'עיריית הוד השרון', source: 'עירייה', city: 'הוד השרון', site: 'בית ספר עירוני א', service: 'בדיקות למוסדות', serviceType: 'בדיקות סביבתיות לבית ספר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'נדרש דוח מסודר לרשות המקומית.' },
    { firstName: 'קובי', lastName: 'זיו', fullName: 'קובי זיו', phone: '053-2884201', email: 'kobi@ziv-electro.co.il', company: 'זיו אלקטרו', source: 'קבלן', city: 'ראש העין', site: 'חדר חשמל מרכזי', service: 'מיגון קרינה', serviceType: 'מיגון קרינה לחדר חשמל', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'מבקש פתרון מיגון לפני אכלוס.' },
    { firstName: 'שרון', lastName: 'ממן', fullName: 'שרון ממן', phone: '050-8114722', email: 'sharon.maman@gmail.com', company: 'פרטי', source: 'אתר', city: 'קריית אונו', site: 'רחוב קדומים 7', service: 'קרינה', serviceType: 'בדיקות קרינה סמוך לקו מתח', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'דאגה בעקבות מדידות פרטיות מהאינטרנט.' },
    { firstName: 'יוסי', lastName: 'הראל', fullName: 'יוסי הראל', phone: '054-7712019', email: 'yossi.harel@harel-construction.co.il', company: 'הראל בנייה', source: 'קבלן', city: 'אשקלון', site: 'פרויקט מגדלי חוף', service: 'ליווי סביבתי', serviceType: 'ליווי סביבתי לפרויקט בנייה', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.QUOTE_SENT, notes: 'רוצה מעטפת מלאה לאורך הפרויקט.' },
    { firstName: 'הילה', lastName: 'סלע', fullName: 'הילה סלע', phone: '052-1493007', email: 'hila.sela@schoolnet.edu.il', company: 'קריית חינוך סלע', source: 'המלצה', city: 'רמלה', site: 'מבנה חטיבה', service: 'אקוסטיקה / רעש', serviceType: 'בדיקות רעש לכיתות לימוד', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.FU_1, notes: 'נדרש דוח לפני פתיחת שנת הלימודים.' },
    { firstName: 'נעם', lastName: 'קליין', fullName: 'נעם קליין', phone: '053-4776102', email: 'noam.klein@arcdesign.co.il', company: 'ARC Design', source: 'גוגל', city: 'חיפה', site: 'פרויקט מגורים יוקרתי', service: 'אקוסטיקה / רעש', serviceType: 'דוח אקוסטי להיתר', stage: LeadStage.QUOTE_SENT, leadStatus: LeadStatus.QUOTE_SENT, notes: 'הצעה נשלחה, ממתינים לאישור.' },
    { firstName: 'ענת', lastName: 'ברק', fullName: 'ענת ברק', phone: '052-6175510', email: 'anat.barak@gmail.com', company: 'פרטי', source: 'פייסבוק', city: 'אבן יהודה', site: 'בית קרקע', service: 'ראדון', serviceType: 'בדיקת ראדון לאחר שיפוץ', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'שואלת גם על איכות אוויר בחדרי ילדים.' },
    { firstName: 'רון', lastName: 'יעקובי', fullName: 'רון יעקובי', phone: '054-8440923', email: 'ron@yaakovifactory.co.il', company: 'יעקובי תעשיות', source: 'וואטסאפ', city: 'עפולה', site: 'מפעל אזור תעשייה', service: 'איכות אוויר', serviceType: 'ניטור איכות אוויר במפעל', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'נדרש דו"ח עבור ממונה בטיחות.' },
    { firstName: 'שקד', lastName: 'לב', fullName: 'שקד לב', phone: '050-5667298', email: 'shaked.lev@publicworks.gov.il', company: 'אגף מבני ציבור', source: 'עירייה', city: 'באר יעקב', site: 'מבנה ציבור ותיק', service: 'אסבסט', serviceType: 'בדיקות אסבסט במבנה ציבור', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'יש צורך בסקר לפני עבודות פירוק.' },
    { firstName: 'אתי', lastName: 'גרוס', fullName: 'אתי גרוס', phone: '052-9430081', email: 'eti.gross@gmail.com', company: 'פרטי', source: 'גוגל', city: 'זכרון יעקב', site: 'דירה חדשה', service: 'אקוסטיקה / רעש', serviceType: 'בדיקת רעש בדירה חדשה', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.FU_2, notes: 'רעש מתשתית משותפת.' },
    { firstName: 'ברק', lastName: 'לוין', fullName: 'ברק לוין', phone: '053-9017455', email: 'barak.levin@levin-dev.co.il', company: 'לוין יזמות', source: 'המלצה', city: 'נתניה', site: 'מגרש בנייה', service: 'קרינה', serviceType: 'בדיקות קרינה לפני תחילת פרויקט', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'מבקש מדידה גם לחדר טרנספורמציה.' },
    { firstName: 'סיגל', lastName: 'צור', fullName: 'סיגל צור', phone: '054-3711252', email: 'sigal.tzur@care-office.co.il', company: 'Care Office', source: 'גוגל', city: 'ירושלים', site: 'משרדים', service: 'איכות אוויר', serviceType: 'בדיקות איכות אוויר במשרד', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'תלונות חוזרות על כאבי ראש בקרב עובדים.' },
    { firstName: 'איתן', lastName: 'מור', fullName: 'איתן מור', phone: '050-7740128', email: 'eitan.mor@buildline.co.il', company: 'Buildline', source: 'קבלן', city: 'לוד', site: 'אתר מגורים', service: 'ליווי סביבתי', serviceType: 'ליווי סביבתי לפרויקט בנייה', stage: LeadStage.QUOTE_SENT, leadStatus: LeadStatus.QUOTE_SENT, notes: 'מעוניין ב-SLA ודוחות חודשיים.' },
    { firstName: 'רחל', lastName: 'שדה', fullName: 'רחל שדה', phone: '052-3381109', email: 'rachel.sadeh@gmail.com', company: 'פרטי', source: 'אתר', city: 'כפר יונה', site: 'בית משפחה', service: 'דיגום סביבתי', serviceType: 'דיגום עובש ותעלות מיזוג', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.FU_1, notes: 'מבקשת גם המלצות לטיפול לאחר הדיגום.' },
    { firstName: 'אלון', lastName: 'ברנע', fullName: 'אלון ברנע', phone: '053-2248801', email: 'alon@barnea-eng.co.il', company: 'ברנע הנדסה', source: 'המלצה', city: 'בני ברק', site: 'חדר שנאים בבניין משרדים', service: 'מיגון קרינה', serviceType: 'מיגון חדר שנאים', stage: LeadStage.NEGOTIATION, leadStatus: LeadStatus.NEGOTIATION, notes: 'דורש מפרט מיגון מפורט לאישור מזמין.' },
    { firstName: 'מאיה', lastName: 'דרור', fullName: 'מאיה דרור', phone: '054-9093317', email: 'maya.dror@kibbutz-center.org.il', company: 'מרכז קהילתי', source: 'וואטסאפ', city: 'עמק חפר', site: 'אולם רב תכליתי', service: 'אקוסטיקה / רעש', serviceType: 'בדיקות רעש לאולם פעילות', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'צריך פתרונות מהירים לפני אירוע פתיחה.' },
    { firstName: 'חן', lastName: 'מגל', fullName: 'חן מגל', phone: '050-6407724', email: 'chen.magal@urban-renew.co.il', company: 'Urban Renew', source: 'קבלן', city: 'פתח תקווה', site: 'מתחם פינוי בינוי', service: 'אסבסט', serviceType: 'סקר אסבסט לפרויקט התחדשות', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'בדגש על מחסנים ותשתיות ישנות.' },
    { firstName: 'תמר', lastName: 'סיון', fullName: 'תמר סיון', phone: '052-8701194', email: 'tamar.sivan@gmail.com', company: 'פרטי', source: 'פייסבוק', city: 'הרצליה', site: 'בית צמוד קרקע', service: 'קרינה', serviceType: 'בדיקת קרינה מקיפה לבית פרטי', stage: LeadStage.CONTACTED, leadStatus: LeadStatus.CONTACTED, notes: 'מתעניינת גם בבדיקת ראדון בהמשך.' },
    // ── 30 NEW inquiry leads (all stage NEW, for פנייה demo) ──
    { firstName: 'נדב', lastName: 'שלום', fullName: 'נדב שלום', phone: '052-4001234', email: 'nadav.shalom@gmail.com', company: 'פרטי', source: 'facebook', city: 'רעננה', site: 'דירה חדשה', service: 'קרינה', serviceType: 'בדיקת קרינה בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מעוניין בבדיקת קרינה לדירה שרכש בבניין חדש.' },
    { firstName: 'הדס', lastName: 'אורן', fullName: 'הדס אורן', phone: '054-5012345', email: 'hadas.oren@gmail.com', company: 'פרטי', source: 'google', city: 'כפר סבא', site: 'בית פרטי', service: 'רעש', serviceType: 'בדיקת רעש שכנים', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מתלוננת על רעש חזק ממזגן של השכן מעל.' },
    { firstName: 'עידו', lastName: 'רם', fullName: 'עידו רם', phone: '050-6023456', email: 'ido.ram@gmail.com', company: 'פרטי', source: 'website', city: 'הרצליה', site: 'דירת גן', service: 'ראדון', serviceType: 'בדיקת ראדון', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'דירת קרקע, חושש מראדון. מתכנן רכישה.' },
    { firstName: 'ליאור', lastName: 'כהן', fullName: 'ליאור כהן', phone: '053-7034567', email: 'lior.cohen.biz@gmail.com', company: 'כהן אינסטלציה', source: 'whatsapp', city: 'תל אביב', site: 'משרד', service: 'איכות אוויר', serviceType: 'בדיקת איכות אוויר במשרד', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'עובדים מתלוננים על ריח מוזר מתעלות מיזוג.' },
    { firstName: 'מורן', lastName: 'דוד', fullName: 'מורן דוד', phone: '054-8045678', email: 'moran.david@gmail.com', company: 'פרטי', source: 'referral', city: 'רמת גן', site: 'דירה', service: 'עובש', serviceType: 'בדיקת עובש בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'הופנתה ע"י חברה. עובש בחדר רחצה וחדר שינה.' },
    { firstName: 'אסף', lastName: 'ברוש', fullName: 'אסף ברוש', phone: '052-9056789', email: 'assaf.brosh@brosh-eng.co.il', company: 'ברוש הנדסה', source: 'google', city: 'נתניה', site: 'אתר בנייה', service: 'אקוסטיקה', serviceType: 'דוח אקוסטי להיתר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'צריך דוח אקוסטי לוועדה המקומית בנתניה.' },
    { firstName: 'שירלי', lastName: 'גבע', fullName: 'שירלי גבע', phone: '050-1067890', email: 'shirly.geva@gmail.com', company: 'פרטי', source: 'facebook', city: 'יבנה', site: 'בית פרטי', service: 'מים', serviceType: 'בדיקת מים', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מתגוררת בבית עם באר, רוצה לבדוק איכות מים.' },
    { firstName: 'גל', lastName: 'עוז', fullName: 'גל עוז', phone: '053-2078901', email: 'gal.oz@oztech.co.il', company: 'עוז טכנולוגיות', source: 'returning', city: 'ירושלים', site: 'חדר שרתים', service: 'קרינה', serviceType: 'מדידת קרינה במשרד', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'לקוח חוזר. רוצה מדידה חוזרת אחרי שינויים בתשתית חשמל.' },
    { firstName: 'יעל', lastName: 'מזור', fullName: 'יעל מזור', phone: '054-3089012', email: 'yael.mazor@gmail.com', company: 'פרטי', source: 'website', city: 'פתח תקווה', site: 'דירה', service: 'רעש מזגן', serviceType: 'בדיקת רעש מזגן', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'רעש מזגן מרכזי מטריד בשעות הלילה.' },
    { firstName: 'דביר', lastName: 'אלוני', fullName: 'דביר אלוני', phone: '050-4090123', email: 'dvir.aloni@aloni-build.co.il', company: 'אלוני בנייה', source: 'partner', city: 'הוד השרון', site: 'פרויקט מגורים', service: 'אקוסטיקה', serviceType: 'בדיקות אקוסטיות לבניין', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'קבלן שותף. צריך בדיקות אקוסטיות ל-3 בניינים.' },
    { firstName: 'נועה', lastName: 'פלד', fullName: 'נועה פלד', phone: '052-5101234', email: 'noa.peled@gmail.com', company: 'פרטי', source: 'facebook', city: 'רעננה', site: 'דירה חדשה', service: 'ראדון', serviceType: 'בדיקת ראדון בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'שמעה על סכנת ראדון, רוצה בדיקה לפני אכלוס.' },
    { firstName: 'רועי', lastName: 'חזן', fullName: 'רועי חזן', phone: '054-6112345', email: 'roi.hazan@hazan-group.co.il', company: 'קבוצת חזן', source: 'google', city: 'תל אביב', site: 'מגדל משרדים', service: 'איכות אוויר', serviceType: 'ניטור איכות אוויר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'דורש ניטור שוטף לאיכות אוויר ב-3 קומות.' },
    { firstName: 'טלי', lastName: 'שגב', fullName: 'טלי שגב', phone: '050-7123456', email: 'tali.segev@school-hasharon.edu.il', company: 'בי"ס השרון', source: 'referral', city: 'כפר סבא', site: 'בית ספר', service: 'בדיקות למוסדות', serviceType: 'בדיקות סביבתיות בבית ספר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'הורים לוחצים. צריכים בדיקת קרינה ורעש בכיתות.' },
    { firstName: 'אורי', lastName: 'נווה', fullName: 'אורי נווה', phone: '053-8134567', email: 'ori.nave@gmail.com', company: 'פרטי', source: 'whatsapp', city: 'הרצליה', site: 'דירה', service: 'ריח חריג', serviceType: 'בדיקת ריח חריג', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ריח ביוב חזק בחדר שינה. מבקש בדיקה דחופה.' },
    { firstName: 'דנה', lastName: 'אשכנזי', fullName: 'דנה אשכנזי', phone: '054-9145678', email: 'dana.ashkenazi@gmail.com', company: 'פרטי', source: 'google', city: 'רמת גן', site: 'דירה', service: 'עובש', serviceType: 'דיגום עובש', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'כתמי עובש על הקירות. מבקשת בדיקה ודוח לביטוח.' },
    { firstName: 'עמית', lastName: 'זהבי', fullName: 'עמית זהבי', phone: '052-1156789', email: 'amit.zahavi@zahavi-dev.co.il', company: 'זהבי יזמות', source: 'partner', city: 'נתניה', site: 'מגרש בנייה', service: 'קרינה', serviceType: 'בדיקת קרינה לפני בנייה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'יזם שצריך בדיקת קרינה לפני תחילת חפירות.' },
    { firstName: 'קרן', lastName: 'אביב', fullName: 'קרן אביב', phone: '050-2167890', email: 'keren.aviv@gmail.com', company: 'פרטי', source: 'facebook', city: 'יבנה', site: 'בית', service: 'מים', serviceType: 'בדיקת איכות מים', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מים עם טעם מוזר מהברז. רוצה בדיקה מקיפה.' },
    { firstName: 'תום', lastName: 'רוזן', fullName: 'תום רוזן', phone: '053-3178901', email: 'tom.rozen@gmail.com', company: 'פרטי', source: 'website', city: 'ירושלים', site: 'דירה', service: 'רעש', serviceType: 'בדיקת רעש תשתיות', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'רעש רציף מצנרת או מערכת חימום מרכזית.' },
    { firstName: 'מיכאל', lastName: 'פרץ', fullName: 'מיכאל פרץ', phone: '054-4189012', email: 'michael.peretz@peretz-factory.co.il', company: 'מפעלי פרץ', source: 'google', city: 'פתח תקווה', site: 'מפעל', service: 'איכות אוויר', serviceType: 'ניטור פליטות למפעל', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ממונה בטיחות דורש דוח תקופתי.' },
    { firstName: 'שני', lastName: 'לוי', fullName: 'שני לוי', phone: '050-5190123', email: 'shani.levi88@gmail.com', company: 'פרטי', source: 'referral', city: 'הוד השרון', site: 'דירה', service: 'אקוסטיקה', serviceType: 'בדיקת רעש בדירה חדשה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'נכנסה לדירה חדשה ושומעת רעש מהדירה מעל.' },
    { firstName: 'יונתן', lastName: 'בר', fullName: 'יונתן בר', phone: '052-6201234', email: 'yonatan.bar@bar-office.co.il', company: 'בר משרדים', source: 'whatsapp', city: 'תל אביב', site: 'משרדים', service: 'ריח חריג', serviceType: 'בדיקת ריח וזיהום', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ריח חריג מאזור המטבחון. עובדים מתלוננים.' },
    { firstName: 'עדי', lastName: 'סער', fullName: 'עדי סער', phone: '054-7212345', email: 'adi.saar@gmail.com', company: 'פרטי', source: 'returning', city: 'רעננה', site: 'בית פרטי', service: 'קרינה', serviceType: 'בדיקת קרינה חוזרת', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'לקוחה חוזרת. רוצה בדיקה אחרי הקמת אנטנה חדשה בשכונה.' },
    { firstName: 'איתי', lastName: 'גולן', fullName: 'איתי גולן', phone: '050-8223456', email: 'itay.golan@golan-construction.co.il', company: 'גולן בנייה', source: 'partner', city: 'נתניה', site: 'אתר בנייה', service: 'אקוסטיקה', serviceType: 'דוח אקוסטי להיתר בנייה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'קבלן. צריך דוח אקוסטי דחוף להגשת היתר.' },
    { firstName: 'רותם', lastName: 'ניר', fullName: 'רותם ניר', phone: '053-9234567', email: 'rotem.nir@gmail.com', company: 'פרטי', source: 'facebook', city: 'ירושלים', site: 'דירה', service: 'ראדון', serviceType: 'בדיקת ראדון', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'קראה כתבה על ראדון. גרה בקומת קרקע, רוצה להיבדק.' },
    { firstName: 'מעיין', lastName: 'שפירא', fullName: 'מעיין שפירא', phone: '054-1245678', email: 'maayan.shapira@shapira-school.edu.il', company: 'בי"ס שפירא', source: 'referral', city: 'כפר סבא', site: 'בית ספר', service: 'בדיקות למוסדות', serviceType: 'בדיקות קרינה ורעש בבית ספר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מנהלת בית ספר. הורים דורשים בדיקות קרינה.' },
    { firstName: 'אלעד', lastName: 'טל', fullName: 'אלעד טל', phone: '050-2256789', email: 'elad.tal@talwater.co.il', company: 'טל מים', source: 'google', city: 'הרצליה', site: 'מפעל', service: 'מים', serviceType: 'בדיקת מים תעשייתית', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מפעל עם מערכת מיחזור מים. צריך בדיקת תקינות.' },
    { firstName: 'ליהי', lastName: 'קדם', fullName: 'ליהי קדם', phone: '052-3267890', email: 'lihi.kedem@gmail.com', company: 'פרטי', source: 'website', city: 'רמת גן', site: 'דירה', service: 'רעש מזגן', serviceType: 'בדיקת רעש ממזגן מרכזי', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מזגן מרכזי בבניין גורם לרעידות. רוצה בדיקה ודוח.' },
    { firstName: 'ניר', lastName: 'אדם', fullName: 'ניר אדם', phone: '054-4278901', email: 'nir.adam@adam-properties.co.il', company: 'אדם נכסים', source: 'whatsapp', city: 'פתח תקווה', site: 'בניין מגורים', service: 'עובש', serviceType: 'בדיקת עובש בבניין', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מנהל נכסים. עובש חוזר ב-3 דירות בבניין.' },
    { firstName: 'שיר', lastName: 'ארזי', fullName: 'שיר ארזי', phone: '050-5289012', email: 'shir.arzi@gmail.com', company: 'פרטי', source: 'facebook', city: 'הוד השרון', site: 'בית', service: 'איכות אוויר', serviceType: 'בדיקת איכות אוויר בבית', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ילד אסטמטי. רוצה לוודא שהאוויר בבית תקין.' },
    { firstName: 'אופיר', lastName: 'יוסף', fullName: 'אופיר יוסף', phone: '053-6290123', email: 'ofir.yosef@yosef-eng.co.il', company: 'יוסף הנדסה', source: 'google', city: 'תל אביב', site: 'בניין מסחרי', service: 'אקוסטיקה', serviceType: 'בדיקות אקוסטיות למסחרי', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'צריך דוח אקוסטי לרישוי עסק במרכז מסחרי.' },

    // ── 20 ADDITIONAL inquiry leads (stage NEW) ──
    { firstName: 'אורן', lastName: 'דגן', fullName: 'אורן דגן', phone: '052-7301234', email: 'oren.dagan@gmail.com', company: 'פרטי', source: 'google', city: 'חיפה', site: 'דירה', service: 'קרינה', serviceType: 'בדיקת קרינה בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מעוניין בבדיקת קרינה לדירה ליד אנטנה סלולרית.' },
    { firstName: 'ליאת', lastName: 'מור', fullName: 'ליאת מור', phone: '054-8312345', email: 'liat.mor@gmail.com', company: 'פרטי', source: 'facebook', city: 'ראשון לציון', site: 'בית פרטי', service: 'רעש', serviceType: 'בדיקת רעש מתעשייה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'רעש ממפעל סמוך מטריד בשעות הלילה.' },
    { firstName: 'בועז', lastName: 'קריף', fullName: 'בועז קריף', phone: '050-9323456', email: 'boaz.krief@krief-build.co.il', company: 'קריף בנייה', source: 'partner', city: 'באר שבע', site: 'אתר בנייה', service: 'אקוסטיקה', serviceType: 'דוח אקוסטי להיתר', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'קבלן בבאר שבע, צריך דוח אקוסטי לפרויקט חדש.' },
    { firstName: 'הילה', lastName: 'עמר', fullName: 'הילה עמר', phone: '053-1334567', email: 'hila.amar@gmail.com', company: 'פרטי', source: 'website', city: 'רחובות', site: 'דירה', service: 'עובש', serviceType: 'בדיקת עובש בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'עובש חוזר בחדר ילדים למרות טיפולים קודמים.' },
    { firstName: 'תמיר', lastName: 'חן', fullName: 'תמיר חן', phone: '052-2345678', email: 'tamir.chen@gmail.com', company: 'פרטי', source: 'whatsapp', city: 'אשדוד', site: 'דירת גן', service: 'ראדון', serviceType: 'בדיקת ראדון', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'דירת קרקע באשדוד, חושש מריכוז ראדון גבוה.' },
    { firstName: 'סיגל', lastName: 'הראל', fullName: 'סיגל הראל', phone: '054-3356789', email: 'sigal.harel@harel-office.co.il', company: 'הראל משרדים', source: 'google', city: 'גבעתיים', site: 'משרד', service: 'איכות אוויר', serviceType: 'בדיקת איכות אוויר במשרד', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'עובדים מדווחים על עייפות וכאבי ראש במשרד.' },
    { firstName: 'אייל', lastName: 'פישר', fullName: 'אייל פישר', phone: '050-4367890', email: 'eyal.fisher@gmail.com', company: 'פרטי', source: 'referral', city: 'חולון', site: 'דירה', service: 'רעש מזגן', serviceType: 'בדיקת רעש מזגן', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'הופנה מחבר. מזגן חיצוני של שכן רועש מאוד.' },
    { firstName: 'נטע', lastName: 'שמעון', fullName: 'נטע שמעון', phone: '053-5378901', email: 'neta.shimon@gmail.com', company: 'פרטי', source: 'facebook', city: 'מודיעין', site: 'בית פרטי', service: 'מים', serviceType: 'בדיקת איכות מים', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מים עכורים מהברז אחרי עבודות תשתית בשכונה.' },
    { firstName: 'דרור', lastName: 'בן דוד', fullName: 'דרור בן דוד', phone: '052-6389012', email: 'dror.bendavid@bendavid-eng.co.il', company: 'בן דוד הנדסה', source: 'partner', city: 'רמת השרון', site: 'פרויקט מגורים', service: 'אקוסטיקה', serviceType: 'בדיקות אקוסטיות לבניין', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מהנדס שצריך בדיקות אקוסטיות לפרויקט של 4 בניינים.' },
    { firstName: 'ענבר', lastName: 'צור', fullName: 'ענבר צור', phone: '054-7390123', email: 'inbar.tzur@gmail.com', company: 'פרטי', source: 'google', city: 'אילת', site: 'דירה', service: 'קרינה', serviceType: 'מדידת קרינה סלולרית', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'אנטנה חדשה על גג הבניין. רוצה למדוד קרינה בדירה.' },
    { firstName: 'יגאל', lastName: 'נוי', fullName: 'יגאל נוי', phone: '050-8401234', email: 'yigal.noy@noy-properties.co.il', company: 'נוי נכסים', source: 'returning', city: 'אשקלון', site: 'בניין מגורים', service: 'עובש', serviceType: 'בדיקת עובש בבניין', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'לקוח חוזר. עובש בלובי ובמרתף בניין שהוא מנהל.' },
    { firstName: 'רונית', lastName: 'גלעד', fullName: 'רונית גלעד', phone: '053-9412345', email: 'ronit.gilad@gmail.com', company: 'פרטי', source: 'website', city: 'חיפה', site: 'דירה', service: 'ריח חריג', serviceType: 'בדיקת ריח חריג', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ריח חריג מחדר המדרגות חודר לדירה.' },
    { firstName: 'עמרי', lastName: 'שלו', fullName: 'עמרי שלו', phone: '052-1423456', email: 'omri.shilo@gmail.com', company: 'פרטי', source: 'whatsapp', city: 'ראשון לציון', site: 'דירה חדשה', service: 'רעש', serviceType: 'בדיקת רעש בדירה חדשה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'נכנס לדירה חדשה, רעשים ממערכות הבניין.' },
    { firstName: 'אפרת', lastName: 'רוזנפלד', fullName: 'אפרת רוזנפלד', phone: '054-2434567', email: 'efrat.rosenfeld@rosenfeld-clinic.co.il', company: 'מרפאת רוזנפלד', source: 'google', city: 'רחובות', site: 'מרפאה', service: 'בדיקות למוסדות', serviceType: 'בדיקות סביבתיות למרפאה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'צריכה בדיקות לחידוש רישיון מרפאה.' },
    { firstName: 'גיא', lastName: 'אשר', fullName: 'גיא אשר', phone: '050-3445678', email: 'guy.asher@gmail.com', company: 'פרטי', source: 'facebook', city: 'באר שבע', site: 'בית פרטי', service: 'ראדון', serviceType: 'בדיקת ראדון', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'בנה בית חדש, רוצה בדיקת ראדון לפני אכלוס.' },
    { firstName: 'מיטל', lastName: 'אריאלי', fullName: 'מיטל אריאלי', phone: '053-4456789', email: 'meital.arieli@gmail.com', company: 'פרטי', source: 'referral', city: 'גבעתיים', site: 'דירה', service: 'איכות אוויר', serviceType: 'בדיקת איכות אוויר בדירה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'הופנתה מרופאה. חשד לזיהום אוויר בדירה.' },
    { firstName: 'נדב', lastName: 'ברק', fullName: 'נדב ברק', phone: '052-5467890', email: 'nadav.barak@barak-dev.co.il', company: 'ברק יזמות', source: 'partner', city: 'חולון', site: 'מגרש בנייה', service: 'קרינה', serviceType: 'בדיקת קרינה לפני בנייה', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'יזם שצריך בדיקת קרינה סביבתית לפרויקט חדש.' },
    { firstName: 'שלומית', lastName: 'ויס', fullName: 'שלומית ויס', phone: '054-6478901', email: 'shlomit.weiss@gmail.com', company: 'פרטי', source: 'website', city: 'מודיעין', site: 'דירה', service: 'רעש', serviceType: 'בדיקת רעש תשתיות', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'רעש ממערכת מים חמים מרכזית בבניין.' },
    { firstName: 'רז', lastName: 'כרמל', fullName: 'רז כרמל', phone: '050-7489012', email: 'raz.carmel@carmel-factory.co.il', company: 'מפעלי כרמל', source: 'google', city: 'רמת השרון', site: 'מפעל', service: 'איכות אוויר', serviceType: 'ניטור פליטות למפעל', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'ממונה סביבה דורש דוח שנתי לפליטות.' },
    { firstName: 'דקלה', lastName: 'יפרח', fullName: 'דקלה יפרח', phone: '053-8490123', email: 'dikla.ifrach@gmail.com', company: 'פרטי', source: 'facebook', city: 'אשקלון', site: 'בית פרטי', service: 'מים', serviceType: 'בדיקת איכות מים', stage: LeadStage.NEW, leadStatus: LeadStatus.NEW, notes: 'מים עם צבע חלודה מהברז. רוצה בדיקה מקיפה.' },
  ] as const;

  const now = Date.now();
  let createdLeads = 0;
  for (let i = 0; i < leadsDemo.length; i += 1) {
    const l = leadsDemo[i];
    const exists = await prisma.lead.findFirst({
      where: {
        OR: [{ email: l.email }, { phone: l.phone }, { fullName: l.fullName }],
      },
      select: { id: true },
    });
    if (exists) continue;

    const createdAt = new Date(now - (i + 1) * 86400000);
    const followUp1 = new Date(createdAt.getTime() + 2 * 86400000);
    const followUp2 = new Date(createdAt.getTime() + 5 * 86400000);
    const nextFollow = new Date(createdAt.getTime() + 7 * 86400000);

    await prisma.lead.create({
      data: {
        firstName: l.firstName,
        lastName: l.lastName,
        fullName: l.fullName,
        phone: l.phone,
        email: l.email,
        company: l.company,
        source: l.source,
        service: l.service,
        serviceType: l.serviceType,
        city: l.city,
        site: l.site,
        notes: l.notes,
        status: l.leadStatus,
        stage: l.stage,
        leadStatus: l.leadStatus,
        followUp1Date: followUp1,
        followUp2Date: followUp2,
        nextFollowUpDate: nextFollow,
        assignedUserId: pickAssignee(i) ?? undefined,
        createdAt,
      },
    });
    createdLeads += 1;
  }

  const allCustomers = await prisma.customer.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  const allLeads = await prisma.lead.findMany({
    select: { id: true, fullName: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  const allProjects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  const customerIdByName = new Map(allCustomers.map((c) => [c.name, c.id]));
  const leadIdByFullName = new Map(allLeads.map((l) => [l.fullName || '', l.id]));
  const projectIdByName = new Map(allProjects.map((p) => [p.name, p.id]));

  const techUsers = await prisma.user.findMany({
    where: { role: UserRole.TECHNICIAN },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const managerUser = await prisma.user.findFirst({
    where: { role: UserRole.MANAGER },
    select: { id: true },
  });

  const techIds = techUsers.map((u) => u.id);
  const pickTech = (idx: number) => (techIds.length ? techIds[idx % techIds.length] : null);

  const projectsDemo = [
    {
      id: 'P-3101',
      name: 'בדיקות אקוסטיות לבניין מגורים חדש',
      client: 'קבוצת שקד הנדסה בע"מ',
      customerName: 'קבוצת שקד הנדסה בע"מ',
      status: ProjectStatus.SCHEDULED,
      progress: 18,
      city: 'פתח תקווה',
      address: 'רחוב המכבים 21',
      service: 'אקוסטיקה / רעש',
      serviceCategory: 'אקוסטיקה',
      serviceSubType: 'דוח אקוסטי להיתר',
      urgency: 'HIGH',
      notes: 'מדידות רעש והדהוד לפני ביקורת הוועדה המקומית.',
    },
    {
      id: 'P-3102',
      name: 'מיגון קרינה לחדר שנאים',
      client: 'אוסם הנדסה תשתיות',
      customerName: 'אוסם הנדסה תשתיות',
      status: ProjectStatus.ON_THE_WAY,
      progress: 35,
      city: 'נתניה',
      address: 'אזה"ת פולג',
      service: 'מיגון קרינה',
      serviceCategory: 'קרינה',
      serviceSubType: 'מיגון חדר חשמל',
      urgency: 'URGENT',
      notes: 'תכנון שילוט ומיגון קירות לפני אכלוס קומת משרדים.',
    },
    {
      id: 'P-3103',
      name: 'בדיקות קרינה לפני רכישת בית',
      client: 'יואב כהן',
      customerName: 'יואב כהן',
      status: ProjectStatus.NEW,
      progress: 5,
      city: 'רעננה',
      address: 'רחוב האילן 9',
      service: 'קרינה',
      serviceCategory: 'קרינה',
      serviceSubType: 'בית פרטי',
      urgency: 'MEDIUM',
      notes: 'בדיקה מלאה כולל חדר ממ"ד וחדר חשמל שכונתי סמוך.',
    },
    {
      id: 'P-3104',
      name: 'סקר אסבסט לפני פירוק גג',
      client: 'אורן בנייה ויזמות',
      customerName: 'אורן בנייה ויזמות',
      status: ProjectStatus.WAITING_DATA,
      progress: 46,
      city: 'אשדוד',
      address: 'רחוב העבודה 14',
      service: 'אסבסט',
      serviceCategory: 'חומרים מסוכנים',
      serviceSubType: 'סקר מקדים',
      urgency: 'HIGH',
      notes: 'ממתינים למסמכי ניהול אתר וחתימת קבלן משנה לפינוי.',
    },
    {
      id: 'P-3105',
      name: 'בדיקת איכות אוויר במשרדי הייטק',
      client: 'גרין אופיס',
      customerName: 'גרין אופיס',
      status: ProjectStatus.REPORT_WRITING,
      progress: 70,
      city: 'תל אביב',
      address: 'מגדל הארבעה',
      service: 'איכות אוויר',
      serviceCategory: 'אוויר',
      serviceSubType: 'בדיקות במשרד',
      urgency: 'MEDIUM',
      notes: 'נמדדו תנודות CO2 בשעות עומס, דוח בהכנה.',
    },
    {
      id: 'P-3106',
      name: 'פרויקט ראדון לבית פרטי',
      client: 'לירון כהן',
      customerName: 'לירון כהן',
      status: ProjectStatus.SCHEDULED,
      progress: 25,
      city: 'מודיעין',
      address: 'רחוב נחל עיון 3',
      service: 'ראדון',
      serviceCategory: 'גזי קרקע',
      serviceSubType: 'מדידה ארוכת טווח',
      urgency: 'MEDIUM',
      notes: 'נדרש תיאום התקנה ואיסוף גלאים לשבועיים.',
    },
    {
      id: 'P-3107',
      name: 'בדיקות רעש למערכות מיזוג בבניין משרדים',
      client: 'אלון מערכות מיזוג',
      customerName: 'אלון מערכות מיזוג',
      status: ProjectStatus.WAITING_APPROVAL,
      progress: 30,
      city: 'רמת גן',
      address: 'דרך אבא הלל 18',
      service: 'אקוסטיקה / רעש',
      serviceCategory: 'אקוסטיקה',
      serviceSubType: 'רעש מערכות',
      urgency: 'HIGH',
      notes: 'ממתינים לאישור הצעת המשך למדידות לילה.',
    },
    {
      id: 'P-3108',
      name: 'ליווי סביבתי לפרויקט התחדשות עירונית',
      client: 'הדר ניהול פרויקטים',
      customerName: 'הדר ניהול פרויקטים',
      status: ProjectStatus.SENT_TO_CLIENT,
      progress: 82,
      city: 'תל אביב',
      address: 'שכונת יד אליהו',
      service: 'ליווי סביבתי',
      serviceCategory: 'סביבתי',
      serviceSubType: 'ליווי פרויקט',
      urgency: 'URGENT',
      notes: 'נשלח עדכון חודשי הכולל רעש, אבק ומעקב תלונות דיירים.',
    },
  ] as const;

  let createdProjects = 0;
  for (let i = 0; i < projectsDemo.length; i += 1) {
    const p = projectsDemo[i];
    const customerId = customerIdByName.get(p.customerName) ?? null;
    const assignedTechnicianId = pickTech(i);
    const assignedReportWriterId = managerUser?.id ?? pickAssignee(i) ?? null;
    const baseDate = new Date(now + (i + 2) * 86400000);

    const data = {
      id: p.id,
      name: p.name,
      client: p.client,
      status: p.status,
      progress: p.progress,
      dueDate: new Date(baseDate.getTime() + 5 * 86400000),
      siteVisitDate: baseDate,
      siteVisitTime: '09:30',
      city: p.city,
      address: p.address,
      service: p.service,
      serviceCategory: p.serviceCategory,
      serviceSubType: p.serviceSubType,
      urgency: p.urgency,
      notes: p.notes,
      customerId,
      assignedTechnicianId,
      assignedReportWriterId,
    };

    const exists = await prisma.project.findUnique({ where: { id: p.id }, select: { id: true } });
    if (exists) {
      await prisma.project.update({ where: { id: p.id }, data });
    } else {
      await prisma.project.create({ data });
      createdProjects += 1;
    }

    projectIdByName.set(p.name, p.id);
  }

  const quotesDemo = [
    { quoteNumber: 'DEMO-Q-2026-001', service: 'בדיקת קרינה לבית פרטי', description: 'מדידה מלאה לרמות קרינה בבית פרטי כולל סיכום המלצות.', amountBeforeVat: 2450, discountType: 'NONE', discountValue: 0, status: 'SENT', customerName: 'יואב כהן', leadName: 'תומר מזרחי', projectName: 'בדיקות קרינה לפני רכישת בית', notes: 'כולל ביקור אחד ודוח מסכם.' },
    { quoteNumber: 'DEMO-Q-2026-002', service: 'דוח אקוסטי להיתר בנייה', description: 'דוח אקוסטי מלא לוועדה מקומית + חישובי רעש.', amountBeforeVat: 5200, discountType: 'PERCENT', discountValue: 5, status: 'DRAFT', customerName: 'קבוצת שקד הנדסה בע"מ', leadName: 'שירי עמית', projectName: 'בדיקות אקוסטיות לבניין מגורים חדש', notes: 'הצעת שלב א לתכנון ראשוני.' },
    { quoteNumber: 'DEMO-Q-2026-003', service: 'בדיקת רעש בדירה חדשה', description: 'מדידת רעש רקע ותשתיות בדירה חדשה.', amountBeforeVat: 1850, discountType: 'NONE', discountValue: 0, status: 'APPROVED', customerName: 'ענבל לוי', leadName: 'אתי גרוס', projectName: 'בדיקות רעש למערכות מיזוג בבניין משרדים', notes: 'בוצע תיאום לביקור ערב.' },
    { quoteNumber: 'DEMO-Q-2026-004', service: 'מיגון חדר חשמל', description: 'תכנון מיגון קרינה לחדר חשמל וחדר שנאים.', amountBeforeVat: 11800, discountType: 'CURRENCY', discountValue: 800, status: 'SENT', customerName: 'אוסם הנדסה תשתיות', leadName: 'אלון ברנע', projectName: 'מיגון קרינה לחדר שנאים', notes: 'המחיר כולל בדיקת אימות לאחר התקנה.' },
    { quoteNumber: 'DEMO-Q-2026-005', service: 'בדיקת ראדון', description: 'התקנת גלאים, איסוף, ופענוח תוצאות.', amountBeforeVat: 2300, discountType: 'NONE', discountValue: 0, status: 'SENT', customerName: 'לירון כהן', leadName: 'ענת ברק', projectName: 'פרויקט ראדון לבית פרטי', notes: 'משך בדיקה משוער 14 ימים.' },
    { quoteNumber: 'DEMO-Q-2026-006', service: 'סקר אסבסט', description: 'סקר אסבסט מקדים + המלצות לפינוי בטוח.', amountBeforeVat: 4700, discountType: 'NONE', discountValue: 0, status: 'DRAFT', customerName: 'אורן בנייה ויזמות', leadName: 'עומר פרנק', projectName: 'סקר אסבסט לפני פירוק גג', notes: 'לא כולל עבודות פינוי בפועל.' },
    { quoteNumber: 'DEMO-Q-2026-007', service: 'בדיקות איכות אוויר במשרד', description: 'דיגום איכות אוויר, CO2, VOC וטמפ/לחות.', amountBeforeVat: 3900, discountType: 'PERCENT', discountValue: 7, status: 'APPROVED', customerName: 'גרין אופיס', leadName: 'סיגל צור', projectName: 'בדיקת איכות אוויר במשרדי הייטק', notes: 'כולל שני ימי דיגום.' },
    { quoteNumber: 'DEMO-Q-2026-008', service: 'דיגום סביבתי למוסד חינוכי', description: 'תוכנית דיגום סביבה למבני חינוך.', amountBeforeVat: 6400, discountType: 'NONE', discountValue: 0, status: 'SENT', customerName: 'בית ספר אורנים', leadName: 'דניאלה שור', projectName: null, notes: 'מותאם לדרישות רשות מקומית.' },
    { quoteNumber: 'DEMO-Q-2026-009', service: 'ליווי סביבתי לפרויקט מגורים', description: 'ליווי סביבתי חודשי לפרויקט בנייה פעיל.', amountBeforeVat: 12600, discountType: 'CURRENCY', discountValue: 600, status: 'SENT', customerName: 'הדר ניהול פרויקטים', leadName: 'איתן מור', projectName: 'ליווי סביבתי לפרויקט התחדשות עירונית', notes: 'כולל דוחות תקופתיים ופגישות תיאום.' },
    { quoteNumber: 'DEMO-Q-2026-010', service: 'בדיקות סביבתיות למפעל', description: 'בדיקות רעש ואיכות אוויר במפעל תעשייתי.', amountBeforeVat: 9800, discountType: 'NONE', discountValue: 0, status: 'REJECTED', customerName: 'טכנו-מד תעשיות', leadName: 'רון יעקובי', projectName: null, notes: 'הלקוח ביקש לדחות לרבעון הבא.' },
  ] as const;

  let createdQuotes = 0;
  for (let i = 0; i < quotesDemo.length; i += 1) {
    const q = quotesDemo[i];
    const customerId = customerIdByName.get(q.customerName);
    if (!customerId) continue;
    const leadId = leadIdByFullName.get(q.leadName) ?? null;
    const projectId = q.projectName ? (projectIdByName.get(q.projectName) ?? null) : null;

    const vatPercent = 17;
    const amountBeforeVat = q.amountBeforeVat;
    const discountValue = q.discountValue;
    const subtotal =
      q.discountType === 'PERCENT'
        ? amountBeforeVat * (1 - discountValue / 100)
        : q.discountType === 'CURRENCY'
          ? Math.max(0, amountBeforeVat - discountValue)
          : amountBeforeVat;
    const totalAmount = Number((subtotal * (1 + vatPercent / 100)).toFixed(2));

    const exists = await prisma.quote.findFirst({
      where: { quoteNumber: q.quoteNumber },
      select: { id: true },
    });
    if (exists) continue;

    const createdAt = new Date(now - (i + 2) * 86400000);
    await prisma.quote.create({
      data: {
        quoteNumber: q.quoteNumber,
        service: q.service,
        description: q.description,
        amount: totalAmount,
        status: q.status as any,
        validTo: new Date(now + 21 * 86400000),
        customerId,
        leadId,
        projectId,
        validityDate: new Date(now + 21 * 86400000),
        amountBeforeVat,
        vatPercent,
        discountType: q.discountType as any,
        discountValue,
        totalAmount,
        paymentTerms: 'שוטף + 30',
        notes: q.notes,
        createdAt,
      },
    });
    createdQuotes += 1;
  }

  const tasksDemo = [
    // ── 5 tasks for TODAY (dueInDays: 0) ──
    { title: 'לחזור ללקוח לגבי הצעת מחיר לבדיקת קרינה בבית', description: 'הצעה נשלחה לפני 3 ימים, הלקוח ביקש לחשוב. לחזור ולבדוק אם יש שאלות.', status: 'OPEN', priority: 'HIGH', type: 'SALES_FOLLOWUP', dueInDays: 0, dueHour: '10:00', customerName: 'יואב כהן', leadName: 'תומר מזרחי', projectName: 'בדיקות קרינה לפני רכישת בית' },
    { title: 'שיחה חוזרת אחרי פנייה מפייסבוק - בדיקת ראדון', description: 'ליד חם מפייסבוק, לא ענתה בשיחה ראשונה. לנסות שוב היום.', status: 'OPEN', priority: 'URGENT', type: 'SALES_FOLLOWUP', dueInDays: 0, dueHour: '11:30', customerName: null, leadName: 'ליאת שמש', projectName: null },
    { title: 'לתאם הגעה למדידת רעש - בניין משרדים רמת גן', description: 'לאשר שעת הגעה ולוודא שיש גישה לקומות 3-5.', status: 'IN_PROGRESS', priority: 'HIGH', type: 'COORDINATION', dueInDays: 0, dueHour: '09:00', customerName: 'אלון מערכות מיזוג', leadName: 'אילן דיין', projectName: 'בדיקות רעש למערכות מיזוג בבניין משרדים' },
    { title: 'שליחת מסמכים - דוח אקוסטי להיתר בנייה', description: 'להעביר דוח מסכם + נספחים לוועדה המקומית. הלקוח מחכה.', status: 'OPEN', priority: 'HIGH', type: 'REPORT_WRITING', dueInDays: 0, dueHour: '14:00', customerName: 'קבוצת שקד הנדסה בע"מ', leadName: 'שירי עמית', projectName: 'בדיקות אקוסטיות לבניין מגורים חדש' },
    { title: 'גבייה על בדיקת איכות אוויר - חשבונית 4870', description: 'חשבונית לא שולמה כבר 45 יום. לתזכר את הנה"ח של הלקוח.', status: 'OPEN', priority: 'MEDIUM', type: 'COLLECTION', dueInDays: 0, dueHour: '16:00', customerName: 'גרין אופיס', leadName: 'אביב גרין', projectName: 'בדיקת איכות אוויר במשרדי הייטק' },

    // ── 4 tasks OVERDUE (negative dueInDays) ──
    { title: 'שיחה חוזרת אחרי אין מענה - סקר אסבסט', description: 'ניסיתי 3 פעמים, לא ענה. לנסות שוב או לשלוח WhatsApp.', status: 'OPEN', priority: 'URGENT', type: 'SALES_FOLLOWUP', dueInDays: -2, dueHour: '10:00', customerName: 'אורן בנייה ויזמות', leadName: 'עומר פרנק', projectName: 'סקר אסבסט לפני פירוק גג' },
    { title: 'פולואפ אחרי שליחת הצעה לבית ספר', description: 'הצעה לבדיקות סביבתיות נשלחה לפני שבוע. לוודא שדנה קיבלה.', status: 'OPEN', priority: 'HIGH', type: 'QUOTE_PREPARATION', dueInDays: -3, dueHour: '09:00', customerName: 'בית ספר אורנים', leadName: 'דניאלה שור', projectName: null },
    { title: 'לבדוק אם הלקוח קיבל דוח ראדון', description: 'דוח נשלח במייל, לא אושרה קבלה. לחזור ללקוח.', status: 'OPEN', priority: 'MEDIUM', type: 'REVIEW', dueInDays: -1, dueHour: '11:00', customerName: 'לירון כהן', leadName: 'ענת ברק', projectName: 'פרויקט ראדון לבית פרטי' },
    { title: 'לעדכן לקוח לגבי זמינות צוות - מדידת קרינה', description: 'הלקוח מחכה לתאריך. צוות שטח עמוס, צריך לתת צפי.', status: 'OPEN', priority: 'HIGH', type: 'COORDINATION', dueInDays: -4, dueHour: '13:00', customerName: 'אוסם הנדסה תשתיות', leadName: 'קובי זיו', projectName: 'מיגון קרינה לחדר שנאים' },

    // ── 5 tasks THIS WEEK (dueInDays 1-6) ──
    { title: 'מעקב אחרי ליד חם - דוח אקוסטי להיתר', description: 'הצעה אושרה בעל-פה. לסגור חוזה ולפתוח פרויקט.', status: 'IN_PROGRESS', priority: 'HIGH', type: 'SALES_FOLLOWUP', dueInDays: 1, dueHour: '10:00', customerName: 'קבוצת שקד הנדסה בע"מ', leadName: 'נעם קליין', projectName: 'בדיקות אקוסטיות לבניין מגורים חדש' },
    { title: 'תזכורת לשליחת הצעה לאקוסטיקה - אולם רב תכליתי', description: 'צריך להכין הצעת מחיר לבדיקות רעש לאולם פעילות בעמק חפר.', status: 'OPEN', priority: 'MEDIUM', type: 'QUOTE_PREPARATION', dueInDays: 2, dueHour: '12:00', customerName: null, leadName: 'מאיה דרור', projectName: null },
    { title: 'מעקב אחרי לקוח קיים - ליווי סביבתי חודשי', description: 'לבדוק עם רוני הדר האם יש צורך בעדכון דוח חודשי.', status: 'OPEN', priority: 'LOW', type: 'SALES_FOLLOWUP', dueInDays: 3, dueHour: '15:00', customerName: 'הדר ניהול פרויקטים', leadName: 'איתן מור', projectName: 'ליווי סביבתי לפרויקט התחדשות עירונית' },
    { title: 'תיאום ביקור - בדיקת עובש בבניין מגורים חולון', description: 'דיגום עובש ואיכות אוויר. לתאם שעה עם ועד הבית.', status: 'OPEN', priority: 'MEDIUM', type: 'FIELD_WORK', dueInDays: 4, dueHour: '09:30', customerName: 'אחוזת כרמל ניהול', leadName: 'מיכל אביטל', projectName: null },
    { title: 'בדיקת מסמכי ביטוח לפני כניסה לשטח - עירייה', description: 'בדיקות סביבתיות בנס ציונה. צריך אישורי בטיחות וביטוח.', status: 'OPEN', priority: 'HIGH', type: 'COORDINATION', dueInDays: 5, dueHour: '10:00', customerName: 'עיריית נס ציונה', leadName: null, projectName: null },

    // ── 3 tasks DONE ──
    { title: 'שיחת מכירה ראשונה - בדיקת קרינה לפני רכישה', description: 'שיחה מוצלחת, הלקוח מעוניין. נשלחה הצעה.', status: 'DONE', priority: 'HIGH', type: 'SALES_FOLLOWUP', dueInDays: -1, dueHour: '10:00', customerName: 'יואב כהן', leadName: 'שרון ממן', projectName: 'בדיקות קרינה לפני רכישת בית' },
    { title: 'לחזור לגבי בדיקת ראדון - מודיעין', description: 'אושר מועד בדיקה. פרויקט נפתח.', status: 'DONE', priority: 'MEDIUM', type: 'COORDINATION', dueInDays: -2, dueHour: '14:00', customerName: 'לירון כהן', leadName: 'ענת ברק', projectName: 'פרויקט ראדון לבית פרטי' },
    { title: 'פתיחת פרויקט לאחר אישור - בדיקות רעש', description: 'פרויקט נפתח, טכנאי הוקצה, דד-ליין נקבע.', status: 'DONE', priority: 'HIGH', type: 'GENERAL', dueInDays: -3, dueHour: '09:00', customerName: 'ענבל לוי', leadName: 'אתי גרוס', projectName: 'בדיקות רעש למערכות מיזוג בבניין משרדים' },

    // ── 3 QUOTE FOLLOWUP tasks ──
    { title: 'פולואפ הצעה - מיגון קרינה לחדר שנאים', description: 'הצעה ב-11,800 ש"ח נשלחה. הלקוח ביקש אישור מהמזמין.', status: 'IN_PROGRESS', priority: 'HIGH', type: 'QUOTE_PREPARATION', dueInDays: 1, dueHour: '11:00', customerName: 'אוסם הנדסה תשתיות', leadName: 'אלון ברנע', projectName: 'מיגון קרינה לחדר שנאים' },
    { title: 'פולואפ הצעה - ניטור איכות אוויר במפעל', description: 'הצעה נדחתה, הלקוח ביקש הצעה מעודכנת עם הנחה. להכין גרסה 2.', status: 'OPEN', priority: 'MEDIUM', type: 'QUOTE_PREPARATION', dueInDays: 3, dueHour: '14:00', customerName: 'טכנו-מד תעשיות', leadName: 'רון יעקובי', projectName: null },
    { title: 'תזכורת פנימית - לסגור הצעה ללקוח סקר אסבסט', description: 'הצעה טרם נשלחה. צריך לסיים מפרט ולשלוח השבוע.', status: 'OPEN', priority: 'URGENT', type: 'QUOTE_PREPARATION', dueInDays: 2, dueHour: '09:00', customerName: 'אורן בנייה ויזמות', leadName: 'עומר פרנק', projectName: 'סקר אסבסט לפני פירוק גג' },

    // ── 30 NEW INQUIRY tasks (all GENERAL/OPEN = פנייה stage) ──
    { title: 'ליד חדש מפייסבוק – בדיקת קרינה ברעננה', description: 'פנייה מפייסבוק. מעוניין בבדיקת קרינה בדירה חדשה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '08:00', customerName: null, leadName: 'נדב שלום', projectName: null },
    { title: 'ליד מגוגל – רעש שכנים בכפר סבא', description: 'חיפשה בגוגל "בדיקת רעש כפר סבא". רעש ממזגן שכן.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '08:15', customerName: null, leadName: 'הדס אורן', projectName: null },
    { title: 'ליד מהאתר – בדיקת ראדון בהרצליה', description: 'מילא טופס באתר. דירת קרקע, חושש מראדון.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '08:30', customerName: null, leadName: 'עידו רם', projectName: null },
    { title: 'ליד מ-WhatsApp – איכות אוויר במשרד בתל אביב', description: 'שלח הודעה ב-WhatsApp. ריח מוזר ממיזוג.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '08:45', customerName: null, leadName: 'ליאור כהן', projectName: null },
    { title: 'ליד מהמלצה – עובש בדירה ברמת גן', description: 'הופנתה ע"י חברה. עובש בחדר רחצה וחדר שינה.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '09:00', customerName: null, leadName: 'מורן דוד', projectName: null },
    { title: 'ליד מגוגל – דוח אקוסטי להיתר בנתניה', description: 'קבלן צריך דוח אקוסטי לוועדה המקומית.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '09:15', customerName: null, leadName: 'אסף ברוש', projectName: null },
    { title: 'ליד מפייסבוק – בדיקת מים ביבנה', description: 'גרה עם באר פרטית, רוצה לבדוק איכות מים.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '09:30', customerName: null, leadName: 'שירלי גבע', projectName: null },
    { title: 'לקוח חוזר – מדידת קרינה בירושלים', description: 'לקוח חוזר, רוצה מדידה אחרי שינויי תשתית חשמל.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '09:45', customerName: null, leadName: 'גל עוז', projectName: null },
    { title: 'ליד מהאתר – רעש מזגן בפתח תקווה', description: 'רעש מזגן מרכזי מטריד בשעות הלילה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '10:00', customerName: null, leadName: 'יעל מזור', projectName: null },
    { title: 'ליד משותף – בדיקות אקוסטיות בהוד השרון', description: 'קבלן שותף, צריך בדיקות ל-3 בניינים.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '10:15', customerName: null, leadName: 'דביר אלוני', projectName: null },
    { title: 'ליד מפייסבוק – ראדון ברעננה', description: 'שמעה על סכנת ראדון, רוצה בדיקה לפני אכלוס.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '10:30', customerName: null, leadName: 'נועה פלד', projectName: null },
    { title: 'ליד מגוגל – ניטור איכות אוויר בתל אביב', description: 'דורש ניטור שוטף ב-3 קומות במגדל משרדים.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '10:45', customerName: null, leadName: 'רועי חזן', projectName: null },
    { title: 'ליד מהמלצה – בדיקות לבית ספר בכפר סבא', description: 'הורים לוחצים. בדיקת קרינה ורעש בכיתות.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '11:00', customerName: null, leadName: 'טלי שגב', projectName: null },
    { title: 'ליד מ-WhatsApp – ריח חריג בהרצליה', description: 'ריח ביוב חזק בחדר שינה. מבקש בדיקה דחופה.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '11:15', customerName: null, leadName: 'אורי נווה', projectName: null },
    { title: 'ליד מגוגל – דיגום עובש ברמת גן', description: 'כתמי עובש על הקירות. מבקשת דוח לביטוח.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '11:30', customerName: null, leadName: 'דנה אשכנזי', projectName: null },
    { title: 'ליד משותף – קרינה לפני בנייה בנתניה', description: 'יזם שצריך בדיקת קרינה לפני תחילת חפירות.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '11:45', customerName: null, leadName: 'עמית זהבי', projectName: null },
    { title: 'ליד מפייסבוק – בדיקת מים ביבנה', description: 'מים עם טעם מוזר מהברז. רוצה בדיקה מקיפה.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '12:00', customerName: null, leadName: 'קרן אביב', projectName: null },
    { title: 'ליד מהאתר – רעש תשתיות בירושלים', description: 'רעש רציף מצנרת או מערכת חימום מרכזית.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '12:15', customerName: null, leadName: 'תום רוזן', projectName: null },
    { title: 'ליד מגוגל – ניטור פליטות למפעל בפתח תקווה', description: 'ממונה בטיחות דורש דוח תקופתי.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '12:30', customerName: null, leadName: 'מיכאל פרץ', projectName: null },
    { title: 'ליד מהמלצה – רעש בדירה חדשה בהוד השרון', description: 'נכנסה לדירה חדשה ושומעת רעש מהדירה מעל.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '12:45', customerName: null, leadName: 'שני לוי', projectName: null },
    { title: 'ליד מ-WhatsApp – ריח במשרד בתל אביב', description: 'ריח חריג מאזור המטבחון. עובדים מתלוננים.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '13:00', customerName: null, leadName: 'יונתן בר', projectName: null },
    { title: 'לקוחה חוזרת – קרינה ברעננה', description: 'רוצה בדיקה חוזרת אחרי הקמת אנטנה חדשה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '13:15', customerName: null, leadName: 'עדי סער', projectName: null },
    { title: 'ליד משותף – דוח אקוסטי דחוף בנתניה', description: 'קבלן צריך דוח אקוסטי דחוף להגשת היתר.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '13:30', customerName: null, leadName: 'איתי גולן', projectName: null },
    { title: 'ליד מפייסבוק – ראדון בירושלים', description: 'קראה כתבה על ראדון, גרה בקומת קרקע.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '13:45', customerName: null, leadName: 'רותם ניר', projectName: null },
    { title: 'ליד מהמלצה – בדיקות לבי"ס בכפר סבא', description: 'מנהלת בית ספר. הורים דורשים בדיקות קרינה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '14:00', customerName: null, leadName: 'מעיין שפירא', projectName: null },
    { title: 'ליד מגוגל – מים תעשייתית בהרצליה', description: 'מפעל עם מערכת מיחזור מים, צריך בדיקת תקינות.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '14:15', customerName: null, leadName: 'אלעד טל', projectName: null },
    { title: 'ליד מהאתר – רעש מזגן מרכזי ברמת גן', description: 'מזגן מרכזי בבניין גורם לרעידות.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '14:30', customerName: null, leadName: 'ליהי קדם', projectName: null },
    { title: 'ליד מ-WhatsApp – עובש בבניין בפתח תקווה', description: 'מנהל נכסים. עובש חוזר ב-3 דירות בבניין.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '14:45', customerName: null, leadName: 'ניר אדם', projectName: null },
    { title: 'ליד מפייסבוק – איכות אוויר בהוד השרון', description: 'ילד אסטמטי. רוצה לוודא שהאוויר בבית תקין.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '15:00', customerName: null, leadName: 'שיר ארזי', projectName: null },
    { title: 'ליד מגוגל – אקוסטיקה למסחרי בתל אביב', description: 'צריך דוח אקוסטי לרישוי עסק במרכז מסחרי.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '15:15', customerName: null, leadName: 'אופיר יוסף', projectName: null },

    // ── 20 ADDITIONAL inquiry tasks ──
    { title: 'ליד מגוגל – קרינה בחיפה', description: 'אנטנה סלולרית ליד הבניין. רוצה בדיקת קרינה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '15:30', customerName: null, leadName: 'אורן דגן', projectName: null },
    { title: 'ליד מפייסבוק – רעש מתעשייה בראשון לציון', description: 'רעש ממפעל סמוך מטריד בשעות הלילה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '15:45', customerName: null, leadName: 'ליאת מור', projectName: null },
    { title: 'ליד משותף – דוח אקוסטי בבאר שבע', description: 'קבלן צריך דוח אקוסטי לפרויקט חדש בבאר שבע.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '16:00', customerName: null, leadName: 'בועז קריף', projectName: null },
    { title: 'ליד מהאתר – עובש ברחובות', description: 'עובש חוזר בחדר ילדים למרות טיפולים קודמים.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '08:00', customerName: null, leadName: 'הילה עמר', projectName: null },
    { title: 'ליד מ-WhatsApp – ראדון באשדוד', description: 'דירת קרקע, חושש מריכוז ראדון גבוה.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '08:15', customerName: null, leadName: 'תמיר חן', projectName: null },
    { title: 'ליד מגוגל – איכות אוויר בגבעתיים', description: 'עובדים מדווחים על עייפות וכאבי ראש במשרד.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '08:30', customerName: null, leadName: 'סיגל הראל', projectName: null },
    { title: 'ליד מהמלצה – רעש מזגן בחולון', description: 'מזגן חיצוני של שכן רועש מאוד.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '08:45', customerName: null, leadName: 'אייל פישר', projectName: null },
    { title: 'ליד מפייסבוק – בדיקת מים במודיעין', description: 'מים עכורים מהברז אחרי עבודות תשתית.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '09:00', customerName: null, leadName: 'נטע שמעון', projectName: null },
    { title: 'ליד משותף – אקוסטיקה ברמת השרון', description: 'מהנדס צריך בדיקות אקוסטיות לפרויקט של 4 בניינים.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '09:15', customerName: null, leadName: 'דרור בן דוד', projectName: null },
    { title: 'ליד מגוגל – קרינה סלולרית באילת', description: 'אנטנה חדשה על גג הבניין, רוצה למדוד קרינה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '09:30', customerName: null, leadName: 'ענבר צור', projectName: null },
    { title: 'לקוח חוזר – עובש בבניין באשקלון', description: 'עובש בלובי ובמרתף בניין שהוא מנהל.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '09:45', customerName: null, leadName: 'יגאל נוי', projectName: null },
    { title: 'ליד מהאתר – ריח חריג בחיפה', description: 'ריח חריג מחדר המדרגות חודר לדירה.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '10:00', customerName: null, leadName: 'רונית גלעד', projectName: null },
    { title: 'ליד מ-WhatsApp – רעש בדירה חדשה בראשון לציון', description: 'נכנס לדירה חדשה, רעשים ממערכות הבניין.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '10:15', customerName: null, leadName: 'עמרי שלו', projectName: null },
    { title: 'ליד מגוגל – בדיקות למרפאה ברחובות', description: 'צריכה בדיקות סביבתיות לחידוש רישיון מרפאה.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '10:30', customerName: null, leadName: 'אפרת רוזנפלד', projectName: null },
    { title: 'ליד מפייסבוק – ראדון בבאר שבע', description: 'בנה בית חדש, רוצה בדיקת ראדון לפני אכלוס.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '10:45', customerName: null, leadName: 'גיא אשר', projectName: null },
    { title: 'ליד מהמלצה – איכות אוויר בגבעתיים', description: 'הופנתה מרופאה. חשד לזיהום אוויר בדירה.', status: 'OPEN', priority: 'URGENT', type: 'GENERAL', dueInDays: 0, dueHour: '11:00', customerName: null, leadName: 'מיטל אריאלי', projectName: null },
    { title: 'ליד משותף – קרינה לפני בנייה בחולון', description: 'יזם צריך בדיקת קרינה סביבתית לפרויקט חדש.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '11:15', customerName: null, leadName: 'נדב ברק', projectName: null },
    { title: 'ליד מהאתר – רעש תשתיות במודיעין', description: 'רעש ממערכת מים חמים מרכזית בבניין.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '11:30', customerName: null, leadName: 'שלומית ויס', projectName: null },
    { title: 'ליד מגוגל – ניטור פליטות ברמת השרון', description: 'ממונה סביבה דורש דוח שנתי לפליטות.', status: 'OPEN', priority: 'HIGH', type: 'GENERAL', dueInDays: 0, dueHour: '11:45', customerName: null, leadName: 'רז כרמל', projectName: null },
    { title: 'ליד מפייסבוק – בדיקת מים באשקלון', description: 'מים עם צבע חלודה מהברז. רוצה בדיקה מקיפה.', status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', dueInDays: 0, dueHour: '12:00', customerName: null, leadName: 'דקלה יפרח', projectName: null },
  ] as const;

  // Delete old demo tasks (by title match) before re-seeding
  const existingDemoTitles = tasksDemo.map((t) => t.title);
  await prisma.task.deleteMany({ where: { title: { in: existingDemoTitles } } });

  let createdTasks = 0;
  for (let i = 0; i < tasksDemo.length; i += 1) {
    const t = tasksDemo[i];
    const ownerId = pickAssignee(i);
    if (!ownerId) continue;
    const customerId = t.customerName ? (customerIdByName.get(t.customerName) ?? null) : null;
    const leadId = t.leadName ? (leadIdByFullName.get(t.leadName) ?? null) : null;
    const projectId = t.projectName ? (projectIdByName.get(t.projectName) ?? null) : null;

    const dueBase = new Date(now + t.dueInDays * 86400000);
    const [hh, mm] = (t.dueHour || '09:00').split(':').map(Number);
    dueBase.setHours(hh, mm, 0, 0);

    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        status: t.status as any,
        priority: t.priority as any,
        type: t.type as any,
        dueDate: dueBase,
        ownerId,
        customerId,
        leadId,
        projectId,
      },
    });
    createdTasks += 1;
  }

  // ── דוחות שנשלחו + סטטוס תשלום (נתוני הדגמה לדשבורד) ──
  const reportPayTasksDemo = [
    { title: 'SEED:דוח קרינה - יואב כהן', customerName: 'יואב כהן', daysAgo: 5, paid: true, paidDaysAgo: 2 },
    { title: 'SEED:דוח אקוסטיקה - ענבל לוי', customerName: 'ענבל לוי', daysAgo: 12, paid: true, paidDaysAgo: 7 },
    { title: 'SEED:דוח אקוסטי - קבוצת שקד הנדסה', customerName: 'קבוצת שקד הנדסה בע"מ', daysAgo: 20, paid: true, paidDaysAgo: 14 },
    { title: 'SEED:דוח ראדון - לירון כהן', customerName: 'לירון כהן', daysAgo: 28, paid: true, paidDaysAgo: 22 },
    { title: 'SEED:דוח אסבסט - אורן בנייה', customerName: 'אורן בנייה ויזמות', daysAgo: 8, paid: false, paidDaysAgo: 0 },
    { title: 'SEED:דוח ליווי סביבתי - הדר ניהול', customerName: 'הדר ניהול פרויקטים', daysAgo: 15, paid: false, paidDaysAgo: 0 },
    { title: 'SEED:דוח מיגון קרינה - אוסם הנדסה', customerName: 'אוסם הנדסה תשתיות', daysAgo: 22, paid: false, paidDaysAgo: 0 },
    { title: 'SEED:דוח עובש - אחוזת כרמל', customerName: 'אחוזת כרמל ניהול', daysAgo: 3, paid: false, paidDaysAgo: 0 },
    { title: 'SEED:דוח רעש - עיריית נס ציונה', customerName: 'עיריית נס ציונה', daysAgo: 35, paid: true, paidDaysAgo: 28 },
    { title: 'SEED:דוח איכות אוויר - מרכז רפואי גליל ים', customerName: 'מרכז רפואי גליל ים', daysAgo: 18, paid: false, paidDaysAgo: 0 },
  ] as const;

  await prisma.task.deleteMany({ where: { title: { in: reportPayTasksDemo.map((t) => t.title) } } });

  for (let i = 0; i < reportPayTasksDemo.length; i += 1) {
    const t = reportPayTasksDemo[i];
    const ownerId = pickAssignee(i);
    if (!ownerId) continue;
    const customerId = customerIdByName.get(t.customerName) ?? null;
    const sentDate = new Date(now - t.daysAgo * 86400000).toISOString();
    const notes: { text: string; at: string }[] = [];
    if (t.paid && t.paidDaysAgo > 0) {
      notes.push({ text: '💰 סומן כשולם', at: new Date(now - t.paidDaysAgo * 86400000).toISOString() });
    }
    notes.push({ text: '📄 דוח נשלח ללקוח — ' + (t.paid ? 'שולם ✅' : 'טרם שולם'), at: sentDate });
    await prisma.task.create({
      data: {
        title: t.title,
        status: t.paid ? ('DONE' as any) : ('OPEN' as any),
        priority: 'MEDIUM' as any,
        type: 'step7',
        dueDate: new Date(now - t.daysAgo * 86400000),
        ownerId,
        customerId,
        processNotes: JSON.stringify(notes),
      },
    });
  }

  console.log(
    `Seed completed successfully (customers created: ${createdCustomers}, leads created: ${createdLeads}, projects created: ${createdProjects}, quotes created: ${createdQuotes}, tasks created: ${createdTasks}, report-pay tasks: ${reportPayTasksDemo.length})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });