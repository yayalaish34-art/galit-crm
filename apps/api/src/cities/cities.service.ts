import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ערים — רשימה גלובלית הניתנת-לעריכה, משותפת לכל המסכים.
 *
 * **הבאג שזה מתקן:** שדה "עיר" בשלב "פתיחת פנייה" מאפשר להקליד עיר שאינה
 * ברשימה וללחוץ "הוסף עיר: «X»". זה עבד — הערך נכנס ללקוח ונשמר — אבל
 * הרשימה עצמה הייתה מוקשחת בקוד הלקוח בשלושה מקומות, ולכן העיר החדשה לא
 * נשמרה בשום מקום: בפעם הבאה שנפתחה הרשימה היא לא הופיעה בה, והמסך הציע
 * שוב "הוסף עיר" — כאילו שום דבר לא קרה.
 *
 * מקביל 1:1 ל-LeadSourcesService, בכוונה: אותו מסך, אותה התנהגות שהמשתמש
 * כבר מכיר מ"מקור הגעה".
 */
@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.city.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.city.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }

  /**
   * הוספת עיר (או החזרת הקיימת אם השם כבר קיים) — אידמפוטנטי.
   *
   * ההוספה נעשית תוך כדי מילוי טופס, ולכן היא לא אמורה להיכשל על "כבר קיים":
   * שני עובדים שמקלידים את אותה עיר באותו רגע צריכים שניהם לקבל 200.
   */
  async create(name: string) {
    const value = (name || '').trim().replace(/\s+/g, ' ');
    if (value.length < 2) throw new BadRequestException('נא להזין שם עיר');
    if (value.length > 120) throw new BadRequestException('שם העיר ארוך מדי');

    const existing = await this.prisma.city.findUnique({ where: { name: value } }).catch(() => null);
    if (existing) return existing;

    const id = randomUUID();
    const sortOrder = await this.nextSortOrder();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "City" ("id", "name", "sortOrder", "isPreset", "createdAt")
        VALUES (${id}, ${value}, ${sortOrder}, ${false}, NOW())
        ON CONFLICT ("name") DO NOTHING
      `;
      const row = await this.prisma.city.findUnique({ where: { name: value } }).catch(() => null);
      return row ?? { id, name: value, sortOrder, isPreset: false, createdAt: new Date() };
    } catch {
      throw new BadRequestException(
        'שמירת העיר נכשלה. ודא שהמיגרציה הוחלה (טבלת City) ושבסיס הנתונים זמין.',
      );
    }
  }
}
