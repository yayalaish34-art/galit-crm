import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isRadonKitSku, RADON_KIT_SKUS } from './radon-tracks';

/**
 * גשר ל-WhatsApp bot עבור כפתור "תזכור לקוח".
 *
 * ה-CRM לא שולח וואטסאפ בעצמו — הבוט הוא זה שמחזיק את החיבור ל-Green API, את
 * נרמול מספרי הטלפון, את רשימת ההסרה ואת התזמון. לכן הכפתור פונה לכאן, וכאן
 * אנחנו קוראים לבוט server-to-server עם סוד משותף — בדיוק כמו הגשר הקיים של
 * העוזרת הקולית (`voice-assistant.service.ts`).
 *
 * הגדרות (Railway env):
 *   VOICE_BOT_BASE_URL         כתובת הבוט (משותפת עם העוזרת הקולית)
 *   CUSTOMER_REMINDER_SECRET   זהה ל-CUSTOMER_REMINDER_SECRET בבוט
 *                              (אם לא הוגדר — INTERNAL_API_SECRET, כמו בבוט)
 *
 * הערה על גבולות: התזכורת נשלחת רק לשירותי ערכה (61 / 10000). הבדיקה נעשית גם
 * כאן וגם בבוט. הסתרת הכפתור בממשק היא נוחות, לא הגנה.
 */
