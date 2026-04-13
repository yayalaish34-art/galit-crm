import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerOrderDto,
  CreateOrderChargeTransactionDto,
  CreateOrderDocumentDto,
  CreateOrderItemDto,
  OrdersFilterDto,
  UpdateCustomerOrderDto,
  UpdateOrderChargeTransactionDto,
  UpdateOrderDocumentDto,
  UpdateOrderItemDto,
} from './dto/orders.dto';

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

function decimalOrNull(v: unknown): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  try {
    return new Prisma.Decimal(String(v));
  } catch {
    return null;
  }
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private orderInclude = {
    items: { orderBy: [{ rowOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    documents: { orderBy: [{ rowOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    chargeTransactions: { orderBy: [{ rowOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    customer: { select: { id: true, name: true } },
  };

  private mapCreate(dto: CreateCustomerOrderDto): Prisma.CustomerOrderCreateInput {
    const customerId = trimOrNull(dto.customerId);
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      customer: customerId ? { connect: { id: customerId } } : undefined,
      customerName: trimOrNull(dto.customerName),
      orderDate: parseOptionalDate(dto.orderDate),
      followupDate: parseOptionalDate(dto.followupDate),
      status: trimOrNull(dto.status),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      contactName: trimOrNull(dto.contactName),
      executorName: trimOrNull(dto.executorName),
      linkedEntityId: trimOrNull(dto.linkedEntityId),
      parentOrderId: trimOrNull(dto.parentOrderId),
      priceList: trimOrNull(dto.priceList),
      currencyOrReadyStatus: trimOrNull(dto.currencyOrReadyStatus),
      exchangeRate: decimalOrNull(dto.exchangeRate),
      quoteReference: trimOrNull(dto.quoteReference),
      addressSummary: trimOrNull(dto.addressSummary),
      phoneSummary: trimOrNull(dto.phoneSummary),
      faxSummary: trimOrNull(dto.faxSummary),
      customerTypeSummary: trimOrNull(dto.customerTypeSummary),
      accountingNumber: trimOrNull(dto.accountingNumber),
      companyRegNumber: trimOrNull(dto.companyRegNumber),
      supplyAddressUntil: trimOrNull(dto.supplyAddressUntil),
      supplyPhone: trimOrNull(dto.supplyPhone),
      supplyDate: parseOptionalDate(dto.supplyDate),
      firstDate: parseOptionalDate(dto.firstDate),
      notes: trimOrNull(dto.notes),
      internalNotes: trimOrNull(dto.internalNotes),
      extraCost: decimalOrNull(dto.extraCost),
      orderSource: trimOrNull(dto.orderSource),
      lastUpdatedBy: trimOrNull(dto.lastUpdatedBy),
      confirmationSent: dto.confirmationSent === undefined ? null : dto.confirmationSent,
      lastUpdatedAtLegacy: parseOptionalDate(dto.lastUpdatedAtLegacy),
      lastUpdatedTime: trimOrNull(dto.lastUpdatedTime),
      billingSettings: trimOrNull(dto.billingSettings),
      nextBillingDate: parseOptionalDate(dto.nextBillingDate),
      billingStatus: trimOrNull(dto.billingStatus),
      billingFromDate: parseOptionalDate(dto.billingFromDate),
      recurringChargesCount: trimOrNull(dto.recurringChargesCount),
      billingEndMode: trimOrNull(dto.billingEndMode),
      billingAfterValue: trimOrNull(dto.billingAfterValue),
      accountingReceiptNumber: trimOrNull(dto.accountingReceiptNumber),
      accountingInvoiceNumber: trimOrNull(dto.accountingInvoiceNumber),
      accountingTransferDate: parseOptionalDate(dto.accountingTransferDate),
      accountingStatus: trimOrNull(dto.accountingStatus),
      nextAccountingTransferDate: parseOptionalDate(dto.nextAccountingTransferDate),
      accountingCategory: trimOrNull(dto.accountingCategory),
      accountingReferenceText: trimOrNull(dto.accountingReferenceText),
    };
  }

  private mapUpdate(dto: UpdateCustomerOrderDto): Prisma.CustomerOrderUpdateInput {
    const customerId = trimOrNull(dto.customerId);
    const data: Prisma.CustomerOrderUpdateInput = {
      importLegacyId: trimOrNull(dto.importLegacyId),
      customerName: trimOrNull(dto.customerName),
      orderDate: parseOptionalDate(dto.orderDate),
      followupDate: parseOptionalDate(dto.followupDate),
      status: trimOrNull(dto.status),
      salesRepresentativeName: trimOrNull(dto.salesRepresentativeName),
      contactName: trimOrNull(dto.contactName),
      executorName: trimOrNull(dto.executorName),
      linkedEntityId: trimOrNull(dto.linkedEntityId),
      parentOrderId: trimOrNull(dto.parentOrderId),
      priceList: trimOrNull(dto.priceList),
      currencyOrReadyStatus: trimOrNull(dto.currencyOrReadyStatus),
      exchangeRate: decimalOrNull(dto.exchangeRate),
      quoteReference: trimOrNull(dto.quoteReference),
      addressSummary: trimOrNull(dto.addressSummary),
      phoneSummary: trimOrNull(dto.phoneSummary),
      faxSummary: trimOrNull(dto.faxSummary),
      customerTypeSummary: trimOrNull(dto.customerTypeSummary),
      accountingNumber: trimOrNull(dto.accountingNumber),
      companyRegNumber: trimOrNull(dto.companyRegNumber),
      supplyAddressUntil: trimOrNull(dto.supplyAddressUntil),
      supplyPhone: trimOrNull(dto.supplyPhone),
      supplyDate: parseOptionalDate(dto.supplyDate),
      firstDate: parseOptionalDate(dto.firstDate),
      notes: trimOrNull(dto.notes),
      internalNotes: trimOrNull(dto.internalNotes),
      extraCost: decimalOrNull(dto.extraCost),
      orderSource: trimOrNull(dto.orderSource),
      lastUpdatedBy: trimOrNull(dto.lastUpdatedBy),
      confirmationSent: dto.confirmationSent === undefined ? undefined : dto.confirmationSent,
      lastUpdatedAtLegacy: parseOptionalDate(dto.lastUpdatedAtLegacy),
      lastUpdatedTime: trimOrNull(dto.lastUpdatedTime),
      billingSettings: trimOrNull(dto.billingSettings),
      nextBillingDate: parseOptionalDate(dto.nextBillingDate),
      billingStatus: trimOrNull(dto.billingStatus),
      billingFromDate: parseOptionalDate(dto.billingFromDate),
      recurringChargesCount: trimOrNull(dto.recurringChargesCount),
      billingEndMode: trimOrNull(dto.billingEndMode),
      billingAfterValue: trimOrNull(dto.billingAfterValue),
      accountingReceiptNumber: trimOrNull(dto.accountingReceiptNumber),
      accountingInvoiceNumber: trimOrNull(dto.accountingInvoiceNumber),
      accountingTransferDate: parseOptionalDate(dto.accountingTransferDate),
      accountingStatus: trimOrNull(dto.accountingStatus),
      nextAccountingTransferDate: parseOptionalDate(dto.nextAccountingTransferDate),
      accountingCategory: trimOrNull(dto.accountingCategory),
      accountingReferenceText: trimOrNull(dto.accountingReferenceText),
    };
    if (dto.customerId !== undefined) {
      data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
    }
    return data;
  }

  private mapItemCreate(dto: CreateOrderItemDto): Prisma.CustomerOrderItemCreateWithoutOrderInput {
    return {
      rowOrder: dto.rowOrder ?? 0,
      productCode: trimOrNull(dto.productCode),
      sku: trimOrNull(dto.sku),
      productDescription: trimOrNull(dto.productDescription),
      distributionChannel: trimOrNull(dto.distributionChannel),
      quantity: decimalOrNull(dto.quantity),
      price: decimalOrNull(dto.price),
      discountPercent: decimalOrNull(dto.discountPercent),
      total: decimalOrNull(dto.total),
    };
  }

  private mapItemUpdate(dto: UpdateOrderItemDto): Prisma.CustomerOrderItemUpdateInput {
    return {
      rowOrder: dto.rowOrder ?? undefined,
      productCode: trimOrNull(dto.productCode),
      sku: trimOrNull(dto.sku),
      productDescription: trimOrNull(dto.productDescription),
      distributionChannel: trimOrNull(dto.distributionChannel),
      quantity: decimalOrNull(dto.quantity),
      price: decimalOrNull(dto.price),
      discountPercent: decimalOrNull(dto.discountPercent),
      total: decimalOrNull(dto.total),
    };
  }

  private mapDocumentCreate(dto: CreateOrderDocumentDto): Prisma.OrderDocumentCreateWithoutOrderInput {
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      rowOrder: dto.rowOrder ?? 0,
      documentDescription: trimOrNull(dto.documentDescription),
      documentType: trimOrNull(dto.documentType),
      fileName: trimOrNull(dto.fileName),
      filePath: trimOrNull(dto.filePath),
      documentDate: parseOptionalDate(dto.documentDate),
      uploadedBy: trimOrNull(dto.uploadedBy),
    };
  }

  private mapDocumentUpdate(dto: UpdateOrderDocumentDto): Prisma.OrderDocumentUpdateInput {
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      rowOrder: dto.rowOrder ?? undefined,
      documentDescription: trimOrNull(dto.documentDescription),
      documentType: trimOrNull(dto.documentType),
      fileName: trimOrNull(dto.fileName),
      filePath: trimOrNull(dto.filePath),
      documentDate: parseOptionalDate(dto.documentDate),
      uploadedBy: trimOrNull(dto.uploadedBy),
    };
  }

  private mapChargeCreate(
    dto: CreateOrderChargeTransactionDto,
  ): Prisma.OrderChargeTransactionCreateWithoutOrderInput {
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      rowOrder: dto.rowOrder ?? 0,
      periodNumber: trimOrNull(dto.periodNumber),
      approvalNumber: trimOrNull(dto.approvalNumber),
      chargeDate: parseOptionalDate(dto.chargeDate),
      billingMethod: trimOrNull(dto.billingMethod),
      transactionType: trimOrNull(dto.transactionType),
      chargeAmount: decimalOrNull(dto.chargeAmount),
    };
  }

  private mapChargeUpdate(dto: UpdateOrderChargeTransactionDto): Prisma.OrderChargeTransactionUpdateInput {
    return {
      importLegacyId: trimOrNull(dto.importLegacyId),
      rowOrder: dto.rowOrder ?? undefined,
      periodNumber: trimOrNull(dto.periodNumber),
      approvalNumber: trimOrNull(dto.approvalNumber),
      chargeDate: parseOptionalDate(dto.chargeDate),
      billingMethod: trimOrNull(dto.billingMethod),
      transactionType: trimOrNull(dto.transactionType),
      chargeAmount: decimalOrNull(dto.chargeAmount),
    };
  }

  async findAll(filter: OrdersFilterDto) {
    const where: Prisma.CustomerOrderWhereInput = {};
    const andList: Prisma.CustomerOrderWhereInput[] = [];
    const from = parseOptionalDate(filter.fromDate);
    const to = parseOptionalDate(filter.toDate);
    if (from || to) andList.push({ orderDate: { gte: from ?? undefined, lte: to ?? undefined } });
    if ((filter.status ?? '').trim()) andList.push({ status: { contains: filter.status!.trim(), mode: 'insensitive' } });
    if ((filter.customer ?? '').trim()) {
      const q = filter.customer!.trim();
      andList.push({
        OR: [
          { customerId: q },
          { customerName: { contains: q, mode: 'insensitive' } },
          { contactName: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (andList.length) where.AND = andList;
    return this.prisma.customerOrder.findMany({
      where,
      include: this.orderInclude,
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.customerOrder.findUnique({ where: { id }, include: this.orderInclude });
    if (!row) throw new NotFoundException('הזמנה לא נמצאה');
    return row;
  }

  create(body: CreateCustomerOrderDto) {
    return this.prisma.customerOrder.create({ data: this.mapCreate(body), include: this.orderInclude });
  }

  update(id: string, body: UpdateCustomerOrderDto) {
    return this.prisma.customerOrder.update({ where: { id }, data: this.mapUpdate(body), include: this.orderInclude });
  }

  async createItem(orderId: string, body: CreateOrderItemDto) {
    await this.findOne(orderId);
    const item = await this.prisma.customerOrderItem.create({
      data: { orderId, ...this.mapItemCreate(body) },
    });
    return item;
  }

  async updateItem(orderId: string, itemId: string, body: UpdateOrderItemDto) {
    const exists = await this.prisma.customerOrderItem.findFirst({ where: { id: itemId, orderId }, select: { id: true } });
    if (!exists) throw new NotFoundException('שורת הזמנה לא נמצאה');
    return this.prisma.customerOrderItem.update({ where: { id: itemId }, data: this.mapItemUpdate(body) });
  }

  async removeItem(orderId: string, itemId: string) {
    const exists = await this.prisma.customerOrderItem.findFirst({ where: { id: itemId, orderId }, select: { id: true } });
    if (!exists) throw new NotFoundException('שורת הזמנה לא נמצאה');
    await this.prisma.customerOrderItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  async listDocuments(orderId: string) {
    await this.findOne(orderId);
    return this.prisma.orderDocument.findMany({
      where: { orderId },
      orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createDocument(orderId: string, body: CreateOrderDocumentDto) {
    await this.findOne(orderId);
    return this.prisma.orderDocument.create({
      data: { orderId, ...this.mapDocumentCreate(body) },
    });
  }

  async updateDocument(orderId: string, documentId: string, body: UpdateOrderDocumentDto) {
    const exists = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('מסמך הזמנה לא נמצא');
    return this.prisma.orderDocument.update({ where: { id: documentId }, data: this.mapDocumentUpdate(body) });
  }

  async removeDocument(orderId: string, documentId: string) {
    const exists = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('מסמך הזמנה לא נמצא');
    await this.prisma.orderDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  async listChargeTransactions(orderId: string) {
    await this.findOne(orderId);
    return this.prisma.orderChargeTransaction.findMany({
      where: { orderId },
      orderBy: [{ rowOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createChargeTransaction(orderId: string, body: CreateOrderChargeTransactionDto) {
    await this.findOne(orderId);
    return this.prisma.orderChargeTransaction.create({
      data: { orderId, ...this.mapChargeCreate(body) },
    });
  }

  async updateChargeTransaction(
    orderId: string,
    transactionId: string,
    body: UpdateOrderChargeTransactionDto,
  ) {
    const exists = await this.prisma.orderChargeTransaction.findFirst({
      where: { id: transactionId, orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('תנועת חיוב לא נמצאה');
    return this.prisma.orderChargeTransaction.update({
      where: { id: transactionId },
      data: this.mapChargeUpdate(body),
    });
  }

  async removeChargeTransaction(orderId: string, transactionId: string) {
    const exists = await this.prisma.orderChargeTransaction.findFirst({
      where: { id: transactionId, orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('תנועת חיוב לא נמצאה');
    await this.prisma.orderChargeTransaction.delete({ where: { id: transactionId } });
    return { ok: true };
  }
}
