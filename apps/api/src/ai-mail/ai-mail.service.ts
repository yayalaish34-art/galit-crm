import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DraftContext {
  /** ההצעה שעבורה מנסחים — לשליפת סכום/תנאי תשלום/מספר אוטומטית */
  quoteId?: string;
  customerName?: string;
  contactName?: string;
  serviceName?: string;
  quoteNumber?: string;

  // ── פרטי המקרה שהמשתמש ממלא (שאלון) ──
  location?: string;        // מיקום מדויק
  inspectionType?: string;  // אופן/סוג הבדיקה או העבודה
  duration?: string;        // משך ביצוע משוער
  extraDetails?: string;    // הערות חופשיות

  /** הנחיית תיקון נוספת ("מה לשנות") */
  instruction?: string;
  previousSubject?: string;
  previousBody?: string;
}

export interface DraftResult {
  subject: string;
  body: string;
  /** הנתונים שהשרת חישב/שלף — מוצגים למשתמש כך שיֵדע מה ישובץ */
  facts?: {
    quoteNumber?: string;
    total?: string;
    paymentTerms?: string;
    validTo?: string;
  };
}

@Injectable()
export class AiMailService {
  private readonly logger = new Logger(AiMailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly SYSTEM = `אתה מנסח מיילים בעברית עבור "גלית – החברה לאיכות הסביבה", המספקת בדיקות ושירותים סביבתיים (קרינה, רעש, אוויר, אסבסט, ראדון ועוד).
המשימה: לנסח מייל מקצועי המלווה הצעת מחיר, בדיוק במבנה ובסגנון של הדוגמאות שתקבל.

מבנה הגוף (לפי הסדר):
1. פנייה: "שלום [שם איש הקשר]," (אם אין שם — "שלום רב,").
2. משפט פתיחה: "מצורפת הצעת מחיר מס' [מספר] עבור [תיאור קצר של העבודה במיקום]."
3. 1-2 משפטים המתארים מה כוללת העבודה (לפי הפרטים שנמסרו — מיקום, סוג הבדיקה/העבודה, תוצרים כמו דוח יישום/הגשה לרשויות).
4. שורות הנתונים (יוזרקו על ידי המערכת — אל תכתוב אותן בעצמך! המערכת מוסיפה: סה"כ לתשלום, תנאי תשלום, תוקף ההצעה). אתה יכול לכתוב את "משך ביצוע משוער" אם נמסר לך.
5. משפט סיום: "לאישור ההצעה, נא להעביר אלינו את ההצעה חתומה ומאושרת." ואז "נשמח לעמוד לרשותך לכל שאלה."

כללים מחייבים:
- אל תכתוב סכומים, תנאי תשלום, או תוקף — המערכת מוסיפה אותם. אתה כותב רק נוסח מילולי.
- אל תמציא פרטים שלא נמסרו (מיקום, סוג בדיקה, תאריכים, מספרי מפרט).
- אל תוסיף חתימה ("בברכה" / שם) — היא מתווספת בנפרד.
- השתמש בדיוק בשם הלקוח, איש הקשר והמספר שנמסרו.
- נושא בפורמט: "הצעת מחיר [תיאור קצר] – [מיקום/לקוח] – מס' [מספר]".
- החזר JSON תקין בלבד עם "subject" ו-"body" (טקסט רגיל עם שורות חדשות). אל תכלול בגוף את שורות הסכום/תנאי תשלום/תוקף.`;

  private readonly EXAMPLE_USER = `פרטי ההצעה:
לקוח: אקספו תל אביב
איש קשר: דיאנה
שירות: מיגון קרינה אלקטרומגנטית
מספר הצעה: 13762
מיקום: מתחם הכניסה, אקספו תל אביב
סוג העבודה: מיגון קרינה משדות מגנטיים — אספקה והתקנת מיגון לקירות כולל חפיפות ופחת, והנפקת דוח יישום מיגון להגשה לרשויות ולבנייה ירוקה
משך ביצוע: עד 7 ימי עסקים`;

  private readonly EXAMPLE_ASSISTANT = JSON.stringify({
    subject: 'הצעת מחיר למיגון קרינה אלקטרומגנטית – מתחם הכניסה אקספו תל אביב – מס\' 13762',
    body: `שלום דיאנה,

מצורפת הצעת מחיר מס' 13762 עבור ביצוע מיגון קרינה משדות מגנטיים במתחם הכניסה אקספו תל אביב.
העבודה כוללת אספקה והתקנת מיגון לקירות, כולל חפיפות ופחת, וכן הנפקת דוח יישום מיגון להגשה לרשויות ולבנייה ירוקה.
משך ביצוע משוער: עד 7 ימי עסקים, בתיאום עם המזמין.

לאישור ההצעה, נא להעביר אלינו את ההצעה חתומה ומאושרת.
נשמח לעמוד לרשותך לכל שאלה.`,
  });

  async generateDraft(ctx: DraftContext): Promise<DraftResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('ניסוח AI אינו מוגדר בשרת — חסר OPENAI_API_KEY');
    }

