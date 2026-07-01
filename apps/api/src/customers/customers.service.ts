import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCustomerDocumentDto,
  ReplaceAdditionalDataDto,
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

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly PRESET_CLASSIFICATION_CODES = new Set(['COMPANY', 'PUBLIC', 'PRIVATE']);

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
    if (dto.phone !== undefined) out.phone = dto.phone ?? '';
    if (dto.email !== undefined) out.email = dto.email ?? '';
    if (dto.city !== undefined) out.city = dto.city ?? '';
    if (dto.address !== undefined) out.address = dto.address;
    if (dto.status !== undefined) out.status = dto.status;
    if (dto.services !== undefined) out.services = dto.services;
    if (dto.notes !== undefined) out.notes = dto.notes;
    if (dto.leadSource !== undefined) out.leadSource = dto.leadSource;
    if (dto.phone2 !== undefined) out.phone2 = dto.phone2;
    if (dto.phone3 !== undefined) out.phone3 = dto.phone3;
    if (dto.fax !== undefined) out.fax = dto.fax;
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
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
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
        phone: (data?.phone || '').toString().trim(),
        mobile: (data?.mobile || '').toString().trim(),
        fax: (data?.fax || '').toString().trim(),
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
        phone: data?.phone !== undefined ? (data.phone || '').toString().trim() : undefined,
        mobile: data?.mobile !== undefined ? (data.mobile || '').toString().trim() : undefined,
        fax: data?.fax !== undefined ? (data.fax || '').toString().trim() : undefined,
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
    return this.prisma.customer.create({ data });
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
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  async updateCustomerDocument(customerId: string, documentId: string, dto: UpdateCustomerDocumentDto) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, customerId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('מסמך לא נמצא');
    const nextName = dto.name !== undefined ? dto.name?.trim() : undefined;
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
