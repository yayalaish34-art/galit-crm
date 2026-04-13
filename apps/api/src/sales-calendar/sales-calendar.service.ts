import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSalesCalendarEntryDto,
  SalesCalendarFilterDto,
  UpdateSalesCalendarEntryDto,
} from './dto/sales-calendar.dto';

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class SalesCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private mapCreate(dto: CreateSalesCalendarEntryDto): Prisma.SalesRepCalendarEntryCreateInput {
    const salesRepId = trimOrNull(dto.salesRepresentativeId);
    const customerId = trimOrNull(dto.customerId);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      salesRepresentative: salesRepId ? { connect: { id: salesRepId } } : undefined,
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      date: parseOptionalDate(dto.date),
      startTime: trimOrNull(dto.startTime),
      endTime: trimOrNull(dto.endTime),
      title: trimOrNull(dto.title),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      customerName: trimOrNull(dto.customerName),
      notes: trimOrNull(dto.notes),
      entryType: trimOrNull(dto.entryType),
      relatedEntityType: trimOrNull(dto.relatedEntityType),
      relatedEntityId: trimOrNull(dto.relatedEntityId),
      status: trimOrNull(dto.status),
    };
  }

  private mapUpdate(dto: UpdateSalesCalendarEntryDto): Prisma.SalesRepCalendarEntryUpdateInput {
    const salesRepId = trimOrNull(dto.salesRepresentativeId);
    const customerId = trimOrNull(dto.customerId);
    const data: Prisma.SalesRepCalendarEntryUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      date: parseOptionalDate(dto.date),
      startTime: trimOrNull(dto.startTime),
      endTime: trimOrNull(dto.endTime),
      title: trimOrNull(dto.title),
      customerName: trimOrNull(dto.customerName),
      notes: trimOrNull(dto.notes),
      entryType: trimOrNull(dto.entryType),
      relatedEntityType: trimOrNull(dto.relatedEntityType),
      relatedEntityId: trimOrNull(dto.relatedEntityId),
      status: trimOrNull(dto.status),
    };
    if (dto.salesRepresentativeId !== undefined) {
      data.salesRepresentative = salesRepId ? { connect: { id: salesRepId } } : { disconnect: true };
    }
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  async findAll(filter: SalesCalendarFilterDto) {
    const where: Prisma.SalesRepCalendarEntryWhereInput = {};
    const andList: Prisma.SalesRepCalendarEntryWhereInput[] = [];

    if (filter.salesRepresentativeId) andList.push({ salesRepresentativeId: filter.salesRepresentativeId });

    const exactDate = parseOptionalDate(filter.date);
    if (exactDate) {
      const dayStart = new Date(exactDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(exactDate);
      dayEnd.setHours(23, 59, 59, 999);
      andList.push({ date: { gte: dayStart, lte: dayEnd } });
    } else {
      const from = parseOptionalDate(filter.fromDate);
      const to = parseOptionalDate(filter.toDate);
      if (from || to) andList.push({ date: { gte: from ?? undefined, lte: to ?? undefined } });
    }

    if (andList.length) where.AND = andList;

    return this.prisma.salesRepCalendarEntry.findMany({
      where,
      include: {
        salesRepresentative: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.salesRepCalendarEntry.findUnique({
      where: { id },
      include: {
        salesRepresentative: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
  }

  create(body: CreateSalesCalendarEntryDto) {
    return this.prisma.salesRepCalendarEntry.create({ data: this.mapCreate(body) });
  }

  update(id: string, body: UpdateSalesCalendarEntryDto) {
    return this.prisma.salesRepCalendarEntry.update({
      where: { id },
      data: this.mapUpdate(body),
    });
  }
}
