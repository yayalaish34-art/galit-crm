import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** מקורות הגעה ("מקור הגעה") — רשימה גלובלית הניתנת-לעריכה, משותפת לכל הלקוחות. */
@Injectable()
export class LeadSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.leadSource.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        return this.prisma.$queryRawUnsafe(
          `SELECT * FROM "LeadSource" ORDER BY "sortOrder" ASC, "name" ASC`,
        );
      }
      throw e;
    }
  }

  private async nextSortOrder(): Promise<number> {
    try {
      const last = await this.prisma.leadSource.findFirst({
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      return (last?.sortOrder ?? 0) + 1;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
        const rows = await this.prisma.$queryRawUnsafe<{ m: number | bigint }[]>(
          `SELECT COALESCE(MAX("sortOrder"), 0) AS m FROM "LeadSource"`,
        );
        return Number(rows[0]?.m ?? 0) + 1;
      }
      throw e;
    }
  }

  /** יצירת מקור הגעה חדש (או החזרת הקיים אם השם כבר קיים). */
  async create(name: string) {
    const value = (name || '').trim();
    if (value.length < 1) throw new BadRequestException('נא להזין שם מקור הגעה');
    if (value.length > 120) throw new BadRequestException('שם מקור ההגעה ארוך מדי');

    // קיים כבר? מחזירים אותו (אידמפוטנטי — לא מכפילים).
    const existing = await this.prisma.leadSource
      .findUnique({ where: { name: value } })
      .catch(() => null);
    if (existing) return existing;

    let sortOrder: number;
    try {
      sortOrder = await this.nextSortOrder();
    } catch {
      throw new BadRequestException(
        'לא ניתן לקרוא סדר מיון מבסיס הנתונים. ודא שהמיגרציה הוחלה (טבלת LeadSource).',
      );
    }

    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "LeadSource" ("id", "name", "sortOrder", "isPreset", "createdAt")
        VALUES (${id}, ${value}, ${sortOrder}, ${false}, NOW())
        ON CONFLICT ("name") DO NOTHING
      `;
      const row = await this.prisma.leadSource.findUnique({ where: { name: value } }).catch(() => null);
      return row ?? { id, name: value, sortOrder, isPreset: false, createdAt: new Date() };
    } catch {
      throw new BadRequestException(
        'שמירת מקור ההגעה נכשלה. ודא שהמיגרציה הוחלה (LeadSource) ושבסיס הנתונים זמין.',
      );
    }
  }
}
