import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import { PrismaService } from '../prisma/prisma.service';
import { formatIsraeliPhone } from '../common/phone.util';

export interface DraftContext {
  /** ההצעה שעבורה מנסחים — לשליפת סכום/תנאי תשלום/מספר אוטומטית */
  quoteId?: string;
  /** הלקוח (לניסוח מייל דוח — לשליפת מייל הצעת המחיר האחרון שנשלח כהקשר) */
  customerId?: string;
  customerName?: string;
  contactName?: string;
  serviceName?: string;
  quoteNumber?: string;
  /** שם הפרויקט (לניסוח מייל דוח) */
  projectName?: string;
  /** שם הדוח המצורף (לניסוח מייל דוח) */
  reportName?: string;
  /** תוכן הדוח המצורף (base64) — השרת מחלץ ממנו טקסט ומשתמש בו כרפרנס לניסוח. PDF או DOCX. */
  reportBase64?: string;
  /** סוג ה-MIME של הדוח המצורף — קובע האם לחלץ כ-PDF או DOCX. */
  reportMimeType?: string;
  /** מזהה מסמך הדוח (Document) — כשהדוח כבר שמור בכרטיס הלקוח. השרת שולף ממנו את
   *  ה-base64+mimeType לחילוץ הטקסט, במקום שהפרונט ישלח את כל הקובץ. גובר אם אין reportBase64. */
  reportDocumentId?: string;

  // ── פרטי המקרה שהמשתמש ממלא (שאלון) ──
  location?: string;        // מיקום מדויק
  inspectionType?: string;  // אופן/סוג הבדיקה או העבודה
  duration?: string;        // משך ביצוע משוער
  extraDetails?: string;    // הערות חופשיות

  /** הנחיית תיקון נוספת ("מה לשנות") */
  instruction?: string;
  previousSubject?: string;
  previousBody?: string;

