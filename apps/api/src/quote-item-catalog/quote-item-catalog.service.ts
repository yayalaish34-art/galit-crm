import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuoteItemCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.quoteItemCatalog.findMany({ orderBy: [{ isActive: 'desc' }, { itemCode: 'asc' }] });
  }

  findOne(id: string) {
    return this.prisma.quoteItemCatalog.findUnique({ where: { id } });
  }

  create(data: any) {
    return this.prisma.quoteItemCatalog.create({
      data: {
        itemCode: String(data?.itemCode || '').trim(),
        name: String(data?.name || '').trim(),
        description: data?.description ?? null,
        serviceCategory: data?.serviceCategory ?? null,
        serviceSubType: data?.serviceSubType ?? null,
        costPrice: Number(data?.costPrice) || 0,
        basePrice: Number(data?.basePrice) || 0,
        profitPercent:
          data?.profitPercent === undefined || data?.profitPercent === null || data?.profitPercent === ''
            ? null
            : Number(data.profitPercent),
        billingUnit: String(data?.billingUnit || 'יחידה'),
        vatPercent: Number(data?.vatPercent) || 0,
        isActive: data?.isActive !== false,
        requiresQuantity: !!data?.requiresQuantity,
        requiresSiteVisit: !!data?.requiresSiteVisit,
        requiresReport: !!data?.requiresReport,
        notes: data?.notes ?? null,
      },
    });
  }

  update(id: string, data: any) {
    return this.prisma.quoteItemCatalog.update({
      where: { id },
      data: {
        itemCode: data?.itemCode !== undefined ? String(data.itemCode || '').trim() : undefined,
        name: data?.name !== undefined ? String(data.name || '').trim() : undefined,
        description: data?.description !== undefined ? (data.description ?? null) : undefined,
        serviceCategory: data?.serviceCategory !== undefined ? (data.serviceCategory ?? null) : undefined,
        serviceSubType: data?.serviceSubType !== undefined ? (data.serviceSubType ?? null) : undefined,
        costPrice: data?.costPrice !== undefined ? (Number(data.costPrice) || 0) : undefined,
        basePrice: data?.basePrice !== undefined ? (Number(data.basePrice) || 0) : undefined,
        profitPercent:
          data?.profitPercent === undefined
            ? undefined
            : data.profitPercent === null || data.profitPercent === ''
              ? null
              : Number(data.profitPercent),
        billingUnit: data?.billingUnit !== undefined ? String(data.billingUnit || 'יחידה') : undefined,
        vatPercent: data?.vatPercent !== undefined ? (Number(data.vatPercent) || 0) : undefined,
        isActive: data?.isActive !== undefined ? !!data.isActive : undefined,
        requiresQuantity: data?.requiresQuantity !== undefined ? !!data.requiresQuantity : undefined,
        requiresSiteVisit: data?.requiresSiteVisit !== undefined ? !!data.requiresSiteVisit : undefined,
        requiresReport: data?.requiresReport !== undefined ? !!data.requiresReport : undefined,
        notes: data?.notes !== undefined ? (data.notes ?? null) : undefined,
      },
    });
  }

  remove(id: string) {
    return this.prisma.quoteItemCatalog.delete({ where: { id } });
  }
}