@Injectable()
export class CustomerReminderService {
  private readonly logger = new Logger(CustomerReminderService.name);
  private readonly TIMEOUT_MS = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  private botBase(): string | null {
    const raw = (process.env.VOICE_BOT_BASE_URL ?? '').trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  private secret(): string | null {
    const raw =
      (process.env.CUSTOMER_REMINDER_SECRET ?? '').trim() ||
      (process.env.INTERNAL_API_SECRET ?? '').trim();
    return raw || null;
  }

  /** האם הגשר מוגדר — הממשק מציג את הכפתור רק כשכן. */
  isConfigured(): boolean {
    return this.botBase() !== null && this.secret() !== null;
  }

  /** קריאה גנרית לבוט, עם timeout והודעת שגיאה קריאה בעברית. */
  private async call(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<any> {
    const base = this.botBase();
    const secret = this.secret();
    if (!base || !secret) {
      throw new ServiceUnavailableException('שירות התזכורות אינו מוגדר בשרת');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        method: init.method,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });

      const text = await res.text();
      const data = text ? safeJson(text) : null;

      if (!res.ok) {
        const message = data?.error ?? `שגיאה מהבוט (HTTP ${res.status})`;
        this.logger.warn(`${init.method} ${path} failed: ${res.status} ${message}`);
        // 4xx = בעיה בבקשה עצמה (למשל SKU לא מתאים) — נחזיר אותה למשתמש כפי שהיא.
        if (res.status >= 400 && res.status < 500) throw new BadRequestException(message);
        throw new ServiceUnavailableException(message);
      }
      return data;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) throw err;
      if (err?.name === 'AbortError') {
        throw new ServiceUnavailableException('הבוט לא הגיב בזמן — נסו שוב');
      }
      this.logger.error(`${init.method} ${path} error: ${err?.message}`);
      throw new ServiceUnavailableException('לא ניתן להתחבר לשירות התזכורות');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * שולף את פרטי הנמען מהמשימה: קודם איש הקשר של הבדיקה (TaskField), ואם אין —
   * פרטי הלקוח מכרטיס הלקוח. אותו סדר עדיפויות שהבוט משתמש בו כשהוא מודיע
   * ללקוח שהבודק בדרך, כדי שהלקוח יקבל את ההודעה לאותו מספר בשני המקרים.
   */
  private async resolveRecipient(taskId: string): Promise<{
    phone: string | null;
    name: string | null;
    customerId: string | null;
    siteAddress: string | null;
  }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        customerId: true,
        customer: { select: { name: true, phone: true, address: true, city: true } },
        taskField: {
          select: {
            fieldContactName: true,
            fieldContactPhone: true,
            siteAddress: true,
            siteCity: true,
          },
        },
      },
    });
    if (!task) throw new BadRequestException('המשימה לא נמצאה');

    const tf = task.taskField;
    const phone = pick(tf?.fieldContactPhone, task.customer?.phone);
    const name = pick(tf?.fieldContactName, task.customer?.name);
    const siteAddress =
      pick(joinAddress(tf?.siteAddress, tf?.siteCity), joinAddress(task.customer?.address, task.customer?.city));

    return { phone, name, customerId: task.customerId ?? null, siteAddress };
  }

  /** תצוגה מקדימה של נוסח ההודעה, לפני שהמשתמש מאשר. */
  async preview(taskId: string): Promise<{ messageText: string; defaultDelayDays: number; recipient: any }> {
    const recipient = await this.resolveRecipient(taskId);
    const data = await this.call('/internal/customer-reminders/preview', {
      method: 'POST',
      body: { customerName: recipient.name, siteAddress: recipient.siteAddress },
    });
    return { ...data, recipient };
  }

  /** מה מתוזמן כרגע למשימה (כולל היסטוריה) — הממשק מציג לפי זה. */
  async listForTask(taskId: string): Promise<any> {
    return this.call(`/internal/customer-reminders?taskId=${encodeURIComponent(taskId)}`, {
      method: 'GET',
    });
  }

  /**
   * מתזמן תזכורת ללקוח. `sku` נבדק כאן לפני היציאה לרשת, כדי שהמשתמש יקבל
   * הודעה ברורה במקום שגיאה כללית מהבוט.
   */
  async schedule(input: {
    taskId: string;
    sku: string;
    radonJobId?: string | null;
    delayDays?: number;
    /** מועד שליחה מדויק (ISO) — גובר על delayDays כשהמשתמש בחר תאריך ושעה. */
    dueAt?: string | null;
    messageText?: string | null;
    actorUserId?: string | null;
    /** דריסה ידנית של הנמען, כשהמשתמש מתקן את המספר בממשק. */
    phoneOverride?: string | null;
  }): Promise<any> {
    if (!isRadonKitSku(input.sku)) {
      throw new BadRequestException(
        `תזכורת החזרת ערכה זמינה רק לשירותי ערכת ראדון (${RADON_KIT_SKUS.join(', ')})`,
      );
    }

    const recipient = await this.resolveRecipient(input.taskId);
    const phone = (input.phoneOverride ?? '').trim() || recipient.phone;
    if (!phone) {
      throw new BadRequestException('אין ללקוח מספר טלפון במערכת — הוסיפו מספר או הזינו ידנית');
    }

    const data = await this.call('/internal/customer-reminders', {
      method: 'POST',
      body: {
        kind: 'RADON_KIT_RETURN',
        customerPhone: phone,
        customerName: recipient.name,
        customerId: recipient.customerId,
        taskId: input.taskId,
        radonJobId: input.radonJobId ?? null,
        sku: input.sku,
        siteAddress: recipient.siteAddress,
        delayDays: input.delayDays,
        dueAt: input.dueAt ?? null,
        messageText: input.messageText ?? null,
        createdByUserId: input.actorUserId ?? null,
      },
    });

    this.logger.log(
      `Radon kit reminder armed for task ${input.taskId} (sku ${input.sku}) → ${phone}`,
    );
    return data;
  }

  /** מבטל תזכורת מתוזמנת. */
  async cancel(reminderId: string): Promise<any> {
    return this.call(`/internal/customer-reminders/${encodeURIComponent(reminderId)}`, {
      method: 'DELETE',
    });
  }
}

// ── עזרים ──

function pick(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return null;
}

function joinAddress(address?: string | null, city?: string | null): string | null {
  const parts = [address, city].map((p) => (p ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
