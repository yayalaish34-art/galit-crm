import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { formatIsraeliPhone, formatPhoneFields } from '../common/phone.util';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { extractSignedQuoteInfo } from './signed-quote-total.util';
import type {
  CreateCustomerDocumentDto,
  CreateManualIncomeDto,
  CreateSignedQuoteDto,
  ParseSignedQuoteDto,
  ReplaceAdditionalDataDto,
  ReplaceBlocksDto,
  ReplaceExternalDataDto,
  ReplaceQuestionnairesDto,
  ReplaceReferralSourcesDto,
  ReplaceRelationsDto,
  UpdateCustomerDocumentDto,
  UpdateCustomerDto,
} from './dto/update-customer.dto';

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalDecimal(v: unknown): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  try {
    return new Prisma.Decimal(String(v));
  } catch {
    return null;
  }
}

function parseDocumentType(v: unknown): DocumentType {
  const s = String(v || '').toUpperCase() as DocumentType;
  if (Object.values(DocumentType).includes(s)) return s;
  return DocumentType.OTHER;
}

/** מבין כמה רשומות של אותו לקוח — המלאה ביותר, ובתיקו הוותיקה (הרשימה ממוינת asc). */
function pickFullest<T extends { phone?: string | null; email?: string | null }>(candidates: T[]): T {
  const score = (c: T) => (c.phone ? 2 : 0) + (c.email ? 1 : 0);
  return candidates.reduce((a, b) => (score(b) > score(a) ? b : a), candidates[0]);
}

/** מרחק עריכה (Levenshtein). עוצר מוקדם ברגע שברור שחרגנו מהסף. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // כל השורה כבר מעבר לסף — אין טעם להמשיך
    prev = cur;
  }
  return prev[b.length];
}

/**
 * האם שני השמות נבדלים בשגיאת כתיב בלבד ("תומר גולפדר" מול "תומר גולדפדר")?
 *
 * מכוון בכוונה **צר**: איחוד שני לקוחות אמיתיים אינו הפיך, ולכן עדיף להחמיץ
 * כפילות מאשר למזג בטעות. שני תנאים במצטבר:
 *   • לכל היותר 2 עריכות, וגם
 *   • לכל היותר 20% מאורך השם — כך ששמות קצרים מוגנים ("משה" מול "מזה" נדחה,
 *     יחס 0.33), ושם שהוא הרחבה של אחר ("אורי" מול "אורי יעקב") נדחה גם הוא.
 *
 * ובנוסף — ספרות חייבות להיות זהות. "פיצה פיאצה" מול "פיצה פיאצה 2" הן שני
 * **סניפים** נפרדים, לא שגיאת כתיב; בלי התנאי הזה מרחק העריכה (2) היה ממזג אותן.
 */
