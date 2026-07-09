import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphFilesService } from '../microsoft/graph-files.service';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument = require('pdfkit');

// Columns present in the Prisma schema (migration 20260328190000) that do NOT
// exist in the actual DB table yet. Pre-emptively excluded from every Prisma
// INSERT/UPDATE RETURNING clause so they never cause "column does not exist" errors.
const SCHEMA_DRIFT_OMIT = ['salesRepresentativeId', 'performerUserId', 'performerName'];

// תפקידים המורשים לצפות/ליצור/לעדכן/למחוק הצעות מחיר. חייב להיות תואם ל-@Roles שעל
// QuotesController — אחרת עובד עובר את guard הנתיב אך נחסם כאן ומקבל 403 בשמירה
// (בדיוק הבאג של "הכפתור שמור לא עובד" לטכנאים/מומחים/חיוב).
const QUOTE_ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING']);

const QUOTE_WRITABLE_FIELDS = new Set([
  'importLegacyId',
  'quoteNumber',
  'service',
  'description',
  'amount',
  'status',
  'validTo',
  'pdfPath',
  'customerId',
  'leadId',
  'projectId',
  'opportunityId',
  'validityDate',
  'amountBeforeVat',
  'vatPercent',
  'discountType',
  'discountValue',
  'paymentTerms',
  'notes',
  'quoteTemplateId',
  'contentHtml',
  'lineItemsJson',
  // ── Fields added by schema migrations ────────────────────────────────────
  'customerName',
  'quoteDate',
  'followupDate',
  'followUpResponsibleUserId',
  'salesRepresentativeName',
  'executorName',
  'orderReferenceNumber',
  'priceList',
  'exchangeRate',
  'accountingNumber',
  'companyRegNumber',
  'addressSummary',
  'citySummary',
  'phoneSummary',
  'faxSummary',
  'validityDays',
  'paymentsCount',
  'paymentAmount',
  'paymentTotal',
  'paymentDueDate',
  'internalNotes',
  'orderSource',
  'functionalLabel',
  'forecastClosePercent',
  'forecastUpdatedAt',
  'forecastUpdatedBy',
  'forecastUpdatedTime',
  // salesRepresentativeId — FK from migration 20260328190000, NOT in real DB, never write it
  // performerUserId       — FK from migration 20260328190000, NOT in real DB, never write it
  // performerName         — plain String from same migration, omitted from payload too
  'customerContactId',
  'lastMergedDocPath',
  'linkedEntityId',
]);

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphFiles: GraphFilesService,
  ) {}

  private sanitizeQuoteInput(data: any) {
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const k of QUOTE_WRITABLE_FIELDS) {
      if (k in data && (data as any)[k] !== undefined) out[k] = (data as any)[k];
    }
    return out;
  }

  private computeTotalAmount(input: {
    amountBeforeVat?: number | null;
    vatPercent?: number | null;
    discountType?: string | null;
    discountValue?: number | null;
  }) {
    const base = Number(input.amountBeforeVat ?? 0) || 0;
    const vat = Number(input.vatPercent ?? 0) || 0;
    const withVat = base * (1 + vat / 100);
    const discType = (input.discountType || 'NONE').toString().toUpperCase();
    const discVal = Number(input.discountValue ?? 0) || 0;
    let discounted = withVat;
    if (discType === 'CURRENCY') discounted = withVat - discVal;
    if (discType === 'PERCENT') discounted = withVat * (1 - discVal / 100);
    return Math.max(0, Math.round(discounted * 100) / 100);
  }

  async findAll({
    projectId,
    opportunityId,
    customerId,
    leadId,
    linkedEntityId,
    user,
  }: {
    projectId?: string;
    opportunityId?: string;
    customerId?: string;
    leadId?: string;
    linkedEntityId?: string;
    user?: { id?: string; role?: string };
  } = {}) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (!QUOTE_ALLOWED_ROLES.has(role)) throw new ForbiddenException();

    // Automation: expire quotes whose validity passed while still SENT (best-effort — older DBs may lack EXPIRED enum)
    const now = new Date();
    try {
      await this.prisma.quote.updateMany({
        where: {
          status: 'SENT',
          OR: [
            { validityDate: { lt: now } },
            { validTo: { lt: now } },
          ],
        },
        data: { status: 'EXPIRED' },
      });
    } catch {
      /* ignore */
    }

    try {
      return await this.prisma.quote.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          ...(opportunityId ? { opportunityId } : {}),
          ...(customerId ? { customerId } : {}),
          ...(leadId ? { leadId } : {}),
          ...(linkedEntityId ? { linkedEntityId } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          customer: true,
          opportunity: true,
          project: true,
          quoteTemplate: true,
          quoteDocuments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        // Degraded list without joins — avoids 500 when schema/DB drift; client may refetch relations separately
        return this.prisma.$queryRawUnsafe(`SELECT * FROM "Quote" ORDER BY "createdAt" DESC`);
      }
      throw e;
    }
  }

  findOne(id: string) {
    return this.prisma.quote.findUnique({
      where: { id },
      include: { customer: true, quoteTemplate: true, followUpResponsibleUser: true },
    });
  }

  /** מספר ההצעה הראשון בפורמט החדש (פורמלי, מספר טהור). */
  private static readonly QUOTE_NUMBER_START = 13763;

  /**
   * Next display reference for new quotes — a plain sequential number (e.g. 13763, 13764).
   * Continues from the highest existing plain-numeric quote number, or from QUOTE_NUMBER_START.
   * Legacy "Q-YYYYMM-NNNN" numbers are ignored when computing the max.
   */
  async getNextReference(): Promise<{ reference: string }> {
    // The displayed quote number is stored in orderReferenceNumber (quoteNumber is legacy/null).
    // Keep only pure-numeric values (the new format) and continue from the highest.
    const rows = await this.prisma.quote.findMany({
      select: { orderReferenceNumber: true, quoteNumber: true },
    });
    let maxNum = QuotesService.QUOTE_NUMBER_START - 1;
    for (const r of rows) {
      for (const raw of [r.orderReferenceNumber, r.quoteNumber]) {
        const v = (raw || '').trim();
        if (/^\d{4,6}$/.test(v)) {
          const n = parseInt(v, 10);
          if (n > maxNum) maxNum = n;
        }
      }
    }
    return { reference: String(maxNum + 1) };
  }

  create(data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (!QUOTE_ALLOWED_ROLES.has(role)) throw new ForbiddenException();

    const clean = this.sanitizeQuoteInput(data);

    // Prisma 7.x + @prisma/adapter-pg requires Date objects for DateTime fields,
    // not ISO strings. Convert every DateTime field in the sanitized payload.
    const DATETIME_FIELDS = [
      'validTo', 'quoteDate', 'followupDate', 'validityDate', 'paymentDueDate',
      'forecastUpdatedAt', 'sentAt', 'reminderNextAt',
    ];
    for (const field of DATETIME_FIELDS) {
      const val = (clean as any)[field];
      if (val !== undefined && val !== null) {
        const d = val instanceof Date ? val : new Date(val);
        (clean as any)[field] = isNaN(d.getTime()) ? null : d;
      }
    }

    const totalAmount = this.computeTotalAmount({
      amountBeforeVat: (clean as any)?.amountBeforeVat,
      vatPercent: (clean as any)?.vatPercent,
      discountType: (clean as any)?.discountType,
      discountValue: (clean as any)?.discountValue,
    });

    // tryCreate retries automatically when a column exists in the Prisma schema
    // but not yet in the actual DB (e.g. migration not applied).
    // omitFields: columns excluded from both the INSERT payload and the RETURNING clause.
    const tryCreate = (payload: Record<string, unknown>, omitFields: string[] = SCHEMA_DRIFT_OMIT): Promise<any> => {
      const omitClause = omitFields.reduce<Record<string, boolean>>((acc, f) => ({ ...acc, [f]: true }), {});
      return (this.prisma.quote.create({
        data: payload as any,
        ...(omitFields.length ? { omit: omitClause } : {}),
      }) as Promise<any>).catch((e: any) => {
        const raw: string = e?.message ?? '';

        // ── "column does not exist" ─────────────────────────────────────────
        // Covers P2022 AND raw adapter errors regardless of error code/class.
        // Error formats vary by Prisma/PG version:
        //   "The column `Quote.salesRepresentativeId` does not exist in the current database."
        //   "column Quote.salesRepresentativeId does not exist"
        //   "column \"salesRepresentativeId\" does not exist"
        const missingColMatch = /column [`'"]?(?:[A-Za-z_"]+\.)?([A-Za-z_]+)[`'"]? does not exist/i.exec(raw);
        const missingCol = missingColMatch?.[1];
        if (missingCol && !omitFields.includes(missingCol)) {
          // Drop from payload if present; always add to omit so RETURNING skips it too.
          let newPayload = payload;
          if (missingCol in payload) {
            const { [missingCol]: _dropped, ...rest } = payload;
            newPayload = rest;
          }
          return tryCreate(newPayload, [...omitFields, missingCol]);
        }

        // ── PrismaClientValidationError ─────────────────────────────────────
        // Field not in generated client yet (run prisma generate).
        // Handles multiple Prisma version message formats:
        //   v4/5: "Unknown argument `fieldName`"
        //   v6/7: "Argument `fieldName` does not exist" / "Invalid argument: `fieldName`"
        //   v7:   "Argument `fieldName`: Invalid value provided"
        if (e?.name === 'PrismaClientValidationError') {
          const col = (
            /Unknown argument `([^`]+)`/.exec(raw)?.[1] ??
            /Argument `([^`]+)` does not exist/.exec(raw)?.[1] ??
            /Invalid argument: `([^`]+)`/.exec(raw)?.[1] ??
            /Argument `([^`]+)`: Invalid value/.exec(raw)?.[1]
          );
          if (col && col in payload) {
            const { [col]: _dropped, ...rest } = payload;
            return tryCreate(rest, omitFields);
          }
        }

        console.error('QUOTE CREATE ERROR', e?.code, e?.message ?? e);
        throw e;
      });
    };

    return tryCreate({ ...(clean as any), totalAmount });
  }

  async update(id: string, data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (!QUOTE_ALLOWED_ROLES.has(role)) throw new ForbiddenException();

    const existing = await this.prisma.quote.findUnique({
      where: { id },
      include: { customer: true, opportunity: true },
    });
    if (!existing) throw new NotFoundException('Quote not found');

    const next: any = { ...this.sanitizeQuoteInput(data) };

    // Prisma 7.x + @prisma/adapter-pg requires Date objects for DateTime fields
    const DATETIME_FIELDS_UPD = [
      'validTo', 'quoteDate', 'followupDate', 'validityDate', 'paymentDueDate',
      'forecastUpdatedAt', 'sentAt', 'reminderNextAt',
    ];
    for (const field of DATETIME_FIELDS_UPD) {
      const val = next[field];
      if (val !== undefined && val !== null) {
        const d = val instanceof Date ? val : new Date(val);
        next[field] = isNaN(d.getTime()) ? null : d;
      }
    }

    // Always keep totalAmount in sync when financial fields change
    const willRecalc =
      'amountBeforeVat' in (data ?? {}) ||
      'vatPercent' in (data ?? {}) ||
      'discountType' in (data ?? {}) ||
      'discountValue' in (data ?? {});
    if (willRecalc) {
      next.totalAmount = this.computeTotalAmount({
        amountBeforeVat: 'amountBeforeVat' in data ? data.amountBeforeVat : existing.amountBeforeVat,
        vatPercent: 'vatPercent' in data ? data.vatPercent : existing.vatPercent,
        discountType: 'discountType' in data ? data.discountType : existing.discountType,
        discountValue: 'discountValue' in data ? data.discountValue : existing.discountValue,
      });
    }

    // If status transitions to SENT -> start reminder tracking
    if (data?.status === 'SENT' && existing.status !== 'SENT') {
      next.sentAt = new Date();
      next.reminderCount = 0;
      next.reminderNextAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }

    const isApproving =
      (data?.status === 'APPROVED' && existing.status !== 'APPROVED') ||
      (data?.status === 'SIGNED' && existing.status !== 'SIGNED'); // legacy support

    // If status transitions to APPROVED (or legacy SIGNED) -> create project
    if (isApproving) {
      if (data?.status === 'SIGNED') {
        next.signedAt = new Date();
        next.digitalSignatureStatus = 'SIGNED';
      }

      if (!existing.projectId) {
        const projectName =
          existing.opportunity?.projectOrServiceName ||
          existing.service ||
          `Project from quote ${existing.id}`;

        const createdProject = await this.prisma.project.create({
          data: {
            name: projectName,
            client: existing.customer?.name ?? '',
            customerId: existing.customerId,
            service: existing.service,
            serviceCategory: existing.service,
            status: 'NEW',
            progress: 0,
            assignedTechnicianId: existing.opportunity?.assignedUserId ?? null,
            notes: existing.notes ?? undefined,
          },
        });

        next.projectId = createdProject.id;
      }
    }

    const tryUpdate = (payload: Record<string, unknown>, omitFields: string[] = SCHEMA_DRIFT_OMIT): Promise<any> => {
      const omitClause = omitFields.reduce<Record<string, boolean>>((acc, f) => ({ ...acc, [f]: true }), {});
      return (this.prisma.quote.update({
        where: { id },
        data: payload as any,
        ...(omitFields.length ? { omit: omitClause } : {}),
      }) as Promise<any>).catch((e: any) => {
        const raw: string = e?.message ?? '';

        // Covers P2022 AND raw adapter errors regardless of error class.
        const missingColMatch = /column [`'"]?(?:[A-Za-z_"]+\.)?([A-Za-z_]+)[`'"]? does not exist/i.exec(raw);
        const missingCol = missingColMatch?.[1];
        if (missingCol && !omitFields.includes(missingCol)) {
          let newPayload = payload;
          if (missingCol in payload) {
            const { [missingCol]: _dropped, ...rest } = payload;
            newPayload = rest;
          }
          return tryUpdate(newPayload, [...omitFields, missingCol]);
        }

        if (e?.name === 'PrismaClientValidationError') {
          const col = (
            /Unknown argument `([^`]+)`/.exec(raw)?.[1] ??
            /Argument `([^`]+)` does not exist/.exec(raw)?.[1] ??
            /Invalid argument: `([^`]+)`/.exec(raw)?.[1] ??
            /Argument `([^`]+)`: Invalid value/.exec(raw)?.[1]
          );
          if (col && col in payload) {
            const { [col]: _dropped, ...rest } = payload;
            return tryUpdate(rest, omitFields);
          }
        }

        throw e;
      });
    };
    return tryUpdate(next);
  }

  async remove(id: string, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (!QUOTE_ALLOWED_ROLES.has(role)) throw new ForbiddenException();
    try {
      return await this.prisma.quote.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'לא ניתן למחוק הצעת מחיר כי קיימות רשומות מקושרות (הזמנות וכו\').',
        );
      }
      throw e;
    }
  }

  async generatePdf(id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const quotesDir = path.join(process.cwd(), 'storage', 'quotes');
    if (!fs.existsSync(quotesDir)) {
      fs.mkdirSync(quotesDir, { recursive: true });
    }

    const fileName = `quote-${quote.id}.pdf`;
    const filePath = path.join(quotesDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Header
      doc
        .fontSize(20)
        .text('גלית - הצעת מחיר', { align: 'right' })
        .moveDown();

      const displayAmount =
        Number(quote.totalAmount ?? quote.amountBeforeVat ?? quote.amount ?? 0) || 0;
      const validUntil =
        quote.validityDate ?? quote.validTo;

      // Quote / customer info
      doc
        .fontSize(12)
        .text(`מספר הצעה: ${quote.quoteNumber ?? quote.id}`, { align: 'right' })
        .text(`לקוח: ${quote.customer?.name ?? ''}`, { align: 'right' })
        .text(`שירות: ${quote.service}`, { align: 'right' })
        .text(`סכום כולל (₪): ${displayAmount.toLocaleString('he-IL')}`, { align: 'right' })
        .text(`סטטוס: ${quote.status}`, { align: 'right' })
        .text(
          `בתוקף עד: ${validUntil ? new Date(validUntil).toISOString().slice(0, 10) : '—'}`,
          { align: 'right' },
        )
        .moveDown();

      const descriptionSource =
        (quote as any).contentHtml && String((quote as any).contentHtml).trim()
          ? String((quote as any).contentHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : quote.description || '';
      if (descriptionSource) {
        doc
          .fontSize(12)
          .text('\u05ea\u05d9\u05d0\u05d5\u05e8 \u05d4\u05e9\u05d9\u05e8\u05d5\u05ea:', { align: 'right' })
          .moveDown(0.5)
          .text(descriptionSource.slice(0, 8000), { align: 'right' });
      }

      doc.end();

      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        pdfPath: `storage/quotes/${fileName}`,
      },
    });

    return updated;
  }

  /** Latest merged document for a quote (prefers DB-stored bytes). */
  async getLatestMergedDocument(
    quoteId: string,
  ): Promise<{ data: Uint8Array | null; mimeType: string | null; fileName: string | null; filePath: string | null } | null> {
    const doc: any = await (this.prisma.quoteDocument as any).findFirst({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
      select: { data: true, mimeType: true, fileName: true, filePath: true },
    });
    return doc ?? null;
  }

  async saveMergedDoc(id: string, base64Data: string, fileName: string, mimeType?: string) {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Quote not found');

    // PDF סופי שיוצא מ-Word דסקטופ (Save as PDF) — נשמר ונשלח כמות-שהוא, בלי המרת שרת,
    // כדי לשמר את נאמנות הכותרת (VML/תיבות-טקסט) שמנוע ה-render של השרת מקלקל.
    const isPdf = /pdf/i.test(mimeType || '') || /\.pdf$/i.test(fileName);
    const resolvedMime = isPdf ? 'application/pdf' : (mimeType || DOCX_MIME);

    const quotesDir = path.join(process.cwd(), 'storage', 'quotes');
    if (!fs.existsSync(quotesDir)) fs.mkdirSync(quotesDir, { recursive: true });

    const safeName = fileName.replace(/[^א-תa-zA-Z0-9._\-]/g, '_').slice(0, 200);
    const diskName = `${id}-${safeName}`;
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(path.join(quotesDir, diskName), buffer);
    const relPath = `storage/quotes/${diskName}`;

    // Persist the bytes in the DB so the file survives Railway deploys (ephemeral disk).
    await (this.prisma.quoteDocument.create as any)({
      data: {
        quoteId: id,
        fileName: safeName,
        filePath: relPath,
        data: Uint8Array.from(buffer),
        mimeType: resolvedMime,
        documentType: isPdf ? 'MERGED_PDF' : 'MERGED_DOCX',
        documentDescription: isPdf ? 'PDF סופי (Word)' : 'מסמך ממוזג',
      },
    });

    // PDF סופי: לא נוגעים ב-DOCX הקנוני ולא ב-OneDrive — הוא משמש רק לשליחה המיידית,
    // וה-DOCX לעריכה נשאר זמין כפי שהיה.
    if (isPdf) {
      return quote;
    }

    // מיזוג DOCX חדש מחליף את הגרסה הקנונית → מבטלים הפניית OneDrive ישנה כך ש"ערוך ב-Word"
    // הבא יעלה את התוכן הממוזג העדכני (guarded — אם העמודות עדיין לא הוגרו, נתעלם).
    try {
      await (this.prisma.quote.update as any)({
        where: { id },
        data: { onedriveItemId: null, onedriveWebUrl: null, onedriveOwnerId: null },
      });
    } catch {
      /* עמודות OneDrive עדיין לא קיימות ב-DB */
    }
    try {
      await (this.prisma.quote.update as any)({ where: { id }, data: { onedriveAttachmentId: null } });
    } catch { /* עמודה עדיין לא הוגרה */ }

    return this.prisma.quote.update({
      where: { id },
      data: { lastMergedDocPath: relPath },
    });
  }

  /**
   * מושך את הגרסה העדכנית מ-OneDrive (אחרי עריכה ושמירה ב-Word) ושומר אותה ב-DB כמסמך הממוזג
   * הקנוני — בלי לנתק את קישור העריכה, כדי שאפשר להמשיך לערוך. נקרא כשחוזרים מ-Word ל-CRM,
   * וגם ידנית מהכפתור "סנכרן מ-Word". כך ה-DB מכיל תמיד את הגרסה הערוכה ולא רק את המסמך הממוזג הראשוני.
   */
  async syncFromOneDrive(id: string): Promise<{ synced: boolean; at?: string }> {
    const ref = await this.getOnedriveRef(id);
    if (!ref?.itemId || !ref.ownerId) return { synced: false };

    let buffer: Buffer;
    try {
      buffer = await this.graphFiles.downloadContent(ref.ownerId, ref.itemId);
    } catch (e: any) {
      this.logger.warn(`OneDrive sync download failed (${id}): ${e?.message || e}`);
      return { synced: false };
    }
    if (!buffer?.length) return { synced: false };

    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const quotesDir = path.join(process.cwd(), 'storage', 'quotes');
    try {
      if (!fs.existsSync(quotesDir)) fs.mkdirSync(quotesDir, { recursive: true });
    } catch { /* disk best-effort — ה-DB הוא מקור האמת */ }
    const safeName = `quote-${id.slice(0, 8)}.docx`;
    const diskName = `${id}-${safeName}`;
    try { fs.writeFileSync(path.join(quotesDir, diskName), buffer); } catch { /* ignore */ }
    const relPath = `storage/quotes/${diskName}`;

    const docData = {
      fileName: safeName,
      filePath: relPath,
      data: Uint8Array.from(buffer),
      mimeType: DOCX_MIME,
      documentType: 'MERGED_DOCX',
      documentDescription: 'גרסה ערוכה מ-Word (סונכרן אוטומטית)',
    };

    // מעדכנים את ה-DOCX הממוזג האחרון במקום (לא מנפחים את הטבלה בכל סנכרון); אחרת יוצרים חדש.
    const existingDoc: any = await (this.prisma.quoteDocument as any)
      .findFirst({ where: { quoteId: id, documentType: 'MERGED_DOCX' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      .catch(() => null);
    if (existingDoc?.id) {
      await (this.prisma.quoteDocument.update as any)({ where: { id: existingDoc.id }, data: docData }).catch(() => null);
    } else {
      await (this.prisma.quoteDocument.create as any)({ data: { quoteId: id, ...docData } }).catch(() => null);
    }
    await this.prisma.quote.update({ where: { id }, data: { lastMergedDocPath: relPath } }).catch(() => null);

    // ── שמירת הגרסה הערוכה גם על הקובץ המצורף למשימה המקושרת ──
    // "קבצים שנוצרו" במשימה מציג את הקובץ המצורף (TaskAttachment) שנוצר במיזוג עם המסמך
    // *לפני* העריכה, והוא אינו מתעדכן לעולם. בלי העדכון הזה, סגירה+פתיחה-מחדש של המשימה
    // מציגה את המסמך המקורי במקום הגרסה שנערכה ב-Word. מעדכנים כאן (best-effort).
    await this.refreshLinkedTaskAttachmentDocx(id, buffer).catch(() => null);

    return { synced: true, at: new Date().toISOString() };
  }

  /**
   * מעדכן את התוכן של הקובץ המצורף (DOCX) העדכני ביותר של המשימה המקושרת להצעה,
   * כך שרשימת "קבצים שנוצרו" במשימה תציג תמיד את הגרסה הערוכה ולא את המסמך שלפני העריכה.
   * המשימה מזוהה דרך quote.linkedEntityId (נקבע כ-taskId בעת יצירת ההצעה מתוך משימה).
   * שם הקובץ נשמר כפי שהוא (השם הידידותי שהמשתמש מזהה) — רק הבייטים מוחלפים.
   * best-effort: כל שגיאה נבלעת כדי לא להפיל את הסנכרון.
   */
  async refreshLinkedTaskAttachmentDocx(quoteId: string, buffer: Buffer): Promise<void> {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // עריכה פר-קובץ: אם נשמר איזה קובץ מצורף נפתח ב-Word — מעדכנים אותו ישירות (ולא את
    // ה-DOCX החדש ביותר של המשימה, שעלול להיות קובץ אחר לגמרי).
    try {
      const q: any = await (this.prisma.quote.findUnique as any)({
        where: { id: quoteId },
        select: { onedriveAttachmentId: true },
      });
      if (q?.onedriveAttachmentId) {
        await this.prisma.taskAttachment
          .update({ where: { id: q.onedriveAttachmentId }, data: { data: Uint8Array.from(buffer) } })
          .catch(() => null);
        return;
      }
    } catch { /* עמודה עדיין לא הוגרה — נופלים למנגנון הישן */ }
    const quote = await this.prisma.quote
      .findUnique({ where: { id: quoteId }, select: { linkedEntityId: true } })
      .catch(() => null);
    const taskId = quote?.linkedEntityId;
    if (!taskId) return;

    const att = await this.prisma.taskAttachment
      .findFirst({
        where: {
          taskId,
          OR: [{ mimeType: DOCX_MIME }, { fileName: { endsWith: '.docx' } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      .catch(() => null);
    if (!att?.id) return;

    await this.prisma.taskAttachment
      .update({ where: { id: att.id }, data: { data: Uint8Array.from(buffer) } })
      .catch(() => null);
  }

  /** הפניית ה-OneDrive השמורה להצעה (null אם אין / אם העמודות עדיין לא הוגרו ב-DB). */
  async getOnedriveRef(
    id: string,
  ): Promise<{ itemId: string; webUrl: string | null; ownerId: string; attachmentId: string | null } | null> {
    try {
      const ref: any = await (this.prisma.quote.findUnique as any)({
        where: { id },
        select: { onedriveItemId: true, onedriveWebUrl: true, onedriveOwnerId: true },
      });
      if (ref?.onedriveItemId && ref?.onedriveOwnerId) {
        // onedriveAttachmentId נשלף בנפרד וב-guard משלו — כדי שלא להפיל את כל ההפניה
        // בחלון שבין הדיפלוי להרצת המיגרציה של העמודה החדשה.
        let attachmentId: string | null = null;
        try {
          const extra: any = await (this.prisma.quote.findUnique as any)({
            where: { id },
            select: { onedriveAttachmentId: true },
          });
          attachmentId = extra?.onedriveAttachmentId ?? null;
        } catch { /* עמודה עדיין לא הוגרה */ }
        return { itemId: ref.onedriveItemId, webUrl: ref.onedriveWebUrl ?? null, ownerId: ref.onedriveOwnerId, attachmentId };
      }
    } catch {
      // עמודות OneDrive עדיין לא קיימות ב-DB (לפני הרצת המיגרציה) — נתעלם בשקט.
    }
    return null;
  }

  /**
   * פותח את ההצעה לעריכה ב-Word דרך OneDrive — מחזיר webUrl לפתיחה.
   *
   * אם כבר קיים קובץ פעיל ב-OneDrive → מחזיר אותו (לא מעלים מחדש, כדי לא לדרוס עריכות).
   * אחרת → מעלה את המסמך הממוזג האחרון ל-OneDrive ושומר את ההפניה.
   * מרגע זה והלאה, שליחת המייל מושכת את הגרסה העדכנית מ-OneDrive.
   */
  async openInOneDrive(id: string, userId: string, attachmentId?: string): Promise<{ webUrl: string; webDavUrl: string; itemId: string; reused: boolean }> {
    if (!userId) throw new BadRequestException('משתמש לא מזוהה — יש להתחבר מחדש');
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Quote not found');
    const requestedAtt = (attachmentId || '').trim() || null;

    // קובץ פעיל קיים, שייך למשתמש הנוכחי *ומתאים לאותו קובץ מצורף*? נחזיר אותו
    // (שמירה על העריכות שכבר נעשו). קובץ מצורף אחר → מעלים אותו בנפרד.
    const existing = await this.getOnedriveRef(id);
    if (existing && existing.ownerId === userId && (existing.attachmentId ?? null) === requestedAtt) {
      try {
        const item = await this.graphFiles.getItem(existing.ownerId, existing.itemId);
        if (item) return { webUrl: item.webUrl, webDavUrl: item.webDavUrl, itemId: item.itemId, reused: true };
      } catch (e: any) {
        this.logger.warn(`OneDrive getItem failed (${id}), will re-upload: ${e?.message || e}`);
      }
    }

    // בחירת הבייטים: קובץ מצורף ספציפי (עריכה פר-קובץ) או המסמך הממוזג האחרון.
    let bytes: Buffer | null = null;
    let fileName: string;
    if (requestedAtt) {
      const att = await this.prisma.taskAttachment.findUnique({ where: { id: requestedAtt } });
      if (!att) throw new BadRequestException('הקובץ המצורף לא נמצא');
      bytes = Buffer.from(att.data);
      // שם ייחודי פר-קובץ (מזהה קצר) כדי שעריכת קבצים שונים לא תדרוס זה את זה ב-OneDrive.
      const base = (att.fileName || 'מסמך').replace(/\.docx$/i, '').trim() || 'מסמך';
      fileName = `${base} ${requestedAtt.slice(0, 6)}`;
    } else {
      // שם דטרמיניסטי וייחודי-להצעה (כולל מזהה קצר), כדי שטיוטות ללא מספר הצעה לא ידרסו זו את זו.
      let latest: { data?: Buffer | Uint8Array | null; filePath?: string | null } | null = null;
      try {
        latest = await this.getLatestMergedDocument(id);
      } catch (e: any) {
        this.logger.error(`OneDrive: getLatestMergedDocument failed (${id}): ${e?.message || e}`);
        throw new BadRequestException(`לא ניתן לטעון את המסמך הממוזג: ${e?.message || 'שגיאה לא ידועה'}`);
      }
      if (latest?.data) {
        bytes = Buffer.from(latest.data);
      } else {
        const relPath = latest?.filePath || (quote as any).lastMergedDocPath || null;
        if (relPath) {
          const abs = path.resolve(process.cwd(), relPath);
          if (fs.existsSync(abs)) bytes = fs.readFileSync(abs);
        }
      }
      if (!bytes) {
        throw new BadRequestException('אין מסמך ממוזג להצעה זו — יש לבצע מיזוג קודם');
      }
      fileName = `הצעת מחיר ${quote.quoteNumber ? quote.quoteNumber + ' ' : ''}${id.slice(0, 8)}`.trim();
    }

    let uploaded: { itemId: string; webUrl: string; webDavUrl: string; name: string };
    try {
      uploaded = await this.graphFiles.uploadEditable(userId, fileName, bytes);
    } catch (e: any) {
      // העלאה ל-OneDrive נכשלה (הרשאות Files.ReadWrite / מכסה / Graph) — מציגים את הסיבה האמיתית
      // במקום "Internal server error", כדי שאפשר יהיה לאבחן.
      this.logger.error(`OneDrive upload failed (${id}): ${e?.message || e}`);
      throw new BadRequestException(`העלאת המסמך ל-OneDrive נכשלה: ${e?.message || 'שגיאה לא ידועה'} — ייתכן שצריך לחבר מחדש את Outlook (הרשאת קבצים)`);
    }

    // שמירת ההפניה (guarded — אם העמודות עדיין לא הוגרו, לא נפיל את הבקשה).
    try {
      await (this.prisma.quote.update as any)({
        where: { id },
        data: {
          onedriveItemId: uploaded.itemId,
          onedriveWebUrl: uploaded.webUrl,
          onedriveOwnerId: userId,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Saving OneDrive ref failed (run migration?) for ${id}: ${e?.message || e}`);
    }
    // איזה קובץ מצורף פתוח ב-Word — הסנכרון-חזרה יעדכן אותו. guard נפרד (עמודה חדשה יותר).
    try {
      await (this.prisma.quote.update as any)({ where: { id }, data: { onedriveAttachmentId: requestedAtt } });
    } catch { /* עמודה עדיין לא הוגרה */ }

    return { webUrl: uploaded.webUrl, webDavUrl: uploaded.webDavUrl, itemId: uploaded.itemId, reused: false };
  }
}
