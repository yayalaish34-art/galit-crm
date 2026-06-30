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
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'SALES') throw new ForbiddenException();

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
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'SALES') throw new ForbiddenException();

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
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'SALES') throw new ForbiddenException();

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
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'SALES') throw new ForbiddenException();
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

    return this.prisma.quote.update({
      where: { id },
      data: { lastMergedDocPath: relPath },
    });
  }

  /** הפניית ה-OneDrive השמורה להצעה (null אם אין / אם העמודות עדיין לא הוגרו ב-DB). */
  async getOnedriveRef(
    id: string,
  ): Promise<{ itemId: string; webUrl: string | null; ownerId: string } | null> {
    try {
      const ref: any = await (this.prisma.quote.findUnique as any)({
        where: { id },
        select: { onedriveItemId: true, onedriveWebUrl: true, onedriveOwnerId: true },
      });
      if (ref?.onedriveItemId && ref?.onedriveOwnerId) {
        return { itemId: ref.onedriveItemId, webUrl: ref.onedriveWebUrl ?? null, ownerId: ref.onedriveOwnerId };
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
  async openInOneDrive(id: string, userId: string): Promise<{ webUrl: string; webDavUrl: string; itemId: string; reused: boolean }> {
    if (!userId) throw new BadRequestException('משתמש לא מזוהה — יש להתחבר מחדש');
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Quote not found');

    // קובץ פעיל קיים ושייך למשתמש הנוכחי? נחזיר אותו (שמירה על העריכות שכבר נעשו).
    const existing = await this.getOnedriveRef(id);
    if (existing && existing.ownerId === userId) {
      try {
        const item = await this.graphFiles.getItem(existing.ownerId, existing.itemId);
        if (item) return { webUrl: item.webUrl, webDavUrl: item.webDavUrl, itemId: item.itemId, reused: true };
      } catch (e: any) {
        this.logger.warn(`OneDrive getItem failed (${id}), will re-upload: ${e?.message || e}`);
      }
    }

    // אחרת — מעלים את המסמך הממוזג האחרון. שם דטרמיניסטי וייחודי-להצעה (כולל מזהה קצר),
    // כדי שטיוטות ללא מספר הצעה לא ידרסו זו את זו ב-OneDrive.
    const latest = await this.getLatestMergedDocument(id);
    let bytes: Buffer | null = null;
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
    const fileName = `הצעת מחיר ${quote.quoteNumber ? quote.quoteNumber + ' ' : ''}${id.slice(0, 8)}`.trim();

    const uploaded = await this.graphFiles.uploadEditable(userId, fileName, bytes);

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

    return { webUrl: uploaded.webUrl, webDavUrl: uploaded.webDavUrl, itemId: uploaded.itemId, reused: false };
  }
}
