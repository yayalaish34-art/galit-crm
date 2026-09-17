import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * מונה סימוכין יומי אישי — פורמט SS+DDMMYY (לדוגמה 01160926: סידורי 01, 16/09/26),
 * מתאפס בכל יום לפי אזור זמן ישראל.
 *
 * כרגע רק ליורם (yoram@galit.co.il), על פי בקשתו: הצעות מחיר שהוא נציג המכירות /
 * המבצע / אחראי המעקב שלהן (ר' quotes.service.ts), וכן דוחות עובש ב-reporttt
 * שהוא ה"עורך" שלהם (קוראים לנתיב /reference-numbers/internal/next). שאר
 * המשתמשים ממשיכים במונה הגלובלי הרגיל.
 *
 * המונה משותף בין שתי המערכות — כדי שיום נתון לא ידווח על אותו סידורי פעמיים
 * (פעם בהצעה ופעם בדוח), שני הצדדים חייבים לעבור דרך הטבלה הזו ולא לספור לבד.
 */
@Injectable()
export class ReferenceNumbersService {
  private static readonly PERSONAL_REFERENCE_EMAILS = ['yoram@galit.co.il'];

  constructor(private readonly prisma: PrismaService) {}

  isPersonalReferenceEmail(email?: string | null): boolean {
    const v = (email ?? '').trim().toLowerCase();
    return !!v && ReferenceNumbersService.PERSONAL_REFERENCE_EMAILS.includes(v);
  }

  /** משתמשי ה-DB (id + name) שממוספרים בפורמט האישי, לצורך התאמת בעלים על הצעה. */
  async getPersonalReferenceUsers(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: { email: { in: ReferenceNumbersService.PERSONAL_REFERENCE_EMAILS } },
      select: { id: true, name: true },
    });
  }

  /** DDMMYY לפי אזור זמן ישראל, כך שהמונה מתאפס בחצות ישראל ולא UTC. */
  private todayDateKey(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return `${get('day')}${get('month')}${get('year')}`;
  }

  /**
   * הסימוכין הבא למשתמש היום. INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING
   * הוא אטומי — שתי קריאות מקבילות (אפילו משתי המערכות) לא יקבלו אותו סידורי.
   */
  async getNextForUser(userId: string): Promise<string> {
    const dateKey = this.todayDateKey();
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<{ lastSerial: number }>>`
      INSERT INTO "UserDailyReference" ("id", "userId", "dateKey", "lastSerial", "updatedAt")
      VALUES (${id}, ${userId}, ${dateKey}, 1, now())
      ON CONFLICT ("userId", "dateKey")
      DO UPDATE SET "lastSerial" = "UserDailyReference"."lastSerial" + 1, "updatedAt" = now()
      RETURNING "lastSerial"
    `;
    const serial = rows[0]?.lastSerial ?? 1;
    return `${String(serial).padStart(2, '0')}${dateKey}`;
  }

  /** כנ"ל, למי שיש בידו רק את כתובת המייל (reporttt לא מכיר מזהי משתמש של ה-CRM). */
  async getNextForEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) return null;
    return this.getNextForUser(user.id);
  }
}