    // ── שליפת נתונים אמיתיים מההצעה (סכום / תנאי תשלום / מספר) ──
    const facts = await this.resolveFacts(ctx);

    const contextLines = [
      ctx.customerName ? `לקוח: ${ctx.customerName}` : '',
      ctx.contactName ? `איש קשר: ${ctx.contactName}` : '',
      ctx.serviceName ? `שירות: ${ctx.serviceName}` : '',
      facts.quoteNumber ? `מספר הצעה: ${facts.quoteNumber}` : '',
      ctx.location ? `מיקום: ${ctx.location}` : '',
      ctx.inspectionType ? `סוג העבודה / הבדיקה: ${ctx.inspectionType}` : '',
      ctx.duration ? `משך ביצוע: ${ctx.duration}` : '',
      ctx.extraDetails ? `פרטים נוספים: ${ctx.extraDetails}` : '',
    ].filter(Boolean).join('\n');

    const messages: any[] = [
      { role: 'system', content: this.SYSTEM },
      { role: 'user', content: this.EXAMPLE_USER },
      { role: 'assistant', content: this.EXAMPLE_ASSISTANT },
    ];

    let userPrompt = `פרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nנסח נושא וגוף מייל בדיוק כמו בדוגמה.`;
    if (ctx.previousSubject || ctx.previousBody) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ subject: ctx.previousSubject || '', body: ctx.previousBody || '' }),
      });
      userPrompt = `זהו הניסוח הקודם. ${ctx.instruction ? 'בקשת השינוי: ' + ctx.instruction : 'שפר אותו.'}\n\nפרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nהחזר גרסה מעודכנת באותו פורמט.`;
    } else if (ctx.instruction) {
      userPrompt += `\n\nהנחיה נוספת: ${ctx.instruction}`;
    }
    messages.push({ role: 'user', content: userPrompt });

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e: any) {
      this.logger.error(`OpenAI request failed: ${e?.message}`);
      throw new BadRequestException('פנייה ל-AI נכשלה — נסה שוב');
    }

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`OpenAI ${res.status}: ${detail}`);
      throw new BadRequestException('יצירת הניסוח נכשלה');
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new BadRequestException('לא התקבל ניסוח מה-AI');

    let aiSubject = ctx.previousSubject || '';
    let aiBody = '';
    try {
      const parsed = JSON.parse(content);
      aiSubject = String(parsed.subject || '').trim();
      aiBody = String(parsed.body || '').trim();
    } catch {
      aiBody = String(content).trim();
    }

    // ── הזרקת שורות הנתונים מהקוד אל גוף המייל (לפני משפט הסיום) ──
    const body = this.injectFacts(aiBody, facts);

    return { subject: aiSubject, body, facts };
  }

  /** שליפת מספר/סכום/תנאי תשלום מההצעה + חישוב תוקף = חודש מהיום. */
  private async resolveFacts(ctx: DraftContext): Promise<DraftResult['facts']> {
    const facts: DraftResult['facts'] = { quoteNumber: ctx.quoteNumber };
    if (ctx.quoteId) {
      const q: any = await this.prisma.quote.findUnique({ where: { id: ctx.quoteId } }).catch(() => null);
      if (q) {
        facts.quoteNumber = q.quoteNumber || q.importLegacyId || ctx.quoteNumber;
        const total = q.totalAmount ?? q.amount;
        if (total != null) {
          facts.total = `${Number(total).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪ כולל מע"מ`;
        }
        if (q.paymentTerms) facts.paymentTerms = String(q.paymentTerms);
      }
    }
    // תוקף = חודש מהיום (מחושב בשרת — לא תלוי בדפדפן)
    facts.validTo = this.oneMonthFromNow();
    return facts;
  }

  /** מחזיר תאריך של חודש מהיום בפורמט DD/MM/YYYY. */
  private oneMonthFromNow(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  /** מזריק את שורות הנתונים לגוף המייל, ממש לפני "לאישור ההצעה". */
  private injectFacts(body: string, facts: DraftResult['facts']): string {
    const lines: string[] = [];
    if (facts?.total) lines.push(`סה"כ לתשלום: ${facts.total}.`);
    if (facts?.paymentTerms) lines.push(`תנאי תשלום: ${facts.paymentTerms}.`);
    if (facts?.validTo) lines.push(`תוקף ההצעה: עד ${facts.validTo}.`);
    if (!lines.length) return body;
    const block = lines.join('\n');

    // נסה לשבץ לפני משפט האישור; אחרת לפני משפט "נשמח"; אחרת בסוף.
    const anchorApprove = body.indexOf('לאישור ההצעה');
    if (anchorApprove !== -1) {
      return body.slice(0, anchorApprove).trimEnd() + '\n\n' + block + '\n\n' + body.slice(anchorApprove);
    }
    const anchorGlad = body.indexOf('נשמח לעמוד');
    if (anchorGlad !== -1) {
      return body.slice(0, anchorGlad).trimEnd() + '\n\n' + block + '\n\n' + body.slice(anchorGlad);
    }
    return body.trimEnd() + '\n\n' + block;
  }
}
