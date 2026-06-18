import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export interface DraftContext {
  customerName?: string;
  contactName?: string;
  serviceName?: string;
  quoteNumber?: string;
  /** הנחיית תיקון מהמשתמש ("מה הבעיה / מה לשנות") */
  instruction?: string;
  /** הנושא/תוכן שנוצרו בסבב קודם — לשיפור איטרטיבי */
  previousSubject?: string;
  previousBody?: string;
}

export interface DraftResult {
  subject: string;
  body: string;
}

@Injectable()
export class AiMailService {
  private readonly logger = new Logger(AiMailService.name);

  private readonly SYSTEM = `אתה עוזר לכתיבת מיילים בעברית עבור "גלית – החברה לאיכות הסביבה", חברה המספקת בדיקות ושירותים סביבתיים.
המשימה: לנסח מייל קצר, מקצועי ואדיב המלווה הצעת מחיר ללקוח.
כללים:
- כתוב בעברית תקנית, בטון מכובד וחם אך עסקי.
- פנה ללקוח/איש הקשר בשמו אם ידוע.
- ציין שמצורפת הצעת מחיר, והתאם את הניסוח לשירות הספציפי אם ידוע.
- אל תמציא מחירים, תאריכים או פרטים שלא נמסרו לך.
- שמור על אורך סביר: 3-5 משפטים בגוף ההודעה.
- סיים ב"נשמח לעמוד לרשותך לכל שאלה." (אל תוסיף חתימה — היא מתווספת בנפרד).
- החזר תשובה כ-JSON תקין בלבד עם שני שדות: "subject" (נושא) ו-"body" (גוף ההודעה, טקסט רגיל עם שורות חדשות).`;

  async generateDraft(ctx: DraftContext): Promise<DraftResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('ניסוח AI אינו מוגדר בשרת — חסר OPENAI_API_KEY');
    }

    const contextLines = [
      ctx.customerName ? `לקוח: ${ctx.customerName}` : '',
      ctx.contactName ? `איש קשר: ${ctx.contactName}` : '',
      ctx.serviceName ? `שירות / סוג הצעה: ${ctx.serviceName}` : '',
      ctx.quoteNumber ? `מספר הצעה: ${ctx.quoteNumber}` : '',
    ].filter(Boolean).join('\n');

    // Build the conversation. Include the previous draft + the user's fix instruction
    // so the model improves iteratively rather than starting from scratch.
    const messages: any[] = [{ role: 'system', content: this.SYSTEM }];

    let userPrompt = `פרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nנסח נושא וגוף מייל מתאימים.`;
    if (ctx.previousSubject || ctx.previousBody) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ subject: ctx.previousSubject || '', body: ctx.previousBody || '' }),
      });
      userPrompt = `זהו הניסוח הקודם. ${ctx.instruction ? 'בקשת השינוי: ' + ctx.instruction : 'שפר אותו.'}\n\nפרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nהחזר גרסה מעודכנת.`;
    } else if (ctx.instruction) {
      userPrompt += `\n\nהנחיה נוספת: ${ctx.instruction}`;
    }
    messages.push({ role: 'user', content: userPrompt });

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          temperature: 0.7,
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

    try {
      const parsed = JSON.parse(content);
      return {
        subject: String(parsed.subject || '').trim(),
        body: String(parsed.body || '').trim(),
      };
    } catch {
      // Model didn't return clean JSON — fall back to using the raw text as the body.
      return { subject: ctx.previousSubject || '', body: String(content).trim() };
    }
  }
}
