import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExecutionCalendarEntryDto,
  ExecutionCalendarFilterDto,
  UpdateExecutionCalendarEntryDto,
} from './dto/execution-calendar.dto';

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
export class ExecutionCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private mapCreate(dto: CreateExecutionCalendarEntryDto): Prisma.ExecutionCalendarEntryCreateInput {
    const assignedUserId = trimOrNull(dto.assignedUserId);
    const customerId = trimOrNull(dto.customerId);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      date: parseOptionalDate(dto.date),
      startTime: trimOrNull(dto.startTime),
      endTime: trimOrNull(dto.endTime),
      assignedUser: assignedUserId ? { connect: { id: assignedUserId } } : undefined,
      assignedUserName: trimOrNull(dto.assignedUserName),
      title: trimOrNull(dto.title),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      customerName: trimOrNull(dto.customerName),
      relatedEntityType: trimOrNull(dto.relatedEntityType),
      relatedEntityId: trimOrNull(dto.relatedEntityId),
      entryType: trimOrNull(dto.entryType),
      status: trimOrNull(dto.status),
      notes: trimOrNull(dto.notes),
    };
  }

  private mapUpdate(dto: UpdateExecutionCalendarEntryDto): Prisma.ExecutionCalendarEntryUpdateInput {
    const assignedUserId = trimOrNull(dto.assignedUserId);
    const customerId = trimOrNull(dto.customerId);
    const data: Prisma.ExecutionCalendarEntryUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      date: parseOptionalDate(dto.date),
      startTime: trimOrNull(dto.startTime),
      endTime: trimOrNull(dto.endTime),
      assignedUserName: trimOrNull(dto.assignedUserName),
      title: trimOrNull(dto.title),
      customerName: trimOrNull(dto.customerName),
      relatedEntityType: trimOrNull(dto.relatedEntityType),
      relatedEntityId: trimOrNull(dto.relatedEntityId),
      entryType: trimOrNull(dto.entryType),
      status: trimOrNull(dto.status),
      notes: trimOrNull(dto.notes),
    };
    if (dto.assignedUserId !== undefined) {
      data.assignedUser = assignedUserId ? { connect: { id: assignedUserId } } : { disconnect: true };
    }
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  async findAll(filter: ExecutionCalendarFilterDto) {
    const where: Prisma.ExecutionCalendarEntryWhereInput = {};
    const andList: Prisma.ExecutionCalendarEntryWhereInput[] = [];

    if (filter.assignedUserId) andList.push({ assignedUserId: filter.assignedUserId });
    const exact = parseOptionalDate(filter.date);
    if (exact) {
      const s = new Date(exact);
      const e = new Date(exact);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      andList.push({ date: { gte: s, lte: e } });
    } else {
      const from = parseOptionalDate(filter.fromDate);
      const to = parseOptionalDate(filter.toDate);
      if (from || to) andList.push({ date: { gte: from ?? undefined, lte: to ?? undefined } });
    }
    if (andList.length) where.AND = andList;

    return this.prisma.executionCalendarEntry.findMany({
      where,
      include: {
        assignedUser: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.executionCalendarEntry.findUnique({
      where: { id },
      include: {
        assignedUser: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
  }

  create(body: CreateExecutionCalendarEntryDto) {
    return this.prisma.executionCalendarEntry.create({ data: this.mapCreate(body) });
  }

  update(id: string, body: UpdateExecutionCalendarEntryDto) {
    return this.prisma.executionCalendarEntry.update({
      where: { id },
      data: this.mapUpdate(body),
    });
  }
}