function isTypoOf(a: unknown, b: unknown): boolean {
  const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // מספר בשם מבדיל סניף/אתר — לעולם לא "שגיאת כתיב".
  const digitsOf = (s: string) => (s.match(/[0-9]+/g) || []).join(',');
  if (digitsOf(x) !== digitsOf(y)) return false;
  const maxLen = Math.max(x.length, y.length);
  const d = editDistance(x, y, 2);
  return d <= 2 && d / maxLen <= 0.2;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphMail: GraphMailService,
  ) {}

  private static readonly PRESET_CLASSIFICATION_CODES = new Set(['POTENTIAL', 'COMPANY', 'PUBLIC', 'PRIVATE']);

  // ── בקשות מ-Outlook: שליפת מיילים אחרונים + צירוף מייל לכרטיס הלקוח ──

  /** 20 המיילים האחרונים מתיבת ה-Outlook של העובד המחובר — לבחירה ידנית לצירוף. */
  async listRecentInboxForUser(userId: string, top = 20) {
    if (!userId) throw new BadRequestException('משתמש לא מזוהה');
    return this.graphMail.listRecentInbox(userId, top);
  }

  /**
   * רשימת המיילים שתויקו לכרטיס, מהחדש לישן, כשלכל מייל מצורפות הצרופות שלו.
   *
   * הצרופות נשמרות כ-Document רגיל של הלקוח (filePath = `outlook-attachment:<requestId>`),
   * ולכן הן גם מופיעות בטאב "מסמכים" — אבל בלי הקישור הזה אי אפשר לדעת מאיזה מייל
   * הן הגיעו, והמייל נראה כאילו נשמר בלי הקבצים.
   *
   * dataBase64 *לא* נכלל כאן בכוונה: רשימה של מיילים עם קבצים מוטמעים מגיעה בקלות
   * לעשרות MB ומפילה את ה-endpoint ב-RangeError. התוכן נשלף פר-קובץ בלחיצה.
   */
  async listEmailRequests(customerId: string) {
    const requests = await (this.prisma as any).customerEmailRequest.findMany({
      where: { customerId },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!requests.length) return requests;

    const docs = await this.prisma.document.findMany({
      where: { customerId, filePath: { startsWith: 'outlook-attachment:' } },
      select: { id: true, name: true, mimeType: true, sizeBytes: true, filePath: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byRequest = new Map<string, Array<Record<string, unknown>>>();
    for (const d of docs) {
      const requestId = String(d.filePath || '').slice('outlook-attachment:'.length);
      if (!requestId) continue;
      if (!byRequest.has(requestId)) byRequest.set(requestId, []);
      byRequest.get(requestId)!.push({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
      });
    }

    return requests.map((r: any) => ({ ...r, attachments: byRequest.get(r.id) || [] }));
  }

  /**
   * מסמך בודד *עם* התוכן — לצפייה בקובץ מצורף בלי למשוך את כל מסמכי הלקוח.
   * (רשימת המסמכים מחזירה dataBase64 לכל שורה; בלקוח עם עשרות קבצים זו הורדה
   * של עשרות MB רק כדי לפתוח קובץ אחד.)
   */
  async getCustomerDocument(customerId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, customerId },
    });
    if (!doc) throw new NotFoundException('המסמך לא נמצא');
    return doc;
  }

  /**
   * מצרף מייל מ-Outlook כ"בקשה" לכרטיס הלקוח. שולף מחדש את 20 האחרונים מהתיבה של
   * העובד ומאתר את המייל שנבחר לפי graphMessageId — כדי לא לסמוך על גוף שנשלח מהלקוח.
   * דדופ: אם אותו מייל כבר צורף לאותו לקוח — מחזיר את הרשומה הקיימת.
   */
  async attachEmailRequest(
    customerId: string,
    messageId: string,
    user?: { id?: string; name?: string },
  ) {
    if (!customerId) throw new BadRequestException('מזהה לקוח חסר');
    if (!messageId) throw new BadRequestException('יש לבחור מייל לצירוף');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('הלקוח לא נמצא');

    const inbox = await this.graphMail.listRecentInbox(user?.id || '', 20);
    const msg = inbox.find((m) => m.id === messageId);
    if (!msg) throw new BadRequestException('המייל לא נמצא ברשימת המיילים האחרונים — רענן ונסה שוב');

    // שם המצרף — נשלף מה-DB (req.user מחזיק id/role בלבד).
    const attacherName =
      user?.name ||
      (user?.id
        ? (await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }))?.name
        : null) ||
      null;

    // דדופ לפי graphMessageId (או internetMessageId) לאותו לקוח.
    const existing = await (this.prisma as any).customerEmailRequest.findFirst({
      where: {
        customerId,
        OR: [
          { graphMessageId: msg.id },
          ...(msg.internetMessageId ? [{ internetMessageId: msg.internetMessageId }] : []),
        ],
      },
    });
    if (existing) return existing;

    return (this.prisma as any).customerEmailRequest.create({
      data: {
        customerId,
        graphMessageId: msg.id || null,
        internetMessageId: msg.internetMessageId || null,
        subject: msg.subject || null,
        fromName: msg.fromName || null,
        fromEmail: msg.fromEmail || null,
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
        bodyText: msg.bodyText || null,
        attachedByUserId: user?.id || null,
        attachedByName: attacherName,
      },
    });
  }

  /** מחיקת בקשה שתויקה. */
  async deleteEmailRequest(customerId: string, requestId: string) {
    const row = await (this.prisma as any).customerEmailRequest.findUnique({ where: { id: requestId } });
    if (!row || row.customerId !== customerId) throw new NotFoundException('הבקשה לא נמצאה');
    await (this.prisma as any).customerEmailRequest.delete({ where: { id: requestId } });
    return { ok: true };
  }

  private async assertClassificationCode(code: string | undefined) {
    if (code == null || code === '') {
      throw new BadRequestException('סיווג לקוח הוא שדה חובה');
    }
    // Preset codes are always valid — no DB round-trip needed
    if (CustomersService.PRESET_CLASSIFICATION_CODES.has(code)) return;

    try {
      const row = await this.prisma.customerClassification.findUnique({ where: { code } });
      if (!row) throw new BadRequestException('סיווג לא תקין');
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<{ code: string }[]>(
          `SELECT "code" FROM "CustomerClassification" WHERE "code" = $1 LIMIT 1`,
          code,
        );
        if (rows.length === 0) throw new BadRequestException('סיווג לא תקין');
      } else {
        throw e;
      }
    }
  }

  private applyCustomerPatch(dto: UpdateCustomerDto): Prisma.CustomerUpdateInput {
    const out: Prisma.CustomerUpdateInput = {};

    if (dto.name !== undefined) out.name = dto.name ?? '';
    if (dto.companyname !== undefined) out.companyname = dto.companyname;
    if (dto.type !== undefined) out.type = dto.type ?? '';
    if (dto.contactName !== undefined) out.contactName = dto.contactName ?? '';
    if (dto.phone !== undefined) out.phone = formatIsraeliPhone(dto.phone);
    if (dto.email !== undefined) out.email = dto.email ?? '';
    if (dto.city !== undefined) out.city = dto.city ?? '';
    if (dto.address !== undefined) out.address = dto.address;
    if (dto.status !== undefined) out.status = dto.status;
    if (dto.services !== undefined) out.services = dto.services;
    if (dto.notes !== undefined) out.notes = dto.notes;
    if (dto.leadSource !== undefined) out.leadSource = dto.leadSource;
    if (dto.phone2 !== undefined) out.phone2 = dto.phone2 == null ? dto.phone2 : formatIsraeliPhone(dto.phone2);
    if (dto.phone3 !== undefined) out.phone3 = dto.phone3 == null ? dto.phone3 : formatIsraeliPhone(dto.phone3);
    if (dto.fax !== undefined) out.fax = dto.fax == null ? dto.fax : formatIsraeliPhone(dto.fax);
    if (dto.website !== undefined) out.website = dto.website;
    if (dto.companyRegNumber !== undefined) out.companyRegNumber = dto.companyRegNumber;
    if (dto.internalNotes !== undefined) out.internalNotes = dto.internalNotes;
    if (dto.balanceLegacy !== undefined) out.balanceLegacy = parseOptionalDecimal(dto.balanceLegacy);
    if (dto.birthdayLegacy !== undefined) out.birthdayLegacy = parseOptionalDate(dto.birthdayLegacy);
    if (dto.cityCodeLegacy !== undefined) out.cityCodeLegacy = dto.cityCodeLegacy;
    if (dto.zipLegacy !== undefined) out.zipLegacy = dto.zipLegacy;
    if (dto.legacyUpdatedAt !== undefined) out.legacyUpdatedAt = parseOptionalDate(dto.legacyUpdatedAt);
    if (dto.importLegacyId !== undefined) out.importLegacyId = dto.importLegacyId;

    if (dto.legacyAccountNumber !== undefined) out.legacyAccountNumber = dto.legacyAccountNumber;
    if (dto.legacySubClassificationCode !== undefined) out.legacySubClassificationCode = dto.legacySubClassificationCode;
    if (dto.salesRepresentative !== undefined) out.salesRepresentative = dto.salesRepresentative;
    if (dto.functionalLabel !== undefined) out.functionalLabel = dto.functionalLabel;
    if (dto.customerSize !== undefined) out.customerSize = dto.customerSize;
    if (dto.managementProfile !== undefined) out.managementProfile = dto.managementProfile;
    if (dto.countryOrRegion !== undefined) out.countryOrRegion = dto.countryOrRegion;

    if (dto.mailingAddress !== undefined) out.mailingAddress = dto.mailingAddress;
    if (dto.mailingCity !== undefined) out.mailingCity = dto.mailingCity;
    if (dto.mailingZip !== undefined) out.mailingZip = dto.mailingZip;
    if (dto.mailingPoBox !== undefined) out.mailingPoBox = dto.mailingPoBox;
    if (dto.mailingInvalidField !== undefined) out.mailingInvalidField = dto.mailingInvalidField;
    if (dto.allowMail !== undefined) out.allowMail = dto.allowMail;
    if (dto.allowFax !== undefined) out.allowFax = dto.allowFax;
    if (dto.allowEmail !== undefined) out.allowEmail = dto.allowEmail;
    if (dto.allowSms !== undefined) out.allowSms = dto.allowSms;
    if (dto.mailingNote !== undefined) out.mailingNote = dto.mailingNote;

    if (dto.registrationDate !== undefined) out.registrationDate = parseOptionalDate(dto.registrationDate);
    if (dto.registrationNote !== undefined) out.registrationNote = dto.registrationNote;
    if (dto.lastUpdateDate !== undefined) out.lastUpdateDate = parseOptionalDate(dto.lastUpdateDate);
    if (dto.lastUpdateNote !== undefined) out.lastUpdateNote = dto.lastUpdateNote;
    if (dto.lastUpdatedBy !== undefined) out.lastUpdatedBy = dto.lastUpdatedBy;

    if (dto.priceList !== undefined) out.priceList = dto.priceList;
    if (dto.roundedPricing !== undefined) out.roundedPricing = dto.roundedPricing;
    if (dto.employeeCount !== undefined) out.employeeCount = dto.employeeCount;
    if (dto.managementCustomerLabel !== undefined) out.managementCustomerLabel = dto.managementCustomerLabel;
    if (dto.financialNumber1 !== undefined) out.financialNumber1 = dto.financialNumber1;
    if (dto.financialNumber2 !== undefined) out.financialNumber2 = dto.financialNumber2;
    if (dto.financialNumber2Large !== undefined) out.financialNumber2Large = dto.financialNumber2Large;
    if (dto.financialNumber3 !== undefined) out.financialNumber3 = dto.financialNumber3;
    if (dto.financeToken !== undefined) out.financeToken = dto.financeToken;
    if (dto.financeTokenDate !== undefined) out.financeTokenDate = parseOptionalDate(dto.financeTokenDate);
    if (dto.financeTokenActive !== undefined) out.financeTokenActive = dto.financeTokenActive;
    if (dto.financeUnnamed1 !== undefined) out.financeUnnamed1 = dto.financeUnnamed1;
    if (dto.financeUnnamed2 !== undefined) out.financeUnnamed2 = dto.financeUnnamed2;
    if (dto.financeUnnamed3 !== undefined) out.financeUnnamed3 = dto.financeUnnamed3;
    if (dto.financeUnnamed4 !== undefined) out.financeUnnamed4 = dto.financeUnnamed4;
    if (dto.totalPurchases !== undefined) out.totalPurchases = parseOptionalDecimal(dto.totalPurchases);
    if (dto.totalSales !== undefined) out.totalSales = parseOptionalDecimal(dto.totalSales);
    if (dto.percentageValue !== undefined) out.percentageValue = parseOptionalDecimal(dto.percentageValue);
    if (dto.paymentTerms !== undefined) out.paymentTerms = dto.paymentTerms;
    if (dto.creditDays !== undefined) out.creditDays = dto.creditDays;
    if (dto.creditEnabled !== undefined) out.creditEnabled = dto.creditEnabled;
    if (dto.creditNumber !== undefined) out.creditNumber = dto.creditNumber;
    if (dto.creditExpiry !== undefined) out.creditExpiry = dto.creditExpiry;

    if (dto.microwaveModel !== undefined) out.microwaveModel = dto.microwaveModel;
    if (dto.detectorLocation !== undefined) out.detectorLocation = dto.detectorLocation;
    if (dto.companyAmount !== undefined) out.companyAmount = dto.companyAmount;
    if (dto.feature7 !== undefined) out.feature7 = dto.feature7;
    if (dto.detailDate1 !== undefined) out.detailDate1 = parseOptionalDate(dto.detailDate1);
    if (dto.detailDate2 !== undefined) out.detailDate2 = parseOptionalDate(dto.detailDate2);
    if (dto.detailDate3 !== undefined) out.detailDate3 = parseOptionalDate(dto.detailDate3);
    if (dto.detailDate4 !== undefined) out.detailDate4 = parseOptionalDate(dto.detailDate4);
    if (dto.detectorModel !== undefined) out.detectorModel = dto.detectorModel;
    if (dto.feature4 !== undefined) out.feature4 = dto.feature4;
    if (dto.companyWall !== undefined) out.companyWall = dto.companyWall;
    if (dto.feature8 !== undefined) out.feature8 = dto.feature8;

    if (dto.notRelevantReason !== undefined) out.notRelevantReason = dto.notRelevantReason;
    if (dto.notRelevantNote !== undefined) out.notRelevantNote = dto.notRelevantNote;
    if (dto.notRelevantAt !== undefined) out.notRelevantAt = parseOptionalDate(dto.notRelevantAt);

    return out;
  }

  /** לקוחות שסווגו כ"לא רלוונטי" — לרשימה המקובצת לפי סיבה. */
  async listNotRelevant() {
    return this.prisma.customer.findMany({
      where: { notRelevantReason: { not: null } },
      select: {
        id: true,
        name: true,
        contactName: true,
        phone: true,
        email: true,
        city: true,
        services: true,
        notRelevantReason: true,
        notRelevantNote: true,
        notRelevantAt: true,
      },
      orderBy: { notRelevantAt: 'desc' },
      take: 2000,
    });
  }

  async findAll() {
    try {
      return await this.prisma.customer.findMany({ orderBy: { name: 'asc' } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        return this.prisma.$queryRawUnsafe(`SELECT * FROM "Customer"`);
      }
      throw e;
    }
  }

  async findPaged(pageIn?: number, limitIn?: number, q?: string, typeCode?: string) {
    const page = Math.max(1, pageIn ?? 1);
    const take = Math.min(200, Math.max(1, limitIn ?? 50));
    const skip = (page - 1) * take;
    const term = (q ?? '').trim();
    const typeTrim = (typeCode ?? '').trim();

    const where: Prisma.CustomerWhereInput = {};
    if (typeTrim) {
      where.type = typeTrim;
    }
    if (term) {
      // התאמת טלפון עמידה למפרידים: מפשיטים הכל חוץ מספרות מהחיפוש *ומהעמודה* ומשווים.
      // טלפונים מאוחסנים בפורמטים לא עקביים ("052-9243249" / "0529243249" / "052 924 3249"),
      // כך שחיפוש "0529243249" חייב למצוא "052-9243249" ולהיפך. `contains` לא יכול לשנות
      // את העמודה, לכן ההתאמה לפי ספרות רצה כ-SQL גולמי שמחזיר את מזהי הלקוחות התואמים.
      const digits = term.replace(/\D/g, '');
      const phoneDigits = digits.length >= 4 ? digits : ''; // שמירה מפני ריצת ספרות קצרה מדי
      const customerIdsByPhone = new Set<string>();
      if (phoneDigits) {
        try {
          const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM "Customer"
               WHERE regexp_replace(COALESCE(phone,''),  '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
                  OR regexp_replace(COALESCE(phone2,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
                  OR regexp_replace(COALESCE(phone3,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
               LIMIT 500`,
            phoneDigits,
          );
          for (const r of rows) customerIdsByPhone.add(r.id);
        } catch {
          /* best-effort — נפילה חזרה להתאמת contains הרגילה למטה */
        }
      }

      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { phone2: { contains: term, mode: 'insensitive' } },
        { phone3: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
        { companyRegNumber: { contains: term, mode: 'insensitive' } },
        ...(customerIdsByPhone.size ? [{ id: { in: [...customerIdsByPhone] } }] : []),
      ];
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.customer.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take,
        }),
        this.prisma.customer.count({ where }),
      ]);
      return { items, total, page, pageSize: take };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const all = await this.findAll();
        const arr = Array.isArray(all) ? all : [];
        const total = arr.length;
        const items = arr.slice(skip, skip + take);
        return { items, total, page, pageSize: take };
      }
      throw e;
    }
  }

  /**
   * חיפוש לקוח + אנשי קשר. מחזיר לכל לקוח תואם את רשימת אנשי הקשר שתאמו לחיפוש.
   * לקוח נכלל אם השדות שלו תאמו, או אם לאחד מאנשי הקשר שלו תאם שם/טלפון/נייד/מייל/תפקיד.
   * כך חברה כמו "אינטל" תימצא גם כשמחפשים לפי שם/טלפון של איש קשר ספציפי שלה.
   */
  async searchWithContacts(qIn?: string, limitIn?: number) {
    const term = (qIn ?? '').trim();
    const take = Math.min(100, Math.max(1, limitIn ?? 50));
    if (!term) return { customers: [] as any[] };

    // Phone matching is separator-agnostic: strip everything but digits from BOTH
    // the search term and the stored column, then compare. Stored phones are
    // wildly inconsistent (e.g. "050-6545356", "0506545356", "050 654 5356"), so
    // searching "050-6666666" must match "0506666666" and vice-versa. `contains`
    // can't transform the column, so the phone match runs as raw SQL that finds
    // the matching row IDs, which we OR into the Prisma queries below.
    const digits = term.replace(/\D/g, '');
    // Guard against a too-short digit run matching half the table (e.g. "05").
    const phoneDigits = digits.length >= 4 ? digits : '';

    const customerIdsByPhone = new Set<string>();
    const contactIdsByPhone = new Set<string>();
    if (phoneDigits) {
      // NOTE: Postgres POSIX regex does NOT support the `\D` shorthand — use the
      // explicit `[^0-9]` class to strip non-digits (verified against prod data).
      const [custRows, contactRows] = await Promise.all([
        this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "Customer"
             WHERE regexp_replace(COALESCE(phone,''),   '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
                OR regexp_replace(COALESCE(phone2,''),  '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
                OR regexp_replace(COALESCE(phone3,''),  '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
             LIMIT 200`,
          phoneDigits,
        ),
        this.prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "CustomerContact"
             WHERE regexp_replace(COALESCE(phone,''),  '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
                OR regexp_replace(COALESCE(mobile,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
             LIMIT 500`,
          phoneDigits,
        ),
      ]);
      for (const r of custRows) customerIdsByPhone.add(r.id);
      for (const r of contactRows) contactIdsByPhone.add(r.id);
    }

    // 1. אנשי קשר תואמים — כדי לצרף את הלקוחות שלהם ולהדגיש את איש הקשר התואם.
    const matchedContacts = await this.prisma.customerContact.findMany({
      where: {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { mobile: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { roleTitle: { contains: term, mode: 'insensitive' } },
          ...(contactIdsByPhone.size ? [{ id: { in: [...contactIdsByPhone] } }] : []),
        ],
      },
      orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
      take: 500,
    });

    // 2. לקוחות שתאמו ישירות (שם/איש קשר ראשי/טלפונים/מייל/עיר/כתובת/ח.פ/סימוכין).
    const directCustomers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { companyname: { contains: term, mode: 'insensitive' } },
          { contactName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { phone2: { contains: term, mode: 'insensitive' } },
          { phone3: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { address: { contains: term, mode: 'insensitive' } },
          { companyRegNumber: { contains: term, mode: 'insensitive' } },
          { importLegacyId: { contains: term, mode: 'insensitive' } },
          ...(customerIdsByPhone.size ? [{ id: { in: [...customerIdsByPhone] } }] : []),
        ],
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    // 3. איחוד: מזהי הלקוחות מכל שני המקורות.
    const contactsByCustomer = new Map<string, typeof matchedContacts>();
    for (const ct of matchedContacts) {
      const arr = contactsByCustomer.get(ct.customerId) ?? [];
      arr.push(ct);
      contactsByCustomer.set(ct.customerId, arr);
    }

    const customerIds = new Set<string>(directCustomers.map((c) => c.id));
    for (const id of contactsByCustomer.keys()) customerIds.add(id);

    // מביא לקוחות שהגיעו רק דרך התאמת איש קשר (ולא היו ב-directCustomers).
    const missingIds = [...contactsByCustomer.keys()].filter(
      (id) => !directCustomers.some((c) => c.id === id),
    );
    const extraCustomers = missingIds.length
      ? await this.prisma.customer.findMany({ where: { id: { in: missingIds } } })
      : [];

    const byId = new Map<string, any>();
    for (const c of [...directCustomers, ...extraCustomers]) byId.set(c.id, c);

    // 4. בונה תוצאה: לקוח + אנשי הקשר התואמים שלו (אם יש). ממוין לפי שם, מוגבל ל-take.
    const result = [...byId.values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'))
      .slice(0, take)
      .map((c) => ({
        ...c,
        matchedContacts: (contactsByCustomer.get(c.id) ?? []).map((ct) => ({
          id: ct.id,
          fullName: ct.fullName,
          phone: ct.phone,
          mobile: ct.mobile,
          email: ct.email,
          roleTitle: ct.roleTitle,
          isPrimary: ct.isPrimary,
        })),
      }));

    return { customers: result };
  }

  async findOne(id: string) {
    try {
      return await this.prisma.customer.findUnique({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "Customer" WHERE id = $1 LIMIT 1`,
          id,
        );
        return rows[0] ?? null;
      }
      throw e;
    }
  }

  async findFull(id: string) {
    try {
      const customer = await this.prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return null;
      }

      const [
        leads,
        quotes,
        tasks,
        reports,
        contacts,
        documents,
        referralSources,
        customerQuestionnaires,
        customerRelations,
        additionalDataRows,
        externalDataRows,
        blocks,
      ] = await Promise.all([
        this.prisma.lead.findMany({ where: { customerId: id } }),
        this.prisma.quote.findMany({ where: { customerId: id } }),
        this.prisma.task.findMany({ where: { customerId: id } }),
        this.prisma.report.findMany({ where: { customerId: id } }),
        this.prisma.customerContact.findMany({
          where: { customerId: id },
          orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
        }),
        this.prisma.document.findMany({
          where: { customerId: id },
          orderBy: { createdAt: 'desc' },
          // לא מחזירים כאן dataBase64 (כבד) — תוכן הקובץ נטען לפי דרישה דרך GET /documents
          select: {
            id: true, name: true, documentType: true, filePath: true,
            description: true, mimeType: true, sizeBytes: true, documentDate: true,
            createdAt: true, updatedAt: true, importLegacyId: true,
            projectId: true, customerId: true, reportId: true, uploadedById: true,
            uploadedBy: { select: { id: true, name: true, email: true } },
          },
        }),
        this.prisma.customerReferralSource.findMany({
          where: { customerId: id },
          orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.customerQuestionnaire.findMany({
          where: { customerId: id },
          orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.customerRelation.findMany({
          where: { customerId: id },
          orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.customerAdditionalDataRow.findMany({
          where: { customerId: id },
          orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.customerExternalDataRow.findMany({
          where: { customerId: id },
          orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.customerBlock.findMany({
          where: { customerId: id },
          orderBy: [{ channel: 'asc' }],
        }),
      ]);

      return {
        customer,
        leads,
        quotes,
        tasks,
        reports,
        contacts,
        documents,
        referralSources,
        questionnaires: customerQuestionnaires,
        relations: customerRelations,
        additionalDataRows,
        externalDataRows,
        blocks,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "Customer" WHERE id = $1 LIMIT 1`,
          id,
        );
        const row = rows[0];
        if (!row) return null;
        return {
          customer: row,
          leads: [],
          quotes: [],
          tasks: [],
          reports: [],
          contacts: [],
          documents: [],
          referralSources: [],
          questionnaires: [],
          relations: [],
          additionalDataRows: [],
          externalDataRows: [],
          blocks: [],
        };
      }
      throw e;
    }
  }

  async listContacts(customerId: string) {
    return this.prisma.customerContact.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
    });
  }

  async createContact(customerId: string, data: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new BadRequestException('לקוח לא נמצא');
    const legacy = (data?.importLegacyId || data?.legacyContactCode || '').toString().trim();
    const importLegacyId = legacy || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.prisma.customerContact.create({
      data: {
        customerId,
        importLegacyId,
        fullName: (data?.fullName || '').toString().trim() || 'איש קשר',
        phone: formatIsraeliPhone(data?.phone),
        mobile: formatIsraeliPhone(data?.mobile),
        fax: formatIsraeliPhone(data?.fax),
        email: (data?.email || '').toString().trim().toLowerCase(),
        address: (data?.address || '').toString().trim(),
        city: (data?.city || '').toString().trim(),
        zip: (data?.zip || '').toString().trim(),
        roleTitle: (data?.roleTitle || '').toString().trim() || null,
        department: (data?.department || '').toString().trim() || null,
        isPrimary: Boolean(data?.isPrimary),
        isActive: data?.isActive === undefined ? true : Boolean(data?.isActive),
        notes: (data?.notes || '').toString().trim() || null,
      },
    });
  }

  async updateContact(customerId: string, contactId: string, data: any) {
    const existing = await this.prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
      select: { id: true },
    });
    if (!existing) throw new BadRequestException('איש קשר לא נמצא עבור לקוח זה');
    return this.prisma.customerContact.update({
      where: { id: contactId },
      data: {
        fullName: data?.fullName !== undefined ? (data.fullName || '').toString().trim() || 'איש קשר' : undefined,
        phone: data?.phone !== undefined ? formatIsraeliPhone(data.phone) : undefined,
        mobile: data?.mobile !== undefined ? formatIsraeliPhone(data.mobile) : undefined,
        fax: data?.fax !== undefined ? formatIsraeliPhone(data.fax) : undefined,
        email: data?.email !== undefined ? (data.email || '').toString().trim().toLowerCase() : undefined,
        address: data?.address !== undefined ? (data.address || '').toString().trim() : undefined,
        city: data?.city !== undefined ? (data.city || '').toString().trim() : undefined,
        zip: data?.zip !== undefined ? (data.zip || '').toString().trim() : undefined,
        roleTitle: data?.roleTitle !== undefined ? (data.roleTitle || '').toString().trim() || null : undefined,
        department: data?.department !== undefined ? (data.department || '').toString().trim() || null : undefined,
        isPrimary: data?.isPrimary !== undefined ? Boolean(data.isPrimary) : undefined,
        isActive: data?.isActive !== undefined ? Boolean(data.isActive) : undefined,
        notes: data?.notes !== undefined ? (data.notes || '').toString().trim() || null : undefined,
      },
    });
  }

  async removeContact(customerId: string, contactId: string) {
    const existing = await this.prisma.customerContact.findFirst({
      where: { id: contactId, customerId },
      select: { id: true },
    });
    if (!existing) throw new BadRequestException('איש קשר לא נמצא עבור לקוח זה');
    await this.prisma.customerContact.delete({ where: { id: contactId } });
    return { ok: true };
  }

  async create(data: any) {
    await this.assertClassificationCode(data?.type);
    // כל מסלולי היצירה האוטומטית (שלבי הצינור, בוט הוואטסאפ, המרת ליד, resolve)
    // מגיעים לכאן — לכן זו הנקודה שמבטיחה שטלפון נשמר עם מקף.
    return this.prisma.customer.create({ data: formatPhoneFields({ ...(data || {}) }) });
  }

  /**
   * מאתר לקוח קיים לפי הפרטים הנתונים, ורק אם אין — יוצר חדש.
   *
   * **הבאג שזה מתקן:** שלבי הצינור יצרו לקוח בכל פעם שלמשימה עדיין לא היה
   * `customerId`, בלי לחפש קודם. לקוח קיים נפתח שוב ושוב כלקוח חדש. מקרה אמיתי:
   * "אורים הנדסת חשמל בע״מ" נוצר 9 פעמים ב-2026-08-02 בין 14:08 ל-14:28,
   * ו"משה" 4 פעמים ב-2026-08-04 בתוך 4 שניות.
   *
   * **למה טלפון לבדו אינו מספיק:** בנתונים האמיתיים טלפון אחד משותף לכמה
   * לקוחות שונים לגמרי — למשל ...522357357 מופיע אצל 7 חברות נפרדות (מספר של
   * יועץ/מפקח שמשותף לכולן). התאמה לפי טלפון בלבד הייתה **מאחדת לקוחות אמיתיים
   * שונים** — נזק חמור בהרבה מכפילות. לכן טלפון מתאים רק **בצירוף שם כמעט זהה**.
   *
   * לכן ההתאמה, מהחזק לחלש:
   *   1. `companyRegNumber` (ח.פ) — מזהה רשמי וחד-ערכי.
   *   2. שם מנורמל זהה — זה בדיוק האופן שבו הכפילות מתבטאת.
   *   3. טלפון זהה **וגם** שם שנבדל בשגיאת כתיב בלבד — המקרה של "תומר גולפדר"
   *      מול "תומר גולדפדר" (אות אחת חסרה, אותו טלפון, שתי רשומות נפרדות).
   * שם ריק או גנרי ("לקוח חדש") לעולם אינו מתאים — אחרת כל הפניות בלי שם היו
   * מתמזגות לרשומה אחת.
   */
  async resolve(data: any): Promise<{ customer: any; created: boolean; matchedBy: string | null }> {
    const rawName = String(data?.name ?? '').trim().replace(/\s+/g, ' ');
    const regNumber = String(data?.companyRegNumber ?? '').trim();

    // 1. ח.פ — המזהה החזק. מספיק בפני עצמו.
    if (regNumber) {
      const byReg = await this.prisma.customer.findFirst({
        where: { companyRegNumber: regNumber },
        orderBy: { createdAt: 'asc' },
      });
      if (byReg) return { customer: byReg, created: false, matchedBy: 'companyRegNumber' };
    }

    // 2. שם זהה (אחרי נרמול רווחים, בלי תלות ברישיות).
    const GENERIC = new Set(['לקוח חדש', 'לקוח', 'ללא שם', 'טסט', 'test']);
    if (rawName && !GENERIC.has(rawName)) {
      const candidates = await this.prisma.customer.findMany({
        where: { name: { equals: rawName, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      });
      if (candidates.length > 0) {
        return { customer: pickFullest(candidates), created: false, matchedBy: 'name' };
      }
    }

    // 3. טלפון זהה + שם שנבדל בשגיאת כתיב בלבד.
    //    הטלפון לבדו לעולם אינו מספיק (ראו הערת התיעוד) — הוא רק מצמצם את
    //    המועמדים, וההכרעה היא של בדיקת הדמיון בשם.
    const phoneDigits = String(data?.phone ?? '').replace(/[^0-9]/g, '');
    // פחות מ-9 ספרות אינו מספר טלפון שלם — קידומת בלבד תתאים לחצי מהטבלה.
    if (rawName && !GENERIC.has(rawName) && phoneDigits.length >= 9) {
      // NOTE: Postgres POSIX regex אינו תומך ב-`\D` — חובה `[^0-9]` (ראו search).
      const byPhone = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Customer"
           WHERE regexp_replace(COALESCE(phone,''),  '[^0-9]', '', 'g') = $1
              OR regexp_replace(COALESCE(phone2,''), '[^0-9]', '', 'g') = $1
              OR regexp_replace(COALESCE(phone3,''), '[^0-9]', '', 'g') = $1
           ORDER BY "createdAt" ASC
           LIMIT 50`,
        phoneDigits,
      );
      const nearIdentical = byPhone.filter((c) => isTypoOf(rawName, c?.name));
      if (nearIdentical.length > 0) {
        return { customer: pickFullest(nearIdentical), created: false, matchedBy: 'phone+name' };
      }
    }

    const customer = await this.create(data);
    return { customer, created: true, matchedBy: null };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    if (dto.type !== undefined) {
      await this.assertClassificationCode(dto.type);
    }
    const data = this.applyCustomerPatch(dto);
    if (Object.keys(data).length === 0) {
      return this.prisma.customer.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.customer.update({ where: { id }, data });
  }

  async replaceReferralSources(customerId: string, body: ReplaceReferralSourcesDto) {
    await this.ensureCustomer(customerId);
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      await tx.customerReferralSource.deleteMany({ where: { customerId } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sourceName = it.sourceName?.trim() ?? '';
        const date = parseOptionalDate(it.date ?? undefined);
        if (!sourceName && date == null && !(it.importLegacyId?.trim())) continue;
        await tx.customerReferralSource.create({
          data: {
            id: randomUUID(),
            customerId,
            sourceName: sourceName || null,
            date: date ?? null,
            rowOrder: i,
            importLegacyId: it.importLegacyId?.trim() || null,
          },
        });
      }
      return tx.customerReferralSource.findMany({
        where: { customerId },
        orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  /** חסימות ערוצי תקשורת ("חסום ל:") — replace-all לפי הערוצים שנשלחו מכרטיס הלקוח. */
  async replaceBlocks(customerId: string, body: ReplaceBlocksDto) {
    await this.ensureCustomer(customerId);
    const valid = new Set(['MAILING', 'WHATSAPP', 'EMAIL', 'SMS']);
    // מנרמלים: ערוצים ייחודיים, רק ערכים חוקיים.
    const items = (body.items ?? []).filter((it) => valid.has((it.channel ?? '').toUpperCase()));
    const seen = new Set<string>();
    return this.prisma.$transaction(async (tx) => {
      await tx.customerBlock.deleteMany({ where: { customerId } });
      for (const it of items) {
        const channel = (it.channel ?? '').toUpperCase();
        if (seen.has(channel)) continue; // לא חוסמים פעמיים לאותו ערוץ
        seen.add(channel);
        await tx.customerBlock.create({
          data: {
            id: randomUUID(),
            customerId,
            channel: channel as any,
            reason: it.reason?.trim() || null,
          },
        });
      }
      return tx.customerBlock.findMany({
        where: { customerId },
        orderBy: [{ channel: 'asc' }],
      });
    });
  }

  async replaceQuestionnaires(customerId: string, body: ReplaceQuestionnairesDto) {
    await this.ensureCustomer(customerId);
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      await tx.customerQuestionnaire.deleteMany({ where: { customerId } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const code = it.questionnaireCode?.trim() ?? '';
        const name = it.questionnaireName?.trim() ?? '';
        if (!code && !name && !(it.importLegacyId?.trim())) continue;
        await tx.customerQuestionnaire.create({
          data: {
            id: randomUUID(),
            customerId,
            questionnaireCode: code || null,
            questionnaireName: name || null,
            rowOrder: i,
            importLegacyId: it.importLegacyId?.trim() || null,
          },
        });
      }
      return tx.customerQuestionnaire.findMany({
        where: { customerId },
        orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async replaceRelations(customerId: string, body: ReplaceRelationsDto) {
    await this.ensureCustomer(customerId);
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      await tx.customerRelation.deleteMany({ where: { customerId } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const relatedName = it.relatedCustomerName?.trim() ?? '';
        if (!relatedName && !(it.importLegacyId?.trim())) continue;
        await tx.customerRelation.create({
          data: {
            id: randomUUID(),
            customerId,
            relatedCustomerName: relatedName || null,
            relationType: it.relationType?.trim() || null,
            rowOrder: i,
            importLegacyId: it.importLegacyId?.trim() || null,
          },
        });
      }
      return tx.customerRelation.findMany({
        where: { customerId },
        orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async replaceAdditionalDataRows(customerId: string, body: ReplaceAdditionalDataDto) {
    await this.ensureCustomer(customerId);
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      await tx.customerAdditionalDataRow.deleteMany({ where: { customerId } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await tx.customerAdditionalDataRow.create({
          data: {
            id: randomUUID(),
            customerId,
            numberValue: it.numberValue?.trim() || null,
            dValue: it.dValue?.trim() || null,
            dateValue: parseOptionalDate(it.dateValue ?? undefined) ?? null,
            text1: it.text1?.trim() || null,
            text2: it.text2?.trim() || null,
            rowOrder: i,
            importLegacyId: it.importLegacyId?.trim() || null,
          },
        });
      }
      return tx.customerAdditionalDataRow.findMany({
        where: { customerId },
        orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async replaceExternalDataRows(customerId: string, body: ReplaceExternalDataDto) {
    await this.ensureCustomer(customerId);
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      await tx.customerExternalDataRow.deleteMany({ where: { customerId } });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await tx.customerExternalDataRow.create({
          data: {
            id: randomUUID(),
            customerId,
            rowOrder: i,
            colA: it.colA?.trim() || null,
            colB: it.colB?.trim() || null,
            colC: it.colC?.trim() || null,
            colD: it.colD?.trim() || null,
            colE: it.colE?.trim() || null,
            colF: it.colF?.trim() || null,
            colG: it.colG?.trim() || null,
            colH: it.colH?.trim() || null,
            colI: it.colI?.trim() || null,
            colJ: it.colJ?.trim() || null,
            importLegacyId: it.importLegacyId?.trim() || null,
          },
        });
      }
      return tx.customerExternalDataRow.findMany({
        where: { customerId },
        orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  private async ensureCustomer(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('לקוח לא נמצא');
  }

  async createCustomerDocument(customerId: string, dto: CreateCustomerDocumentDto, uploadedById?: string | null) {
    await this.ensureCustomer(customerId);
    const filePath = (dto.filePath && dto.filePath.trim()) || 'legacy:metadata-only';
    return this.prisma.document.create({
      data: {
        id: randomUUID(),
        customerId,
        name: dto.name.trim(),
        filePath,
        description: dto.description?.trim() || null,
        documentType: parseDocumentType(dto.documentType),
        documentDate: parseOptionalDate(dto.documentDate ?? undefined) ?? null,
        mimeType: dto.mimeType?.trim() || null,
        sizeBytes: dto.sizeBytes ?? null,
        dataBase64: dto.dataBase64?.trim() || null,
        importLegacyId: dto.importLegacyId?.trim() || null,
        uploadedById: uploadedById || null,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** רשימת מסמכים של לקוח (אופציונלי לפי סוג). כולל dataBase64 — לטעינה לפי דרישה (הצעות חתומות). */
  async listCustomerDocuments(customerId: string, type?: string) {
    await this.ensureCustomer(customerId);
    return this.prisma.document.findMany({
      where: {
        customerId,
        ...(type ? { documentType: parseDocumentType(type) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        documentType: true,
        mimeType: true,
        sizeBytes: true,
        dataBase64: true,
        // description/documentDate are editable from the customer card ("דוחות
        // שהופקו" → עריכה), so the list has to return their current values —
        // otherwise the edit form opens blank and saving would wipe them.
        description: true,
        documentDate: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * רושם "כניסה" של עובד ללקוח — עבור "10 הלקוחות האחרונים" per-user.
   * upsert על (userId, customerId): viewedAt = now. best-effort; מזהה לקוח לא קיים
   * או משתמש חסר לא זורקים (כדי לא להפיל את פתיחת הכרטיס). לא מחזיר כלום משמעותי.
   */
  async recordCustomerView(customerId: string, userId?: string): Promise<{ ok: boolean }> {
    if (!userId || !customerId || customerId === '__new__') return { ok: false };
    try {
      // מוודאים שהלקוח קיים לפני יצירת רשומת view (מונע FK error על מזהה זבל).
      const exists = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!exists) return { ok: false };
      await this.prisma.customerView.upsert({
        where: { userId_customerId: { userId, customerId } },
        create: { userId, customerId },
        update: { viewedAt: new Date() },
      });
      return { ok: true };
    } catch (e: any) {
      this.logger.warn(`recordCustomerView failed (user=${userId}, customer=${customerId}): ${e?.message || e}`);
      return { ok: false };
    }
  }

  /**
   * 10 הלקוחות האחרונים שהעובד נכנס אליהם (לפי viewedAt יורד). מחזיר שדות בסיס
   * לתצוגת הצ'יפים בטאב הלקוחות. אם אין היסטוריית כניסות — רשימה ריקה (הפרונט
   * נופל חזרה ל-createdAt).
   */
  async listRecentlyViewedCustomers(userId?: string, take = 10) {
    if (!userId) return [];
    const views = await this.prisma.customerView.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take,
      select: {
        viewedAt: true,
        customer: {
          select: { id: true, name: true, city: true, type: true, phone: true },
        },
      },
    });
    return views
      .filter((v) => v.customer)
      .map((v) => ({ ...v.customer, viewedAt: v.viewedAt }));
  }

  async updateCustomerDocument(customerId: string, documentId: string, dto: UpdateCustomerDocumentDto) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, customerId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('מסמך לא נמצא');
    const nextName = dto.name !== undefined ? dto.name?.trim() : undefined;

    // החלפת הקובץ עצמו: מקבלים base64 נטו (בלי קידומת "data:...;base64,")
    // ובלי רווחים/שורות. מחרוזת ריקה נחשבת "לא נשלח קובץ" ואינה מוחקת את
    // הקיים — ריקון תוכן של דוח אינו פעולת עריכה סבירה, ולמחיקה יש כפתור נפרד.
    let nextData: string | undefined;
    if (typeof dto.dataBase64 === 'string') {
      const raw = dto.dataBase64.includes(',')
        ? dto.dataBase64.slice(dto.dataBase64.indexOf(',') + 1)
        : dto.dataBase64;
      const clean = raw.replace(/\s/g, '');
      if (clean) nextData = clean;
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        name: nextName === undefined ? undefined : nextName || undefined,
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        documentType: dto.documentType !== undefined ? parseDocumentType(dto.documentType) : undefined,
        documentDate:
          dto.documentDate !== undefined ? parseOptionalDate(dto.documentDate ?? undefined) ?? null : undefined,
        mimeType: dto.mimeType !== undefined ? dto.mimeType?.trim() || null : undefined,
        sizeBytes: dto.sizeBytes !== undefined ? dto.sizeBytes : undefined,
        dataBase64: nextData,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async removeCustomerDocument(customerId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, customerId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('מסמך לא נמצא');
    await this.prisma.document.delete({ where: { id: documentId } });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // הצעת מחיר חתומה (העלאה ידנית) — מסמך + Quote SIGNED + קידום משימה
  // ─────────────────────────────────────────────────────────────

  /**
   * חילוץ הסכום הסופי + מספר ההצעה מ-PDF, לפני האישור במודל הצירוף.
   *
   * מספר ההצעה נלקח לפי סדר עדיפות:
   *   'pdf'      — המספר שכתוב במסמך עצמו (הסמכות: זו ההצעה שהלקוח חתם עליה).
   *   'customer' — ההצעה האחרונה של הלקוח ב-CRM, כשה-PDF סרוק/ללא שכבת טקסט.
   * אם שניהם ריקים מוחזר null, והמסך נופל ל-/quotes/next-reference (מספר רץ חדש).
   */
  async parseSignedQuoteTotal(
    customerId: string,
    dto: ParseSignedQuoteDto,
  ): Promise<{ total: number | null; quoteNumber: string | null; quoteNumberSource: 'pdf' | 'customer' | null }> {
    const mime = (dto.mimeType || '').toLowerCase();
    // רק PDF טקסטואלי ניתן לחילוץ; תמונה/סריקה → נופלים למספר ההצעה של הלקוח.
    const isPdf = !mime || mime.includes('pdf');
    let total: number | null = null;
    let fromPdf: string | null = null;

    if (isPdf) {
      let buf: Buffer | null = null;
      try {
        const b64 = dto.dataBase64.includes(',') ? dto.dataBase64.split(',')[1] : dto.dataBase64;
        buf = Buffer.from(b64, 'base64');
      } catch {
        buf = null;
      }
      if (buf) {
        const info = await extractSignedQuoteInfo(buf);
        total = info.total;
        fromPdf = info.quoteNumber;
      }
    }

    if (fromPdf) return { total, quoteNumber: fromPdf, quoteNumberSource: 'pdf' };

    const fromCustomer = await this.latestQuoteNumberOf(customerId).catch(() => null);
    return {
      total,
      quoteNumber: fromCustomer,
      quoteNumberSource: fromCustomer ? 'customer' : null,
    };
  }

  /**
   * מספר ההצעה של ההצעה האחרונה של הלקוח — ההצעה שנשלחה וחוזרת עכשיו חתומה.
   * מדלגים על Quote-ים סינתטיים (הכנסה ידנית / צירוף חתום קודם) כדי לא להחזיר
   * מספר שהומצא בצירוף קודם, ועל מספרים שאינם המספר הרץ (4–6 ספרות; 3–8 לסובלנות).
   */
  private async latestQuoteNumberOf(customerId: string): Promise<string | null> {
    const rows = await this.prisma.quote.findMany({
      where: { customerId },
      select: {
        quoteNumber: true,
        orderReferenceNumber: true,
        orderSource: true,
        signedPdfPath: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    for (const r of rows) {
      if (r.orderSource === CustomersService.MANUAL_INCOME_MARKER) continue;
      if (r.signedPdfPath === 'signed-quote:manual') continue;
      const v = (r.quoteNumber || r.orderReferenceNumber || '').trim();
      if (/^\d{3,8}$/.test(v)) return v;
    }
    return null;
  }

  /**
   * צירוף הצעה חתומה ידנית → מריץ את אותם הטריגרים כמו חתימה דיגיטלית:
   *   1) שומר את הקובץ כמסמך SIGNED_QUOTE של הלקוח (יופיע בסקשן הקיים).
   *   2) יוצר Quote בסטטוס SIGNED עם totalAmount = הסכום הסופי → נספר אוטומטית
   *      בכל חישובי ההכנסות של הדשבורד (manager + revenue-analytics).
   *   3) מקדם משימת פולואפ פתוחה של הלקוח → תיאום (best-effort).
   * המסמך + ה-Quote נוצרים אטומית; קידום המשימה best-effort ולא מפיל את הצירוף.
   */
  async createSignedQuote(customerId: string, dto: CreateSignedQuoteDto, actorId?: string | null) {
    await this.ensureCustomer(customerId);
    const amount = Number(dto.finalAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('סכום סופי לא תקין');
    }
    const b64 = dto.dataBase64.includes(',') ? dto.dataBase64.split(',')[1] : dto.dataBase64;
    const now = new Date();

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });

    const { document, quote } = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: randomUUID(),
          customerId,
          name: dto.name.trim(),
          filePath: 'signed-quote:manual',
          documentType: DocumentType.SIGNED_QUOTE,
          documentDate: now,
          mimeType: dto.mimeType?.trim() || null,
          sizeBytes: dto.sizeBytes ?? null,
          dataBase64: b64 || null,
          uploadedById: actorId || null,
        },
      });

      const quote = await tx.quote.create({
        data: {
          id: randomUUID(),
          customerId,
          customerName: customer?.name || null,
          service: 'הצעת מחיר חתומה',
          // amount = legacy; totalAmount = השדה שהדשבורד סוכם לפיו.
          amount,
          totalAmount: amount,
          amountBeforeVat: amount,
          vatPercent: 0,
          // מספר ההצעה = הסימוכין (אותו מספר רץ, כמו ב-QuotesService.create) — שמירה
          // בשדה אחד בלבד הותירה את עמודת "סימוכין" ריקה ברשימת ההצעות ובחיפוש.
          quoteNumber: dto.quoteNumber?.trim() || null,
          orderReferenceNumber: dto.quoteNumber?.trim() || null,
          status: 'SIGNED',
          digitalSignatureStatus: 'SIGNED',
          signedAt: now,
          quoteDate: now,
          validTo: now,
          signedPdfPath: 'signed-quote:manual',
          // שיוך ההכנסה למהנדס/נציג בדשבורד (opportunity.assignedUserId) —
          // המשתמש שביצע את הצירוף.
          salesRepresentativeId: actorId || null,
        },
      });

      return { document, quote };
    }, {
      // כתיבת ה-base64 של ההצעה החתומה יכולה לקחת עשרות שניות בקובץ גדול (הצעה
      // סרוקה של ~70 עמודים ≈ 30MB). ברירת המחדל של Prisma לטרנזקציה אינטראקטיבית
      // היא 5 שניות בלבד — ה-document.create הצליח, ואז ה-quote.create נפל על
      // P2028 "expired transaction" והכל התגלגל אחורה. מכאן "צירוף ההצעה נכשל"
      // שקרה רק בקבצים גדולים. maxWait — כמה להמתין לחיבור פנוי מה-pool.
      timeout: 180_000,
      maxWait: 30_000,
    });

    // קידום משימת פולואפ→תיאום — best-effort, לא מפיל את הצירוף.
    let taskAdvanced = false;
    try {
      taskAdvanced = await this.advanceFollowupToCoordination(customerId);
    } catch (e: any) {
      this.logger.warn(`advanceFollowupToCoordination failed for customer ${customerId}: ${e?.message || e}`);
    }

    return { document, quoteId: quote.id, totalAmount: amount, taskAdvanced };
  }

  /** מסמן Quote סינתטי כ"הכנסה ידנית" — מפתח שאילתה יציב (לא נוגע בהצעות רגילות). */
  private static readonly MANUAL_INCOME_MARKER = 'MANUAL_INCOME';

  /**
   * הוספת הכנסה ידנית מכרטיס הלקוח — יוצר Quote בסטטוס SIGNED עם הסכום, כך שההכנסה
   * נספרת אוטומטית בכל חישובי ההכנסה של הדשבורד (revenueAmountOf קורא amountBeforeVat).
   * אין מסמך/קובץ. ההערה נשמרת ב-Quote.notes ומסבירה מדוע נרשמה ידנית. מסומן ב-orderSource
   * כדי שאפשר יהיה לשלוף/למחוק בדיוק את ההכנסות הידניות בלי לפגוע בהצעות מחיר רגילות.
   */
  async createManualIncome(customerId: string, dto: CreateManualIncomeDto, actorId?: string | null) {
    await this.ensureCustomer(customerId);
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('סכום הכנסה לא תקין');
    }
    const note = String(dto.note || '').trim();
    if (!note) {
      throw new BadRequestException('חובה לרשום הערה המסבירה מדוע ההכנסה נרשמה ידנית');
    }
    const when = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('תאריך ההכנסה לא תקין');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });

    const quote = await this.prisma.quote.create({
      data: {
        id: randomUUID(),
        customerId,
        customerName: customer?.name || null,
        service: 'הכנסה ידנית',
        // amount = legacy; totalAmount/amountBeforeVat = השדות שהדשבורד סוכם לפיהם (ללא מע"מ).
        amount,
        totalAmount: amount,
        amountBeforeVat: amount,
        vatPercent: 0,
        status: 'SIGNED',
        signedAt: when, // תאריך הזכייה שהדשבורד מקבץ לפיו (revenueAnalytics/quarter)
        quoteDate: when,
        validTo: when,
        notes: note,
        orderSource: CustomersService.MANUAL_INCOME_MARKER,
        salesRepresentativeId: actorId || null,
      },
    });

    return { id: quote.id, amount, note, at: when.toISOString() };
  }

  /** רשימת ההכנסות הידניות של הלקוח (הכי חדשה בראש) — לתצוגה בכרטיס הלקוח. */
  async listManualIncome(customerId: string) {
    await this.ensureCustomer(customerId);
    const rows = await this.prisma.quote.findMany({
      where: { customerId, orderSource: CustomersService.MANUAL_INCOME_MARKER },
      orderBy: [{ signedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        amountBeforeVat: true,
        totalAmount: true,
        amount: true,
        notes: true,
        signedAt: true,
        createdAt: true,
        salesRepresentativeId: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      amount: Number(r.amountBeforeVat ?? r.totalAmount ?? r.amount ?? 0),
      note: r.notes || '',
      at: (r.signedAt ?? r.createdAt)?.toISOString() ?? null,
      createdById: r.salesRepresentativeId || null,
    }));
  }

  /** מחיקת הכנסה ידנית (רק Quote שסומן כ-MANUAL_INCOME של אותו לקוח). */
  async deleteManualIncome(customerId: string, quoteId: string) {
    const row = await this.prisma.quote.findFirst({
      where: { id: quoteId, customerId, orderSource: CustomersService.MANUAL_INCOME_MARKER },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('הכנסה ידנית לא נמצאה');
    await this.prisma.quote.delete({ where: { id: quoteId } });
    return { ok: true };
  }

  /**
   * מקדם משימת מכירה של הלקוח משלב "פולואפ" ל"תיאום" — זהה ל-quote-signature.
   * מקדם רק משימה שנמצאת כרגע בפולואפ (type SALES_FOLLOWUP/STEP4/step4), כדי לא
   * למשוך אחורה משימה שכבר התקדמה. מחזיר true אם קודמה משימה.
   */
  private async advanceFollowupToCoordination(customerId: string): Promise<boolean> {
    const FOLLOWUP_TYPES = ['SALES_FOLLOWUP', 'STEP4', 'step4'];
    const task = await this.prisma.task.findFirst({
      where: {
        customerId,
        status: { notIn: ['DONE', 'CANCELLED'] },
        type: { in: FOLLOWUP_TYPES },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!task) return false;
    await this.prisma.task.update({
      where: { id: task.id },
      // תיאום = type step5 + currentStage 4 (מסונכרן עם detectStep בפרונט).
      data: { type: 'step5', currentStage: 4, currentStageChangedAt: new Date() },
    });
    this.logger.log(`signed-quote (manual) for customer ${customerId} → task ${task.id} advanced פולואפ→תיאום`);
    return true;
  }

  async remove(id: string, actor?: { id?: string; role?: string }) {
    const role = (actor?.role || '').toUpperCase();

    if (role === 'ADMIN' || role === 'MANAGER') {
      return this.prisma.$transaction(async (tx) => {
        await tx.lead.updateMany({
          where: { customerId: id },
          data: { customerId: null },
        });
        await tx.task.updateMany({
          where: { customerId: id },
          data: { customerId: null },
        });
        await tx.quote.deleteMany({
          where: { customerId: id },
        });
        await tx.report.updateMany({
          where: { customerId: id },
          data: { customerId: null },
        });

        return tx.customer.delete({ where: { id } });
      });
    }

    const userId = actor?.id;
    if (!userId) throw new ForbiddenException();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, canDeleteCustomers: true },
    });

    if (!user?.canDeleteCustomers) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { customerId: id },
        data: { customerId: null },
      });
      await tx.task.updateMany({
        where: { customerId: id },
        data: { customerId: null },
      });
      await tx.quote.deleteMany({
        where: { customerId: id },
      });
      await tx.report.updateMany({
        where: { customerId: id },
        data: { customerId: null },
      });

      return tx.customer.delete({ where: { id } });
    });
  }
}
