import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** מפתח ההגדרות של SMS ב-SystemSetting. */
export const SMS_CONFIG_KEY = 'sms.config';

export interface SmsConfig {
  /** האם שליחת SMS מופעלת. */
  enabled: boolean;
  /** ספק ה-SMS (יוגדר בהמשך — למשל 019 / InforU / Twilio). ריק = לא חובר עדיין. */
  provider: string;
  /** מספר/שם השולח של החברה (sender id) שיופיע אצל הלקוח. */
  senderId: string;
  /** מספר הטלפון של החברה (לתצוגה / אימות). */
  companyPhone: string;
  /** מפתח ה-API של הספק (נשמר בשרת בלבד). */
  apiKey: string;
  /** סוד/טוקן נוסף אם הספק דורש. */
  apiSecret: string;
}

const EMPTY_CONFIG: SmsConfig = {
  enabled: false,
  provider: '',
  senderId: '',
  companyPhone: '',
  apiKey: '',
  apiSecret: '',
};

/**
 * שירות שליחת SMS — שכבת תשתית בלבד.
 *
 * נכון לעכשיו אין ספק SMS מחובר: ההגדרות נשמרות ב-SystemSetting והממשק מוכן,
 * אך השליחה בפועל מחזירה "לא מוגדר". כשיתקבל ספק קונקרטי (019 / InforU / Twilio וכו'),
 * יש להשלים את הקריאה ל-API בתוך `dispatch()` בלבד — שאר המערכת כבר קוראת ל-`sendSms()`.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** קריאת ההגדרות (כולל ברירות מחדל). הסודות מוסתרים רק בשכבת ה-API/קונטרולר. */
  async getConfig(): Promise<SmsConfig> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SMS_CONFIG_KEY } })
      .catch(() => null);
    const v = (row?.value as Partial<SmsConfig> | undefined) || {};
    return { ...EMPTY_CONFIG, ...v };
  }

  async saveConfig(patch: Partial<SmsConfig>): Promise<SmsConfig> {
    const current = await this.getConfig();
    const next: SmsConfig = { ...current, ...patch };
    await this.prisma.systemSetting.upsert({
      where: { key: SMS_CONFIG_KEY },
      create: { key: SMS_CONFIG_KEY, value: next as any },
      update: { value: next as any },
    });
    return next;
  }

  /** האם המערכת מסוגלת לשלוח SMS בפועל. */
  async isReady(): Promise<boolean> {
    const c = await this.getConfig();
    return !!(c.enabled && c.provider && c.apiKey);
  }

  /**
   * שליחת SMS ללקוח. מחזיר תוצאה אחידה.
   * אם הספק לא מוגדר — לא נשלח דבר ומוחזר ok:false עם סיבה (לא נזרקת שגיאה כדי לא להפיל אוטומציות).
   */
  async sendSms(to: string, text: string): Promise<{ ok: boolean; reason?: string }> {
    const phone = (to || '').replace(/[^\d+]/g, '');
    if (!phone) return { ok: false, reason: 'missing-phone' };
    const config = await this.getConfig();
    if (!config.enabled || !config.provider || !config.apiKey) {
      this.logger.warn(`SMS not configured — skipped sending to ${phone}`);
      return { ok: false, reason: 'not-configured' };
    }
    try {
      await this.dispatch(config, phone, text);
      return { ok: true };
    } catch (e: any) {
      this.logger.error(`SMS send failed to ${phone}: ${e?.message}`);
      return { ok: false, reason: 'send-failed' };
    }
  }

  /** כמו sendSms אבל זורק שגיאה — לשימוש בשליחה ידנית מהממשק (כדי להציג הודעה). */
  async sendSmsOrThrow(to: string, text: string): Promise<void> {
    const res = await this.sendSms(to, text);
    if (!res.ok) {
      if (res.reason === 'not-configured') {
        throw new BadRequestException('שליחת SMS אינה מוגדרת — חבר ספק SMS בהגדרות');
      }
      if (res.reason === 'missing-phone') {
        throw new BadRequestException('אין מספר טלפון תקין ללקוח');
      }
      throw new BadRequestException('שליחת ה-SMS נכשלה');
    }
  }

  /**
   * נקודת האינטגרציה היחידה שצריך להשלים מול ספק אמיתי.
   * דוגמה (Twilio):
   *   await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {...})
   * דוגמה (ספק ישראלי): קריאת REST/SOAP לפי התיעוד של הספק עם config.apiKey / config.senderId.
   */
  private async dispatch(config: SmsConfig, phone: string, text: string): Promise<void> {
    // TODO(sms-provider): להשלים קריאה אמיתית ל-API של הספק שייבחר.
    void config;
    void phone;
    void text;
    throw new Error('SMS provider integration not implemented');
  }
}
