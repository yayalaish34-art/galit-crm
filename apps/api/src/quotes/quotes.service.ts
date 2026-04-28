import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
]);

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

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
    user,
  }: {
    projectId?: string;
    opportunityId?: string;
    customerId?: string;
    leadId?: string;
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

  /** Next display reference for new quotes (UI סימוכין) — counts quotes created this calendar month. */
  async getNextReference(): Promise<{ reference: string }> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `Q-${year}${month}-`;
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const count = await this.prisma.quote.count({
      where: { createdAt: { gte: startOfMonth } },
    });
    const next = String(count + 1).padStart(4, '0');
    return { reference: `${prefix}${next}` };
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
}
