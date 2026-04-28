import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuoteTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters?: { serviceType?: string; activeOnly?: boolean }) {
    return this.prisma.quoteTemplate.findMany({
      where: {
        ...(filters?.serviceType ? { serviceType: filters.serviceType } : {}),
        ...(filters?.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ serviceType: 'asc' }, { name: 'asc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.quoteTemplate.findUnique({ where: { id } });
  }

  create(data: any) {
    return this.prisma.quoteTemplate.create({
      data: {
        name: data.name,
        serviceType: data.serviceType,
        isActive: data.isActive !== false,
        introHtml: data.introHtml ?? null,
        bodyHtml: data.bodyHtml ?? null,
        closingHtml: data.closingHtml ?? null,
        termsHtml: data.termsHtml ?? null,
        variablesHelp: data.variablesHelp ?? null,
        defaultLineItems: data.defaultLineItems ?? undefined,
        docxTemplatePath: data.docxTemplatePath ?? null,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.quoteTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quote template not found');
    return this.prisma.quoteTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.serviceType !== undefined ? { serviceType: data.serviceType } : {}),
        ...(data.isActive !== undefined ? { isActive: !!data.isActive } : {}),
        ...(data.introHtml !== undefined ? { introHtml: data.introHtml } : {}),
        ...(data.bodyHtml !== undefined ? { bodyHtml: data.bodyHtml } : {}),
        ...(data.closingHtml !== undefined ? { closingHtml: data.closingHtml } : {}),
        ...(data.termsHtml !== undefined ? { termsHtml: data.termsHtml } : {}),
        ...(data.variablesHelp !== undefined ? { variablesHelp: data.variablesHelp } : {}),
        ...(data.defaultLineItems !== undefined ? { defaultLineItems: data.defaultLineItems } : {}),
        ...(data.docxTemplatePath !== undefined ? { docxTemplatePath: data.docxTemplatePath } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.quoteTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quote template not found');
    return this.prisma.quoteTemplate.delete({ where: { id } });
  }
}
