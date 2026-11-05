import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * תבניות DOCX שמגיעות עם הקוד ונרשמות בבסיס הנתונים בעלייה.
 * אין גישה ישירה לבסיס הנתונים בפריסה (מיגרציות לא רצות מול ה-pooler), ולכן הרישום כאן.
 */
export const BUNDLED_TEMPLATES: { name: string; serviceType: string; docxTemplatePath: string }[] = [
  {
    name: 'קרינה - הצעת מחיר לבדיקת קרינה מרשת החשמל - מוסד חינוך',
    serviceType: 'קרינה',
    docxTemplatePath: 'קרינה-הצעת-מחיר-לבדיקת-קרינה-מרשת-החשמל-מוסד-חינוך.docx',
  },
  {
    name: 'קרינה - הצעת מחיר לבדיקת קרינה מרשת החשמל - מקומות עבודה',
    serviceType: 'קרינה',
    docxTemplatePath: 'קרינה-הצעת-מחיר-לבדיקת-קרינה-מרשת-החשמל-מקומות-עבודה.docx',
  },
];

@Injectable()
export class QuoteTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(QuoteTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    return this.registerBundledTemplates().catch((e) =>
      this.logger.error(`bundled quote templates not registered: ${e?.message || e}`),
    );
  }

  /**
   * יוצר שורה לכל תבנית מצורפת שאין לה עדיין שורה (לפי נתיב הקובץ, גם אם כובתה).
   * כך תבנית שמנהל השבית לא חוזרת לפעול; תבנית שנמחקה לגמרי תירשם שוב בעלייה הבאה.
   */
  async registerBundledTemplates(): Promise<void> {
    for (const t of BUNDLED_TEMPLATES) {
      const existing = await this.prisma.quoteTemplate.findFirst({
        where: { docxTemplatePath: t.docxTemplatePath },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.quoteTemplate.create({ data: { ...t, isActive: true } });
      this.logger.log(`registered quote template: ${t.name}`);
    }
  }

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
