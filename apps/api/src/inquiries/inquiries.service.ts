import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto, InquiryFilterDto, InquiryJournalFilterDto, UpdateInquiryDto } from './dto/inquiry.dto';

function trimOrNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t ? t : null;
}

function parseOptionalDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  private toCreateInput(dto: CreateInquiryDto): Prisma.InquiryCreateInput {
    const customerId = trimOrNull(dto.customerId as string | null | undefined);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      date: parseOptionalDate(dto.date),
      time: trimOrNull(dto.time),
      trackingDate: parseOptionalDate(dto.trackingDate),
      receivedDate: parseOptionalDate(dto.receivedDate),
      hour: trimOrNull(dto.hour),
      customerName: trimOrNull(dto.customerName),
      customerCode: trimOrNull(dto.customerCode),
      productCode: trimOrNull(dto.productCode),
      contactName: trimOrNull(dto.contactName),
      phone: trimOrNull(dto.phone),
      displayName: trimOrNull(dto.displayName),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      status: trimOrNull(dto.status),
      inquiryDuration: trimOrNull(dto.inquiryDuration),
      homePhone: trimOrNull(dto.homePhone),
      mobilePhone: trimOrNull(dto.mobilePhone),
      workPhone: trimOrNull(dto.workPhone),
      hValue: trimOrNull(dto.hValue),
      productName: trimOrNull(dto.productName),
      faultCode: trimOrNull(dto.faultCode),
      eValue: trimOrNull(dto.eValue),
      dValue: trimOrNull(dto.dValue),
      treatmentCode: trimOrNull(dto.treatmentCode),
      handlerName: trimOrNull(dto.handlerName),
      followUp: dto.followUp === undefined ? null : dto.followUp,
      isOpen: dto.isOpen === undefined ? null : dto.isOpen,
      isClosed: dto.isClosed === undefined ? null : dto.isClosed,
      isUrgent: dto.isUrgent === undefined ? null : dto.isUrgent,
      campaignName: trimOrNull(dto.campaignName),
      operationName: trimOrNull(dto.operationName),
      lastStatusNotes: trimOrNull(dto.lastStatusNotes),
      faultDescription: trimOrNull(dto.faultDescription),
      description: trimOrNull(dto.description),
    };
  }

  private toUpdateInput(dto: UpdateInquiryDto): Prisma.InquiryUpdateInput {
    const customerId = trimOrNull(dto.customerId as string | null | undefined);
    const data: Prisma.InquiryUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      date: parseOptionalDate(dto.date),
      time: trimOrNull(dto.time),
      trackingDate: parseOptionalDate(dto.trackingDate),
      receivedDate: parseOptionalDate(dto.receivedDate),
      hour: trimOrNull(dto.hour),
      customerName: trimOrNull(dto.customerName),
      customerCode: trimOrNull(dto.customerCode),
      productCode: trimOrNull(dto.productCode),
      contactName: trimOrNull(dto.contactName),
      phone: trimOrNull(dto.phone),
      displayName: trimOrNull(dto.displayName),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      status: trimOrNull(dto.status),
      inquiryDuration: trimOrNull(dto.inquiryDuration),
      homePhone: trimOrNull(dto.homePhone),
      mobilePhone: trimOrNull(dto.mobilePhone),
      workPhone: trimOrNull(dto.workPhone),
      hValue: trimOrNull(dto.hValue),
      productName: trimOrNull(dto.productName),
      faultCode: trimOrNull(dto.faultCode),
      eValue: trimOrNull(dto.eValue),
      dValue: trimOrNull(dto.dValue),
      treatmentCode: trimOrNull(dto.treatmentCode),
      handlerName: trimOrNull(dto.handlerName),
      followUp: dto.followUp === undefined ? undefined : dto.followUp,
      isOpen: dto.isOpen === undefined ? undefined : dto.isOpen,
      isClosed: dto.isClosed === undefined ? undefined : dto.isClosed,
      isUrgent: dto.isUrgent === undefined ? undefined : dto.isUrgent,
      campaignName: trimOrNull(dto.campaignName),
      operationName: trimOrNull(dto.operationName),
      lastStatusNotes: trimOrNull(dto.lastStatusNotes),
      faultDescription: trimOrNull(dto.faultDescription),
      description: trimOrNull(dto.description),
    };
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  async findAll(filter: InquiryFilterDto) {
    const where: Prisma.InquiryWhereInput = {};

    const fromDate = parseOptionalDate(filter.fromDate);
    const toDate = parseOptionalDate(filter.toDate);
    if (fromDate || toDate) {
      where.date = {
        gte: fromDate ?? undefined,
        lte: toDate ?? undefined,
      };
    }

    const customer = (filter.customer ?? '').trim();
    if (customer) {
      where.OR = [
        { customerId: customer },
        { customerCode: { contains: customer, mode: 'insensitive' } },
        { customer: { name: { contains: customer, mode: 'insensitive' } } },
      ];
    }

    const text = (filter.text ?? '').trim();
    if (text) {
      const textWhere: Prisma.InquiryWhereInput = {
        OR: [
          { importLegacyId: { contains: text, mode: 'insensitive' } },
          { contactName: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text, mode: 'insensitive' } },
          { customerCode: { contains: text, mode: 'insensitive' } },
          { productCode: { contains: text, mode: 'insensitive' } },
          { productName: { contains: text, mode: 'insensitive' } },
          { faultCode: { contains: text, mode: 'insensitive' } },
          { treatmentCode: { contains: text, mode: 'insensitive' } },
          { handlerName: { contains: text, mode: 'insensitive' } },
          { description: { contains: text, mode: 'insensitive' } },
        ],
      };
      if (where.AND) {
        where.AND = [...(where.AND as Prisma.InquiryWhereInput[]), textWhere];
      } else if (Object.keys(where).length > 0) {
        where.AND = [textWhere];
      } else {
        Object.assign(where, textWhere);
      }
    }

    return this.prisma.inquiry.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findJournal(filter: InquiryJournalFilterDto) {
    const where: Prisma.InquiryWhereInput = {};
    const andList: Prisma.InquiryWhereInput[] = [];

    const fromDate = parseOptionalDate(filter.fromDate);
    const toDate = parseOptionalDate(filter.toDate);
    if (fromDate || toDate) {
      andList.push({
        OR: [
          { trackingDate: { gte: fromDate ?? undefined, lte: toDate ?? undefined } },
          { receivedDate: { gte: fromDate ?? undefined, lte: toDate ?? undefined } },
          { date: { gte: fromDate ?? undefined, lte: toDate ?? undefined } },
        ],
      });
    }

    const customer = (filter.customer ?? '').trim();
    if (customer) {
      andList.push({
        OR: [
          { customerId: customer },
          { customerName: { contains: customer, mode: 'insensitive' } },
          { customerCode: { contains: customer, mode: 'insensitive' } },
          { customer: { name: { contains: customer, mode: 'insensitive' } } },
        ],
      });
    }

    const status = (filter.status ?? '').trim();
    if (status) andList.push({ status: { contains: status, mode: 'insensitive' } });
    const salesRep = (filter.salesRep ?? '').trim();
    if (salesRep) andList.push({ salesRepresentativeName: { contains: salesRep, mode: 'insensitive' } });
    const campaign = (filter.campaign ?? '').trim();
    if (campaign) andList.push({ campaignName: { contains: campaign, mode: 'insensitive' } });
    const product = (filter.product ?? '').trim();
    if (product) andList.push({ productName: { contains: product, mode: 'insensitive' } });

    if (filter.isOpen === true) andList.push({ isOpen: true });
    if (filter.isClosed === true) andList.push({ isClosed: true });
    if (filter.isUrgent === true) andList.push({ isUrgent: true });

    const text = (filter.text ?? '').trim();
    if (text) {
      andList.push({
        OR: [
          { importLegacyId: { contains: text, mode: 'insensitive' } },
          { customerName: { contains: text, mode: 'insensitive' } },
          { contactName: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text, mode: 'insensitive' } },
          { productName: { contains: text, mode: 'insensitive' } },
          { displayName: { contains: text, mode: 'insensitive' } },
          { salesRepresentativeName: { contains: text, mode: 'insensitive' } },
          { status: { contains: text, mode: 'insensitive' } },
          { lastStatusNotes: { contains: text, mode: 'insensitive' } },
          { faultDescription: { contains: text, mode: 'insensitive' } },
          { description: { contains: text, mode: 'insensitive' } },
        ],
      });
    }

    if (andList.length) where.AND = andList;

    return this.prisma.inquiry.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ trackingDate: 'desc' }, { receivedDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.inquiry.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  create(body: CreateInquiryDto) {
    return this.prisma.inquiry.create({ data: this.toCreateInput(body) });
  }

  update(id: string, body: UpdateInquiryDto) {
    return this.prisma.inquiry.update({
      where: { id },
      data: this.toUpdateInput(body),
    });
  }
}
