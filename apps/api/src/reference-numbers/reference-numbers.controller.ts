import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ReferenceNumbersService } from './reference-numbers.service';

/**
 * הנתיב ש-reporttt (מערכת חיצונית, בלי JWT של משתמש) קורא לו כדי להקצות
 * סימוכין אישי ליורם על דוח עובש שהוא ה"עורך" שלו — כך שהמונה היומי משותף
 * עם הצעות המחיר כאן ולא מתנגש.
 *
 * מופרד לבקר משלו כי RolesGuard דורש JWT של משתמש, ול-reporttt אין כזה — הוא
 * מזדהה באותו טוקן ש-CRM_API_TOKEN כבר שולח לנתיבי /customers/:id/documents
 * (ר' crm-filing.ts שם). הבדיקה כאן timing-safe, כמו RadonInternalController.
 */
@Controller('reference-numbers/internal')
export class ReferenceNumbersInternalController {
  constructor(private readonly referenceNumbers: ReferenceNumbersService) {}

  private assertToken(authHeader?: string) {
    const expected = (process.env.CRM_API_TOKEN ?? '').trim();
    // סוד לא מוגדר = הנתיב סגור. לא פתוח.
    if (!expected) throw new UnauthorizedException('internal API not configured');
    const provided = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
    if (provided.length !== expected.length) throw new UnauthorizedException('unauthorized');
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) throw new UnauthorizedException('unauthorized');
  }

  @Post('next')
  async next(@Body() body: { email?: string }, @Headers('authorization') auth?: string) {
    this.assertToken(auth);
    const email = (body?.email ?? '').trim().toLowerCase();
    if (!email) throw new UnauthorizedException('missing email');
    const reference = await this.referenceNumbers.getNextForEmail(email);
    if (!reference) throw new UnauthorizedException('unknown user');
    return { reference };
  }
}
