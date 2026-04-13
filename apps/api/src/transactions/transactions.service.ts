import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  TransactionJournalFilterDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

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
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private toCreateInput(dto: CreateTransactionDto): Prisma.TransactionJournalEntryCreateInput {
    const customerId = trimOrNull(dto.customerId);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      number: trimOrNull(dto.number),
      status: trimOrNull(dto.status),
      workStatus: trimOrNull(dto.workStatus),
      weekday: trimOrNull(dto.weekday),
      date: parseOptionalDate(dto.date),
      deliveryDate: parseOptionalDate(dto.deliveryDate),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      customerName: trimOrNull(dto.customerName),
      contactName: trimOrNull(dto.contactName),
      linkedCustomerName: trimOrNull(dto.linkedCustomerName),
      transactionType: trimOrNull(dto.transactionType),
      productName: trimOrNull(dto.productName),
      quantity: dto.quantity == null ? null : new Prisma.Decimal(dto.quantity),
      price: dto.price == null ? null : new Prisma.Decimal(dto.price),
      deliveryLocation: trimOrNull(dto.deliveryLocation),
      coordinateDay: trimOrNull(dto.coordinateDay),
      phone: trimOrNull(dto.phone),
      basketOrRefNumber: trimOrNull(dto.basketOrRefNumber),
      stage: trimOrNull(dto.stage),
      supplierName: trimOrNull(dto.supplierName),
      notes: trimOrNull(dto.notes),
    };
  }

  private toUpdateInput(dto: UpdateTransactionDto): Prisma.TransactionJournalEntryUpdateInput {
    const customerId = trimOrNull(dto.customerId);
    const data: Prisma.TransactionJournalEntryUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      number: trimOrNull(dto.number),
      status: trimOrNull(dto.status),
      workStatus: trimOrNull(dto.workStatus),
      weekday: trimOrNull(dto.weekday),
      date: parseOptionalDate(dto.date),
      deliveryDate: parseOptionalDate(dto.deliveryDate),
      customerName: trimOrNull(dto.customerName),
      contactName: trimOrNull(dto.contactName),
      linkedCustomerName: trimOrNull(dto.linkedCustomerName),
      transactionType: trimOrNull(dto.transactionType),
      productName: trimOrNull(dto.productName),
      quantity: dto.quantity == null ? null : new Prisma.Decimal(dto.quantity),
      price: dto.price == null ? null : new Prisma.Decimal(dto.price),
      deliveryLocation: trimOrNull(dto.deliveryLocation),
      coordinateDay: trimOrNull(dto.coordinateDay),
      phone: trimOrNull(dto.phone),
      basketOrRefNumber: trimOrNull(dto.basketOrRefNumber),
      stage: trimOrNull(dto.stage),
      supplierName: trimOrNull(dto.supplierName),
      notes: trimOrNull(dto.notes),
    };
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  async findJournal(filter: TransactionJournalFilterDto) {
    const where: Prisma.TransactionJournalEntryWhereInput = {};
    const andList: Prisma.TransactionJournalEntryWhereInput[] = [];

    const fromDate = parseOptionalDate(filter.fromDate);
    const toDate = parseOptionalDate(filter.toDate);
    if (fromDate || toDate) andList.push({ date: { gte: fromDate ?? undefined, lte: toDate ?? undefined } });

    const fromSupply = parseOptionalDate(filter.fromDeliveryDate);
    const toSupply = parseOptionalDate(filter.toDeliveryDate);
    if (fromSupply || toSupply) andList.push({ deliveryDate: { gte: fromSupply ?? undefined, lte: toSupply ?? undefined } });

    const customer = (filter.customer ?? '').trim();
    if (customer) {
      andList.push({
        OR: [
          { customerId: customer },
          { customerName: { contains: customer, mode: 'insensitive' } },
          { contactName: { contains: customer, mode: 'insensitive' } },
          { linkedCustomerName: { contains: customer, mode: 'insensitive' } },
          { customer: { name: { contains: customer, mode: 'insensitive' } } },
        ],
      });
    }
    if ((filter.product ?? '').trim()) andList.push({ productName: { contains: filter.product!.trim(), mode: 'insensitive' } });
    if ((filter.supplier ?? '').trim()) andList.push({ supplierName: { contains: filter.supplier!.trim(), mode: 'insensitive' } });
    if ((filter.stage ?? '').trim()) andList.push({ stage: { contains: filter.stage!.trim(), mode: 'insensitive' } });
    if ((filter.status ?? '').trim()) andList.push({ status: { contains: filter.status!.trim(), mode: 'insensitive' } });

    const text = (filter.text ?? '').trim();
    if (text) {
      andList.push({
        OR: [
          { importLegacyId: { contains: text, mode: 'insensitive' } },
          { number: { contains: text, mode: 'insensitive' } },
          { customerName: { contains: text, mode: 'insensitive' } },
          { contactName: { contains: text, mode: 'insensitive' } },
          { productName: { contains: text, mode: 'insensitive' } },
          { transactionType: { contains: text, mode: 'insensitive' } },
          { notes: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text, mode: 'insensitive' } },
        ],
      });
    }

    if (andList.length) where.AND = andList;

    return this.prisma.transactionJournalEntry.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.transactionJournalEntry.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  create(body: CreateTransactionDto) {
    return this.prisma.transactionJournalEntry.create({ data: this.toCreateInput(body) });
  }

  update(id: string, body: UpdateTransactionDto) {
    return this.prisma.transactionJournalEntry.update({
      where: { id },
      data: this.toUpdateInput(body),
    });
  }
}