  /** ערוץ הניסוח: מייל (ברירת מחדל) או וואטסאפ (הודעה קצרה, בלי נושא) */
  channel?: 'email' | 'whatsapp';
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
1. פנייה: "שלום [שם פרטי]," — השתמש בשם הפרטי בלבד שנמסר לך (לא שם משפחה!). אם אין שם — "שלום רב,".
2. משפט פתיחה: "מצורפת הצעת מחיר מס' [מספר] עבור [תיאור קצר של העבודה במיקום]."
3. משפט קבוע כפסקה נפרדת מיד אחרי משפט הפתיחה (סעיף 2): "מצורפים גם תעודות ההסמכה ופרופיל החברה שלנו לעיונכם." — כתוב אותו בדיוק כך, תמיד, אחרי "מצורפת הצעת מחיר..." ולפני תיאור העבודה.
4. 1-2 משפטים המתארים מה כוללת העבודה (לפי הפרטים שנמסרו — מיקום, סוג הבדיקה/העבודה, תוצרים כמו דוח יישום/הגשה לרשויות).
5. פסקה קצרה (משפט עד שניים) המדגישה את המקצועיות והליווי: שצוות החברה עומד לרשות הלקוח לאורך כל התהליך ומקפיד על שירות מקצועי, אמין ויסודי. נסח בצורה כללית בלבד — בלי להמציא פרטים, נתונים או הבטחות ספציפיות.
6. שורות הנתונים (יוזרקו על ידי המערכת — אל תכתוב אותן בעצמך! המערכת מוסיפה: סה"כ לתשלום, תנאי תשלום, תוקף ההצעה). אתה יכול לכתוב את "משך ביצוע משוער" אם נמסר לך.
7. משפט סיום: "לאישור ההצעה, נא להעביר אלינו את ההצעה חתומה ומאושרת." ואז "נשמח לעמוד לרשותך לכל שאלה."

כללים מחייבים:
- משפט תעודות ההסמכה ופרופיל החברה (סעיף 3) חייב להופיע תמיד כפסקה נפרדת מיד אחרי משפט "מצורפת הצעת מחיר..." (ולא לפניו), בנוסח המדויק שנמסר.
- אל תכתוב סכומים, תנאי תשלום, או תוקף — המערכת מוסיפה אותם. אתה כותב רק נוסח מילולי.
- אם סופקו "פריטי ההצעה" או "תוכן מסמך ההצעה" — בסס עליהם את תיאור העבודה והשירות (סעיפים 2-3), והשתמש רק במידע שמופיע בהם.
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

  // ── ניסוח וואטסאפ: הודעה מנוסחת, מקצועית ובוגרת, בלי נושא ובלי שורות נתונים ──
  private readonly WHATSAPP_SYSTEM = `אתה מנסח הודעות וואטסאפ בעברית עבור "גלית – החברה לאיכות הסביבה", המספקת בדיקות ושירותים סביבתיים.
המשימה: לנסח הודעת וואטסאפ מלווה לשליחת הצעת מחיר ללקוח — הודעה מנוסחת היטב, מקצועית ובוגרת.
כללים מחייבים:
- אורך: 4 עד 6 שורות. סגנון אישי-מקצועי ומכובד, בגובה העיניים — לא מייל רשמי ולא הודעה קצרה ויבשה.
- בלי אימוג'ים כלל, ובלי סלנג.
- פתיחה: "שלום [שם]," בשם הפרטי בלבד (אם אין שם — "שלום רב,").
- משפט פתיחה שמודיע שמצורפת/נשלחה הצעת מחיר עבור [השירות/העבודה], כולל מספר ההצעה אם נמסר.
- משפט נוסף שמתאר בקצרה ובמילים בוגרות את מהות העבודה/השירות לפי הפרטים שנמסרו (בלי להמציא פרטים שלא נמסרו).
- משפט שמזמין את הלקוח לעיין בהצעה ולחזור בכל שאלה או הבהרה, ומדגיש שנשמח ללוות אותו בתהליך.
- סיום מכובד: "אשמח לעמוד לרשותך לכל שאלה." או נוסח דומה.
- בלי נושא, בלי חתימה/שם, ובלי סכומים/תנאי תשלום/תוקף.
- החזר JSON תקין בלבד עם המפתח "body" בלבד (טקסט עם שורות חדשות).`;

  private readonly WHATSAPP_EXAMPLE_USER = `פרטי ההצעה:
לקוח: אקספו תל אביב
שם פרטי לפנייה: דיאנה
שירות: מיגון קרינה אלקטרומגנטית
מספר הצעה: 13762`;

  private readonly WHATSAPP_EXAMPLE_ASSISTANT = JSON.stringify({
    body: `שלום דיאנה,
מצורפת הצעת מחיר (מס' 13762) עבור מיגון קרינה אלקטרומגנטית, שהכנו עבורכם בהתאם לפרטים שסיכמנו.
ההצעה כוללת את כל מרכיבי העבודה הנדרשים לביצוע מקצועי ומלא, וריכזנו בה את כל הפרטים בצורה ברורה ושקופה.
אשמח שתעיינו בהצעה בנוחות, ואם יעלו שאלות או נקודות שתרצו להבהיר — אני זמינה עבורכם.
נשמח ללוות אתכם לאורך כל התהליך ולעמוד לרשותכם בכל עת.`,
  });

  private readonly EXAMPLE_ASSISTANT = JSON.stringify({
    subject: 'הצעת מחיר למיגון קרינה אלקטרומגנטית – מתחם הכניסה אקספו תל אביב – מס\' 13762',
    body: `שלום דיאנה,

מצורפת הצעת מחיר מס' 13762 עבור ביצוע מיגון קרינה משדות מגנטיים במתחם הכניסה אקספו תל אביב.

מצורפים גם תעודות ההסמכה ופרופיל החברה שלנו לעיונכם.
העבודה כוללת אספקה והתקנת מיגון לקירות, כולל חפיפות ופחת, וכן הנפקת דוח יישום מיגון להגשה לרשויות ולבנייה ירוקה.
משך ביצוע משוער: עד 7 ימי עסקים, בתיאום עם המזמין.

צוות החברה עומד לרשותכם לאורך כל התהליך, ואנו מקפידים על שירות מקצועי, אמין ויסודי בכל שלב.

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

    // ── תוכן ההצעה (פריטי שורה + טקסט המסמך הערוך) — המקור שממנו ה-AI גוזר את תיאור העבודה,
    //    במקום שאלון שהמשתמש ממלא ידנית. נשלח כטקסט בלבד (לא הקובץ עצמו). ──
    const quoteContent = await this.gatherQuoteContent(ctx.quoteId);

    // ── חסימה מוחלטת: לא מנסחים על התבנית הגולמית ──
    // ניסוח מייל הצעת מחיר מותר רק אחרי שהעובד ערך את המסמך ב-Word ושמר (סונכרן מ-OneDrive).
    // אם לא קיימת גרסה ערוכה כזו — חוסמים, כדי שה-AI לעולם לא ינסח על המיזוג הראשוני/הגולמי.
    // חל רק על ניסוח מייל *ראשוני*; בקשת תיקון מפורשת של המשתמש (instruction/previousBody) עוברת.
    const isEmailQuoteDraft = ctx.channel !== 'whatsapp' && !!ctx.quoteId;
    const isRefinement = !!(ctx.instruction || ctx.previousBody || ctx.previousSubject);
    if (isEmailQuoteDraft && !isRefinement && !quoteContent.hasEditedDoc) {
      throw new BadRequestException(
        'הניסוח מתבצע רק אחרי עריכת ההצעה ב-Word ושמירתה. ערכו את המסמך, שמרו, וחזרו ל-CRM — הניסוח יופק אוטומטית על בסיס הגרסה הערוכה.',
      );
    }

    // הפנייה במייל היא בשם הפרטי בלבד — לוקחים את המילה הראשונה מהשם המלא.
    const firstName = this.firstNameOf(ctx.contactName);

    const contextLines = [
      ctx.customerName ? `לקוח: ${ctx.customerName}` : '',
      firstName ? `שם פרטי לפנייה (השתמש בזה בלבד בפנייה "שלום [שם]"): ${firstName}` : '',
      ctx.serviceName ? `שירות: ${ctx.serviceName}` : '',
      facts.quoteNumber ? `מספר הצעה: ${facts.quoteNumber}` : '',
      ctx.location ? `מיקום: ${ctx.location}` : '',
      ctx.inspectionType ? `סוג העבודה / הבדיקה: ${ctx.inspectionType}` : '',
      ctx.duration ? `משך ביצוע: ${ctx.duration}` : '',
      ctx.extraDetails ? `פרטים נוספים: ${ctx.extraDetails}` : '',
      quoteContent.itemsText ? `פריטי ההצעה (בסס עליהם את תיאור העבודה):\n${quoteContent.itemsText}` : '',
      quoteContent.docText ? `תוכן מסמך ההצעה:\n${quoteContent.docText}` : '',
    ].filter(Boolean).join('\n');

    const isWa = ctx.channel === 'whatsapp';
    const messages: any[] = isWa
      ? [
          { role: 'system', content: this.WHATSAPP_SYSTEM },
          { role: 'user', content: this.WHATSAPP_EXAMPLE_USER },
          { role: 'assistant', content: this.WHATSAPP_EXAMPLE_ASSISTANT },
        ]
      : [
          { role: 'system', content: this.SYSTEM },
          { role: 'user', content: this.EXAMPLE_USER },
          { role: 'assistant', content: this.EXAMPLE_ASSISTANT },
        ];

    let userPrompt = isWa
      ? `פרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nנסח הודעת וואטסאפ מקצועית ובוגרת בדיוק בסגנון הדוגמה — 4 עד 6 שורות, בלי אימוג'ים.`
      : `פרטי ההצעה:\n${contextLines || '(אין פרטים נוספים)'}\n\nנסח נושא וגוף מייל בדיוק כמו בדוגמה.`;
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

    // ── הזרקת שורות הנתונים מהקוד אל גוף המייל (לפני משפט הסיום) — לא בוואטסאפ ──
    const body = isWa ? aiBody : this.injectFacts(aiBody, facts);

    return { subject: isWa ? '' : aiSubject, body, facts };
  }

  // ── ניסוח מייל ללוויית "דוח" שהופק (לא הצעת מחיר) ──
  private readonly REPORT_SYSTEM = `אתה מנסח מיילים בעברית עבור "גלית – החברה לאיכות הסביבה", המספקת בדיקות ושירותים סביבתיים (קרינה, רעש, אוויר, אסבסט, ראדון ועוד).
המשימה: לנסח מייל רשמי, מקצועי ומכובד, המלווה את הדוח המפורט שהופק עבור הלקוח לאחר שהעבודה הסתיימה, ומצורף למייל.

חשוב מכל: הרפרנס העיקרי לניסוח הוא **תוכן הדוח המצורף עצמו** (הטקסט שחולץ מהדוח ונמסר לך). עליך לקרוא אותו ולנסח נושא וגוף ש**משקפים את מה שנבדק ואת עיקרי הממצאים בפועל** — לא מייל תבניתי כללי. כל דוח שונה, ולכן כל מייל צריך להיות שונה ולשקף את הדוח הספציפי הזה.

מבנה הגוף (לפי הסדר):
1. פנייה: "שלום [שם פרטי]," בשם הפרטי בלבד (אם אין שם — "שלום רב,").
2. משפט פתיחה שמבהיר שהעבודה שהוזמנה **בוצעה והושלמה**, ושמצורף כעת הדוח המסכם — עם ציון סוג הבדיקה/העבודה הספציפי כפי שהוא עולה מהדוח (למשל "מדידת קרינה אלקטרומגנטית", "בדיקת ראדון", "דיגום אסבסט").
3. 2-3 משפטים המתארים בקצרה את **מה שנבדק ואת עיקרי מה שעולה מהדוח** — המיקומים/הנקודות שנבדקו, סוג המדידות, והמסקנה הכללית אם היא מופיעה במפורש בדוח (למשל "הערכים נמצאו בתחום התקן" / "נמצאה חריגה בנקודה X"). השתמש אך ורק במידע שמופיע בטקסט הדוח.
4. משפט שמדגיש שצוות החברה זמין לכל שאלה, הבהרה או הסבר לגבי הדוח וממצאיו.
5. משפט סיום מכובד: "נשמח לעמוד לרשותכם לכל שאלה." או נוסח דומה.

כללים מחייבים:
- **בסס את הנושא והגוף על תוכן הדוח שחולץ.** הנושא חייב לשקף את סוג הבדיקה האמיתי מהדוח. הגוף חייב להזכיר את מה שנבדק בפועל לפי הדוח.
- אם מסקנה/תוצאה כללית מופיעה **במפורש** בדוח (עמידה בתקן, חריגה, המלצה) — שקף אותה במשפט אחד. **אל תמציא** מספרים, ערכים או מסקנות שלא כתובים בדוח. אם הדוח לא כולל מסקנה חד-משמעית — הסתפק בתיאור מה נבדק, בלי להמציא תוצאה.
- הטון: "העבודה הושלמה, מצורף הדוח עם התוצאות" — לא "הנה הצעה" ולא "נשמח לבצע". אל תבקש אישור/חתימה.
- אם נמסר גם מייל הצעת המחיר המקורי — השתמש בו רק כהקשר משלים לשם השירות; בכל סתירה, **תוכן הדוח גובר**.
- אל תכלול סכומים, תנאי תשלום או תוקף — אלה שייכים להצעה, לא לדוח.
- אל תוסיף חתימה ("בברכה" / שם) — היא מתווספת בנפרד.
- נושא בפורמט: "דוח [סוג הבדיקה/השירות מהדוח] – [שם הלקוח]".
- החזר JSON תקין בלבד עם "subject" ו-"body" (טקסט רגיל עם שורות חדשות).`;

  private readonly REPORT_EXAMPLE_USER = `פרטי הדוח:
לקוח: אקספו תל אביב
שם פרטי לפנייה: דיאנה
שירות/פרויקט: מדידת קרינה אלקטרומגנטית במתחם הכניסה
שם הדוח: דוח מדידות קרינה.pdf
תוכן הדוח המצורף (זהו הרפרנס העיקרי — בסס את תיאור העבודה והתוצאות על הטקסט הזה בלבד, אל תמציא נתונים):
דוח מדידת קרינה אלקטרומגנטית בתדר נמוך (ELF). המדידות בוצעו ב-6 נקודות במתחם הכניסה של אקספו תל אביב: דלפק הקבלה, אזור השערים, חדר החשמל הראשי, מעברי הקהל, ומעלית המבקרים. נמדדה צפיפות שטף מגנטי בכל נקודה. הערכים שנמדדו נעו בין 0.2 ל-1.4 מיליגאוס. כלל הערכים נמצאו נמוכים בהרבה מסף החשיפה המומלץ (ברמת אוכלוסייה) ועומדים בדרישות התקן. לא נדרשת פעולה מתקנת.`;

  private readonly REPORT_EXAMPLE_ASSISTANT = JSON.stringify({
    subject: 'דוח מדידת קרינה אלקטרומגנטית (ELF) – אקספו תל אביב',
    body: `שלום דיאנה,

בהמשך לשירות שהוזמן, אנו שמחים לעדכן כי מדידת הקרינה האלקטרומגנטית בתדר נמוך (ELF) במתחם הכניסה בוצעה והושלמה, ומצורף כעת הדוח המסכם.
במסגרת הבדיקה נמדדה צפיפות השטף המגנטי ב-6 נקודות מרכזיות במתחם, בהן דלפק הקבלה, אזור השערים, חדר החשמל ומעברי הקהל.
על פי ממצאי הדוח, כלל הערכים שנמדדו נמצאו נמוכים מסף החשיפה המומלץ ועומדים בדרישות התקן, ולא נדרשת פעולה מתקנת.
צוות החברה זמין עבורכם לכל שאלה, הבהרה או הסבר לגבי הדוח וממצאיו.
נשמח לעמוד לרשותכם לכל שאלה.`,
  });

  // ── ניסוח כותרת פגישה לשלב התיאום (יומן Outlook) ──
  private readonly MEETING_TITLE_SYSTEM = `אתה מנסח כותרות קצרות וברורות לפגישות שדה ביומן, בעברית, עבור "גלית – החברה לאיכות הסביבה", המספקת בדיקות ושירותים סביבתיים (קרינה, רעש, אוויר, אסבסט, ראדון, ריח ועוד).
המשימה: לנסח כותרת אחת קצרה לפגישת התיאום/הביקור, בסגנון המדויק של הדוגמאות הבאות:
"בדיקת קרינה משולבת + התקנת 7 גלאי ראדון - חברת נטפים"
"בדיקת קרינה רכבת צפון"
"בדיקת צוות מריחים עבור חברת היאצ'י"
"צוות מריחים - בניין מגורים נתניה"

כללים מחייבים:
- החזר כותרת אחת בלבד — שורה אחת, בלי מרכאות, בלי נקודה בסוף, בלי הסברים.
- קצרה ועניינית (עד ~10-12 מילים — מעט יותר ארוכה מהדוגמאות, כמה מילים בסך הכל). מתארת את השירות/הבדיקה, את הלקוח, ותמיד גם את המיקום של הפגישה.
- **חובה לכלול את מיקום הפגישה** (המיקום/כתובת/עיר שנמסרו) כחלק מהכותרת — למשל "... - רחוב הרצל 5 חיפה" או "... בניין מגורים נתניה". אם נמסרה כתובת מדויקת, העדף אותה על פני העיר בלבד.
- שלב את שם הלקוח (בנוסח "חברת X" / "עבור חברת X" / "- שם הלקוח" לפי מה שטבעי), ואת המיקום.
- אם הלקוח פרטי (בלי שם חברה) — תאר לפי סוג המבנה והמיקום (למשל "בניין מגורים נתניה", "בית פרטי חיפה").
- בסס את הכותרת אך ורק על הפרטים שנמסרו לך. אל תמציא סוג בדיקה, כמויות, ערים, כתובות או פרטים שלא נמסרו.
- החזר טקסט רגיל בלבד (לא JSON) — רק את הכותרת.`;

  /**
   * מנסח כותרת פגישה לשלב התיאום דרך ה-GPT API, בסגנון הכותרות של גלית.
   * הפרטים האישיים (שם לקוח / שירות / עיר / כתובת) נמסרים ב-user message בלבד — לא ב-system.
   * best-effort: בכישלון (אין מפתח / שגיאת רשת) מחזיר כותרת null והצד הקורא נופל לכותרת הגנרית.
   */
  async generateMeetingTitle(ctx: {
    customerName?: string;
    serviceName?: string;
    city?: string;
    address?: string;
    /** מיקום הפגישה כפי שהוזן בטופס התיאום — חובה לשלב אותו בכותרת */
    location?: string;
  }): Promise<{ title: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('ניסוח AI אינו מוגדר בשרת — חסר OPENAI_API_KEY');
    }

    const detailLines = [
      ctx.customerName?.trim() ? `שם לקוח: ${ctx.customerName.trim()}` : '',
      // "שירות" מגיע מפריטי הצעת המחיר בפועל (כשקיימת) — בסס את הכותרת על הבדיקות/השירותים האלה.
      ctx.serviceName?.trim() ? `השירותים/הבדיקות שהוצעו בהצעת המחיר: ${ctx.serviceName.trim()}` : '',
      ctx.location?.trim() ? `מיקום הפגישה (חובה לכלול בכותרת): ${ctx.location.trim()}` : '',
      ctx.address?.trim() ? `כתובת: ${ctx.address.trim()}` : '',
      ctx.city?.trim() ? `עיר: ${ctx.city.trim()}` : '',
    ].filter(Boolean).join('\n');

    const messages: any[] = [
      { role: 'system', content: this.MEETING_TITLE_SYSTEM },
      {
        role: 'user',
        content: `נסח כותרת פגישה אחת בסגנון הדוגמאות, על סמך הפרטים הבאים בלבד. הקפד לכלול את מיקום הפגישה בכותרת:\n${detailLines || '(אין פרטים)'}\n\nהחזר רק את הכותרת.`,
      },
    ];

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages, temperature: 0.5 }),
      });
    } catch (e: any) {
      this.logger.error(`OpenAI request failed: ${e?.message}`);
      throw new BadRequestException('פנייה ל-AI נכשלה — נסה שוב');
    }
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`OpenAI ${res.status}: ${detail}`);
      throw new BadRequestException('יצירת הכותרת נכשלה');
    }
    const data = (await res.json()) as any;
    let title = String(data?.choices?.[0]?.message?.content || '').trim();
    // ניקוי: הסרת מרכאות עוטפות ונקודה/שורות מיותרות אם ה-AF הוסיף.
    title = title.split('\n')[0].trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\.\s*$/, '').trim();
    if (!title) throw new BadRequestException('לא התקבלה כותרת מה-AI');
    return { title };
  }

  // ── חילוץ פרטי ליד מתוך מייל טקסט-חופשי (למשל office@inspect-in.co.il) ──
  private readonly LEAD_EXTRACT_SYSTEM = `אתה מחלץ פרטי "ליד" (פנייה של לקוח פוטנציאלי) מתוך מייל בעברית שהתקבל אצל "גלית – החברה לאיכות הסביבה", המספקת בדיקות ושירותים סביבתיים (קרינה, רעש, אוויר, אסבסט, ראדון, ריח ועוד).
תקבל את נושא המייל ואת גוף המייל (טקסט חופשי, לרוב כולל את שם הפונה, טלפון, ולעיתים מייל, וכן את מהות הפנייה / השירות המבוקש). המשימה: לחלץ מהם את השדות המובנים.

החזר JSON תקין בלבד עם המפתחות הבאים (כל ערך מחרוזת; אם שדה לא קיים במייל — החזר מחרוזת ריקה ""):
- "fullName": שם מלא של הפונה (אדם ליצירת קשר). לא שם החברה השולחת ולא "גלית". אם יש רק שם חברה — השאר ריק.
- "phone": מספר טלפון ליצירת קשר, ספרות בלבד (אפשר עם + בהתחלה). בחר את הטלפון הנייד/הישיר של הפונה. בלי מקפים, רווחים או סוגריים.
- "email": כתובת אימייל של הפונה אם מופיעה בגוף (לא כתובת השולח האוטומטית).
- "serviceType": סוג השירות/הבדיקה המבוקש בקצרה (למשל "בדיקת קרינה", "בדיקת אסבסט", "מדידת רעש"). אם לא ברור — ריק.
- "essence": משפט אחד קצר וברור המסכם את מהות הפנייה / מה הלקוח צריך (עד ~20 מילים).

כללים:
- אל תמציא נתונים. אם פרט לא מופיע במפורש — החזר "" עבורו (חוץ מ-essence שתמיד ננסה לסכם ממה שיש).
- אל תכלול תוויות או טקסט נוסף — רק אובייקט ה-JSON.`;

  /**
   * מחלץ פרטי ליד (שם/טלפון/מייל/שירות/מהות) ממייל טקסט-חופשי דרך ה-GPT API.
   * משמש בקליטת לידים שאין להם פורמט תוויות (למשל office@inspect-in.co.il).
   * best-effort: אם אין OPENAI_API_KEY או שהקריאה נכשלה — מחזיר שדות ריקים ולא זורק,
   * כדי שקליטת הליד תימשך גם בלי החילוץ.
   */
  async extractLeadFields(
    subject: string,
    body: string,
  ): Promise<{ fullName: string; phone: string; email: string; serviceType: string; essence: string }> {
    const empty = { fullName: '', phone: '', email: '', serviceType: '', essence: '' };
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('extractLeadFields skipped — missing OPENAI_API_KEY');
      return empty;
    }
    const userPrompt = `נושא המייל:\n${subject || '(ללא נושא)'}\n\nגוף המייל:\n${body || '(ריק)'}\n\nחלץ את השדות והחזר JSON בלבד.`;

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: this.LEAD_EXTRACT_SYSTEM },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e: any) {
      this.logger.warn(`extractLeadFields request failed: ${e?.message || e}`);
      return empty;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`extractLeadFields OpenAI ${res.status}: ${detail.slice(0, 200)}`);
      return empty;
    }

    try {
      const data = (await res.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return empty;
      const parsed = JSON.parse(content);
      return {
        fullName: String(parsed.fullName || '').trim(),
        // המספר שחולץ נכתב לגוף הליד ומשם ממלא אוטומטית את שדה הטלפון — לכן עם מקף.
        phone: formatIsraeliPhone(String(parsed.phone || '').replace(/[^\d+]/g, '')),
        email: String(parsed.email || '').trim(),
        serviceType: String(parsed.serviceType || '').trim(),
        essence: String(parsed.essence || '').trim(),
      };
    } catch (e: any) {
      this.logger.warn(`extractLeadFields parse failed: ${e?.message || e}`);
      return empty;
    }
  }

  /** ניסוח (או שיפור) מייל ללוויית דוח שהופק — נושא + גוף. בלי שליפת/הזרקת נתוני הצעה. */
  async generateReportDraft(ctx: DraftContext): Promise<DraftResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('ניסוח AI אינו מוגדר בשרת — חסר OPENAI_API_KEY');
    }

    // ── פתרון איש הקשר ללקוח עסקי ──
    // כשהלקוח הוא חברה (type !== PRIVATE), הפנייה במייל חייבת להיות אל *איש הקשר* ולא אל שם
    // החברה. אם contactName שנשלח זהה לשם הלקוח/חברה (או ריק), שולפים את איש הקשר הראשי מה-DB.
    let contactNameResolved = (ctx.contactName || '').trim();
    let companyForPrompt = '';
    if (ctx.customerId) {
      try {
        const cust: any = await this.prisma.customer.findUnique({
          where: { id: ctx.customerId },
          select: {
            name: true, companyname: true, type: true, contactName: true,
            contacts: { where: { isPrimary: true }, select: { fullName: true }, take: 1 },
          },
        });
        if (cust) {
          const isCompany = String(cust.type || '').toUpperCase() !== 'PRIVATE';
          const companyName = (cust.companyname || cust.name || '').trim();
          if (isCompany) {
            companyForPrompt = companyName;
            const looksLikeCompany = !contactNameResolved || contactNameResolved === companyName || contactNameResolved === (cust.name || '').trim();
            if (looksLikeCompany) {
              const primary = cust.contacts?.[0]?.fullName?.trim();
              contactNameResolved = primary || (cust.contactName || '').trim() || '';
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`report-draft: contact resolution failed for ${ctx.customerId}: ${e?.message || e}`);
      }
    }
    const firstName = this.firstNameOf(contactNameResolved);

    // ── הקשר: מייל הצעת המחיר המקורי שנשלח ללקוח — ממנו גוזרים את תיאור השירות
    //    כדי לשמור עקביות בין ההצעה לדוח. best-effort: בכישלון מתעלמים. ──
    const quoteEmail = await this.resolveQuoteEmail(ctx);
    const serviceOrProject =
      ctx.projectName?.trim() || ctx.serviceName?.trim() || quoteEmail?.service?.trim() || '';

    // ── תוכן הדוח המצורף עצמו — הרפרנס העיקרי לניסוח. מחלצים טקסט מ-PDF/DOCX. ──
    // כשהדוח כבר שמור בכרטיס (reportDocumentId) ולא נשלח base64 — שולפים אותו מה-DB כאן,
    // כדי שגם ניסוח מכרטיס הלקוח יתבסס על תוכן הדוח (ולא יֵצא גנרי).
    let reportBase64 = ctx.reportBase64;
    let reportMimeType = ctx.reportMimeType;
    let reportName = ctx.reportName;
    if (!reportBase64 && ctx.reportDocumentId) {
      try {
        const doc: any = await this.prisma.document.findUnique({
          where: { id: ctx.reportDocumentId },
          select: { dataBase64: true, mimeType: true, name: true },
        });
        if (doc?.dataBase64) {
          reportBase64 = doc.dataBase64;
          reportMimeType = reportMimeType || doc.mimeType || undefined;
          reportName = reportName || doc.name || undefined;
        }
      } catch (e: any) {
        this.logger.warn(`report-draft: loading document ${ctx.reportDocumentId} failed: ${e?.message || e}`);
      }
    }
    const reportText = await this.extractReportText(reportBase64, reportMimeType, reportName);
    // דיאגנוסטיקה: אם צורף דוח אך לא חולץ ממנו טקסט — הניסוח ייצא גנרי. מתעדים כדי לזהות
    // דוחות שסרוקים כתמונה / פורמט שלא נתמך (במקום כשל שקט).
    if (reportBase64 && !reportText) {
      this.logger.warn(
        `report-draft: attached report yielded NO extractable text (name="${reportName || ''}", mime="${reportMimeType || ''}") — draft will be generic`,
      );
    } else if (reportText) {
      this.logger.log(`report-draft: extracted ${reportText.length} chars from report for AI drafting`);
    }

    const contextLines = [
      companyForPrompt ? `שם החברה (הלקוח הוא חברה — אל תפנה במייל אל שם החברה): ${companyForPrompt}` : (ctx.customerName ? `לקוח: ${ctx.customerName}` : ''),
      contactNameResolved ? `איש הקשר (הפנייה במייל היא אליו): ${contactNameResolved}` : '',
      firstName ? `שם פרטי לפנייה (השתמש בזה בלבד בפנייה "שלום [שם]"): ${firstName}` : '',
      serviceOrProject ? `שירות/פרויקט: ${serviceOrProject}` : '',
      reportName ? `שם הדוח: ${reportName}` : '',
      ctx.extraDetails ? `פרטים נוספים: ${ctx.extraDetails}` : '',
      reportText
        ? `תוכן הדוח המצורף (זהו הרפרנס העיקרי — בסס את תיאור העבודה והתוצאות על הטקסט הזה בלבד, אל תמציא נתונים):\n${reportText}`
        : '',
      quoteEmail?.subject || quoteEmail?.body
        ? `מייל הצעת המחיר המקורי שנשלח ללקוח (להקשר על השירות שהוזמן; אם יש סתירה — תוכן הדוח גובר):\nנושא: ${quoteEmail.subject || '(ללא)'}\nתוכן:\n${quoteEmail.body || '(ללא)'}`
        : '',
    ].filter(Boolean).join('\n');

    const messages: any[] = [
      { role: 'system', content: this.REPORT_SYSTEM },
      { role: 'user', content: this.REPORT_EXAMPLE_USER },
      { role: 'assistant', content: this.REPORT_EXAMPLE_ASSISTANT },
    ];
    let userPrompt = `פרטי הדוח:\n${contextLines || '(אין פרטים נוספים)'}\n\nנסח נושא וגוף מייל בדיוק כמו בדוגמה.`;
    if (ctx.previousSubject || ctx.previousBody) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify({ subject: ctx.previousSubject || '', body: ctx.previousBody || '' }),
      });
      userPrompt = `זהו הניסוח הקודם. ${ctx.instruction ? 'בקשת השינוי: ' + ctx.instruction : 'שפר אותו.'}\n\nפרטי הדוח:\n${contextLines || '(אין פרטים נוספים)'}\n\nהחזר גרסה מעודכנת באותו פורמט.`;
    } else if (ctx.instruction) {
      userPrompt += `\n\nהנחיה נוספת: ${ctx.instruction}`;
    }
    messages.push({ role: 'user', content: userPrompt });

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages, temperature: 0.4, response_format: { type: 'json_object' } }),
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
    return { subject: aiSubject, body: aiBody };
  }

  /**
   * שולף את מייל הצעת המחיר האחרון שנשלח — לפי quoteId אם נמסר, אחרת ההצעה האחרונה
   * של הלקוח שיש לה גוף-מייל שמור. משמש כהקשר לניסוח מייל הדוח. best-effort: בכישלון null.
   */
  private async resolveQuoteEmail(
    ctx: DraftContext,
  ): Promise<{ subject?: string; body?: string; service?: string } | null> {
    try {
      const select = { lastEmailSubject: true, lastEmailBody: true, service: true } as const;
      let q: any = null;
      if (ctx.quoteId) {
        q = await (this.prisma.quote.findUnique as any)({ where: { id: ctx.quoteId }, select }).catch(() => null);
      }
      if ((!q || (!q.lastEmailBody && !q.lastEmailSubject)) && ctx.customerId) {
        q = await (this.prisma.quote.findFirst as any)({
          where: { customerId: ctx.customerId, lastEmailBody: { not: null } },
          orderBy: { lastEmailedAt: 'desc' },
          select,
        }).catch(() => null);
      }
      if (!q) return null;
      return { subject: q.lastEmailSubject || '', body: q.lastEmailBody || '', service: q.service || '' };
    } catch (e: any) {
      this.logger.warn(`resolveQuoteEmail failed: ${e?.message || e}`);
      return null;
    }
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

  /**
   * מזהה גרסה של מסמך ההצעה שנערכה בפועל ע"י העובד. **הגרסה הערוכה היחידה הקבילה
   * לניסוח היא זו שסונכרנה מ-OneDrive** אחרי שהעובד ערך ושמר ב-Word — היא נשמרת ב-
   * syncFromOneDrive עם documentDescription המכיל "סונכרן אוטומטית".
   * המיזוג האוטומטי הראשוני (documentDescription="מסמך ממוזג") וכן צירוף ידני של קובץ
   * *אינם* נחשבים "ערוך" ואסור לנסח על בסיסם — כדי שה-AI לעולם לא ינסח על התבנית הגולמית.
   */
  private isEditedFromWord(doc: { documentDescription?: string | null } | null | undefined): boolean {
    return /סונכרן אוטומטית/.test(String(doc?.documentDescription || ''));
  }

  /**
   * אוסף את "תוכן ההצעה" כטקסט (לא הקובץ עצמו): תיאורי פריטי השורה מה-DB +
   * הטקסט של הגרסה **הערוכה** של המסמך (רק אם סונכרנה מ-OneDrive אחרי עריכת העובד).
   * מחזיר גם hasEditedDoc — האם קיימת גרסה ערוכה קבילה. אם אין, docText יישאר ריק
   * וה-caller (generateDraft) חוסם את הניסוח כדי לא לנסח על המסמך הגולמי/הראשוני.
   * הכל best-effort: בכישלון מחזיר ריק.
   */
  private async gatherQuoteContent(
    quoteId?: string,
  ): Promise<{ itemsText: string; docText: string; hasEditedDoc: boolean }> {
    const result = { itemsText: '', docText: '', hasEditedDoc: false };
    if (!quoteId) return result;

    // פריטי שורה (lineItemsJson) — תיאור + כמות.
    try {
      const q: any = await this.prisma.quote
        .findUnique({ where: { id: quoteId }, select: { lineItemsJson: true } })
        .catch(() => null);
      const items = Array.isArray(q?.lineItemsJson) ? q.lineItemsJson : [];
      result.itemsText = items
        .map((it: any) => {
          const desc = String(it?.description || '').trim();
          if (!desc) return '';
          const qty = it?.qty != null && String(it.qty).trim() ? ` (כמות: ${it.qty})` : '';
          return `- ${desc}${qty}`;
        })
        .filter(Boolean)
        .join('\n');
    } catch (e: any) {
      this.logger.warn(`gatherQuoteContent items failed: ${e?.message || e}`);
    }

    // הגרסה הערוכה מ-OneDrive בלבד — לא המיזוג הגולמי ולא צירוף ידני.
    // בוחרים את הגרסה הערוכה העדכנית ביותר לפי createdAt; אם אין כזו — אין docText.
    try {
      const doc: any = await (this.prisma as any).quoteDocument
        .findFirst({
          where: { quoteId, documentDescription: { contains: 'סונכרן אוטומטית' } },
          orderBy: { createdAt: 'desc' },
          select: { data: true, mimeType: true, fileName: true, documentDescription: true },
        })
        .catch(() => null);
      if (this.isEditedFromWord(doc)) {
        result.hasEditedDoc = true;
        const mime = String(doc?.mimeType || '');
        const isDocx = /word|officedocument/i.test(mime) || /\.docx$/i.test(String(doc?.fileName || ''));
        if (doc?.data && isDocx) {
          result.docText = this.extractDocxText(Buffer.from(doc.data));
        }
      }
    } catch (e: any) {
      this.logger.warn(`gatherQuoteContent docx failed: ${e?.message || e}`);
    }

    return result;
  }

  /**
   * מחלץ טקסט מדוח מצורף (base64) — תומך ב-PDF וב-DOCX. best-effort: בכישלון מחזיר ''.
   * משמש לניסוח מייל הדוח כדי שה-AI יתבסס על תוכן הדוח האמיתי.
   */
  private async extractReportText(base64?: string, mimeType?: string, fileName?: string): Promise<string> {
    if (!base64) return '';
    let buf: Buffer;
    try {
      buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    } catch {
      return '';
    }
    const mime = String(mimeType || '');
    const isPdf = /pdf/i.test(mime) || /\.pdf$/i.test(String(fileName || ''));
    const isDocx = /word|officedocument/i.test(mime) || /\.docx$/i.test(String(fileName || ''));
    try {
      if (isPdf) return await this.extractPdfText(buf);
      if (isDocx) return this.extractDocxText(buf);
      // ברירת מחדל: מנסים DOCX (זול), אם ריק — PDF.
      const docx = this.extractDocxText(buf);
      return docx || (await this.extractPdfText(buf));
    } catch (e: any) {
      this.logger.warn(`extractReportText failed: ${e?.message || e}`);
      return '';
    }
  }

  /** מחלץ טקסט מ-PDF באמצעות pdfjs-dist. מוגבל באורך לפרומפט. best-effort. */
  private async extractPdfText(pdf: Buffer): Promise<string> {
    try {
      // legacy build — ריצה ב-Node ללא DOM. בגרסה 3.11 זהו UMD (pdf.js), לכן import דינמי
      // עשוי להחזיר את ה-API תחת default או ישירות על המודול.
      const mod: any = await import('pdfjs-dist/legacy/build/pdf.js');
      const pdfjs: any = mod?.getDocument ? mod : mod?.default;
      if (!pdfjs?.getDocument) throw new Error('pdfjs getDocument unavailable');
      const data = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
      const doc = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
      const parts: string[] = [];
      const maxPages = Math.min(doc.numPages, 15); // תקרה — דוחות ארוכים מספיק בעמודים הראשונים
      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const line = content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ');
        if (line.trim()) parts.push(line.trim());
        if (parts.join('\n').length > 6000) break;
      }
      await doc.destroy?.();
      return parts.join('\n').slice(0, 6000);
    } catch (e: any) {
      this.logger.warn(`extractPdfText failed: ${e?.message || e}`);
      return '';
    }
  }

  /** מחלץ טקסט גולמי מ-DOCX (word/document.xml) — פסקאות מופרדות בשורה חדשה. מוגבל באורך לפרומפט. */
  private extractDocxText(docx: Buffer): string {
    try {
      const zip = new PizZip(docx);
      const f = zip.file('word/document.xml');
      if (!f) return '';
      let xml = f.asText();
      xml = xml.replace(/<\/w:p>/g, '\n'); // סוף פסקה → שורה חדשה
      xml = xml.replace(/<w:tab\b[^>]*\/>/g, ' '); // טאב → רווח
      const text = xml
        .replace(/<[^>]+>/g, '') // הסרת כל התגים
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
      return text.slice(0, 6000); // תקרה לפרומפט — מספיק לתיאור העבודה
    } catch (e: any) {
      this.logger.warn(`extractDocxText failed: ${e?.message || e}`);
      return '';
    }
  }

  /**
   * מחלץ שם פרטי משם מלא — המילה הראשונה.
   * "יורם גבאי" → "יורם" ; "ד"ר דנה לוי" → "ד"ר" יטופל ע"י דילוג על תארים נפוצים.
   */
  private firstNameOf(fullName?: string): string {
    const name = (fullName || '').trim();
    if (!name) return '';
    const titles = new Set(['מר', 'גב\'', 'גברת', 'ד"ר', 'דר', 'פרופ\'', 'פרופסור', 'עו"ד', 'מהנדס', 'אדריכל']);
    const parts = name.split(/\s+/).filter(Boolean);
    // דלג על תואר פתיחה אם קיים, וקח את המילה הבאה.
    let idx = 0;
    if (parts.length > 1 && titles.has(parts[0])) idx = 1;
    return parts[idx] || parts[0];
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
