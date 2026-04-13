import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEventHistoryDto,
  EventsHistoryFilterDto,
  UpdateEventHistoryDto,
} from './dto/events-history.dto';

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
export class EventsHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private mapCreate(dto: CreateEventHistoryDto): Prisma.EventHistoryCreateInput {
    const customerId = trimOrNull(dto.customerId);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      linkedCustomerId: trimOrNull(dto.linkedCustomerId),
      customerName: trimOrNull(dto.customerName),
      linkedCustomerName: trimOrNull(dto.linkedCustomerName),
      contactName: trimOrNull(dto.contactName),
      phone: trimOrNull(dto.phone),
      mobilePhone: trimOrNull(dto.mobilePhone),
      customerPhone1: trimOrNull(dto.customerPhone1),
      customerPhone2: trimOrNull(dto.customerPhone2),
      customerPhone3: trimOrNull(dto.customerPhone3),
      status: trimOrNull(dto.status),
      date: parseOptionalDate(dto.date),
      time: trimOrNull(dto.time),
      notes: trimOrNull(dto.notes),
      activityName: trimOrNull(dto.activityName),
      productName: trimOrNull(dto.productName),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      executorName: trimOrNull(dto.executorName),
      sourceName: trimOrNull(dto.sourceName),
      activityTreePath: trimOrNull(dto.activityTreePath),
      productTreePath: trimOrNull(dto.productTreePath),
      communicationFlag: dto.communicationFlag === undefined ? null : dto.communicationFlag,
    };
  }

  private mapUpdate(dto: UpdateEventHistoryDto): Prisma.EventHistoryUpdateInput {
    const customerId = trimOrNull(dto.customerId);
    const data: Prisma.EventHistoryUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      linkedCustomerId: trimOrNull(dto.linkedCustomerId),
      customerName: trimOrNull(dto.customerName),
      linkedCustomerName: trimOrNull(dto.linkedCustomerName),
      contactName: trimOrNull(dto.contactName),
      phone: trimOrNull(dto.phone),
      mobilePhone: trimOrNull(dto.mobilePhone),
      customerPhone1: trimOrNull(dto.customerPhone1),
      customerPhone2: trimOrNull(dto.customerPhone2),
      customerPhone3: trimOrNull(dto.customerPhone3),
      status: trimOrNull(dto.status),
      date: parseOptionalDate(dto.date),
      time: trimOrNull(dto.time),
      notes: trimOrNull(dto.notes),
      activityName: trimOrNull(dto.activityName),
      productName: trimOrNull(dto.productName),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      executorName: trimOrNull(dto.executorName),
      sourceName: trimOrNull(dto.sourceName),
      activityTreePath: trimOrNull(dto.activityTreePath),
      productTreePath: trimOrNull(dto.productTreePath),
      communicationFlag: dto.communicationFlag === undefined ? undefined : dto.communicationFlag,
    };
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  async findAll(filter: EventsHistoryFilterDto) {
    const where: Prisma.EventHistoryWhereInput = {};
    const andList: Prisma.EventHistoryWhereInput[] = [];

    const from = parseOptionalDate(filter.fromDate);
    const to = parseOptionalDate(filter.toDate);
    if (from || to) andList.push({ date: { gte: from ?? undefined, lte: to ?? undefined } });

    const customer = (filter.customer ?? '').trim();
    if (customer) {
      andList.push({
        OR: [
          { customerId: customer },
          { customerName: { contains: customer, mode: 'insensitive' } },
          { linkedCustomerName: { contains: customer, mode: 'insensitive' } },
          { customer: { name: { contains: customer, mode: 'insensitive' } } },
        ],
      });
    }
    if ((filter.contact ?? '').trim()) andList.push({ contactName: { contains: filter.contact!.trim(), mode: 'insensitive' } });
    if (filter.communicationFlag !== undefined) andList.push({ communicationFlag: filter.communicationFlag });
    if ((filter.activity ?? '').trim()) andList.push({ activityName: { contains: filter.activity!.trim(), mode: 'insensitive' } });
    if ((filter.product ?? '').trim()) andList.push({ productName: { contains: filter.product!.trim(), mode: 'insensitive' } });
    if ((filter.salesRep ?? '').trim()) andList.push({ salesRepresentativeName: { contains: filter.salesRep!.trim(), mode: 'insensitive' } });
    if ((filter.executor ?? '').trim()) andList.push({ executorName: { contains: filter.executor!.trim(), mode: 'insensitive' } });
    const text = (filter.text ?? '').trim();
    if (text) {
      andList.push({
        OR: [
          { importLegacyId: { contains: text, mode: 'insensitive' } },
          { notes: { contains: text, mode: 'insensitive' } },
          { sourceName: { contains: text, mode: 'insensitive' } },
          { activityTreePath: { contains: text, mode: 'insensitive' } },
          { productTreePath: { contains: text, mode: 'insensitive' } },
          { status: { contains: text, mode: 'insensitive' } },
        ],
      });
    }
    if (andList.length) where.AND = andList;

    return this.prisma.eventHistory.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { time: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.eventHistory.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  create(body: CreateEventHistoryDto) {
    return this.prisma.eventHistory.create({ data: this.mapCreate(body) });
  }

  update(id: string, body: UpdateEventHistoryDto) {
    return this.prisma.eventHistory.update({ where: { id }, data: this.mapUpdate(body) });
  }
}
