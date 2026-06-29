import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { GraphFilesService } from '../microsoft/graph-files.service';
import { PdfConvertService } from './pdf-convert.service';

@Injectable()
export class QuoteMailService {
  private readonly logger = new Logger(QuoteMailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly graphMail: GraphMailService,
    private readonly graphFiles: GraphFilesService,
    private readonly pdfConvert: PdfConvertService,
  ) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      // Transporter will be null — sendQuoteEmail will throw a clear error
      this.transporter = null as any;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  /**
   * Send the latest merged document for a quote as an email attachment.
   * Resolves the document path: latest QuoteDocument → fallback lastMergedDocPath.
   */
  async sendQuoteEmail(
    quoteId: string,
    recipientEmail: string,
    opts?: {
      attachmentId?: string;
      /** כמה קבצים לצירוף (כל DOCX יומר ל-PDF בזמן השליחה). גובר על attachmentId. */
      attachmentIds?: string[];
      docUrl?: string;
      customerName?: string;
      userId?: string;
      subject?: string;
      body?: string;
      cc?: string[];
      includeSignature?: boolean;
      /** מזהה החתימה הנבחרת (UserSignature). אם לא צוין — חתימת ברירת המחדל הישנה. */
      signatureId?: string;
      /** משוך את הגרסה העדכנית מ-OneDrive (הקובץ שנערך ב-Word) במקום העותק השמור. */
      preferOnedrive?: boolean;
    },
  ): Promise<{ success: true; sentTo: string; fileName: string; via: 'graph' | 'smtp' }> {
    // Prefer sending from the user's own Outlook (Graph); SMTP is the fallback.
    const graphReady = opts?.userId
      ? (await this.msAuth.getStatus(opts.userId)).connected
      : false;

    if (!graphReady && !this.transporter) {
      throw new BadRequestException(
        'שליחת מייל לא מוגדרת — חבר חשבון Outlook (מומלץ) או הגדר SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS',
      );
    }

    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new BadRequestException('כתובת מייל לא תקינה');
    }

    const quote: any = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { quoteDocuments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!quote) {
      throw new BadRequestException('הצעת מחיר לא נמצאה');
    }

    // ── Resolve the document(s) to send. סדר עדיפות: ──
    //   0) OneDrive (כשהמשתמש ערך ב-Word) — הגרסה העדכנית והקנונית.
    //   1) task-attachment(s) שנבחרו במפורש.
    //   2) ה-QuoteDocument האחרון (bytes ב-DB).
    //   3) קובץ מהדיסק (fallback לרשומות ישנות).
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docs: { content: Buffer; fileName: string; mime: string }[] = [];
    const quoteNumberForName = quote.quoteNumber || quote.importLegacyId || '';
    const baseDocName = `הצעת מחיר${quoteNumberForName ? ' ' + quoteNumberForName : ''}`;

    // 0) OneDrive — אם המשתמש ערך ב-Word, מושכים את הגרסה העדכנית ישירות משם.
    if (opts?.preferOnedrive) {
      const ref = await this.getOnedriveRefSafe(quoteId);
      if (ref) {
        try {
          const fresh = await this.graphFiles.downloadContent(ref.ownerId, ref.itemId);
          docs.push({ content: fresh, fileName: `${baseDocName}.docx`, mime: DOCX_MIME });
        } catch (e: any) {
          this.logger.warn(`OneDrive pull failed for quote ${quoteId} — falling back to stored copy: ${e?.message || e}`);
        }
      }
    }

    // 1) תמיכה בכמה קבצים: attachmentIds (רבים) או attachmentId (בודד — תאימות לאחור).
    const attachmentIds = (opts?.attachmentIds?.length ? opts.attachmentIds : opts?.attachmentId ? [opts.attachmentId] : [])
      .filter((x): x is string => !!x);
    if (docs.length === 0) {
      for (const attId of attachmentIds) {
        const att = await this.prisma.taskAttachment.findUnique({ where: { id: attId } });
        if (att) {
          docs.push({ content: Buffer.from(att.data), fileName: att.fileName, mime: att.mimeType || DOCX_MIME });
        }
      }
    }
    // Fallback: DB-stored bytes from the latest QuoteDocument (survives deploys), then disk path.
    // משתמשים ב-mimeType השמור — כך PDF שהועלה (Word→PDF) נשלח כמות-שהוא בלי המרה.
    if (docs.length === 0 && quote.quoteDocuments?.length > 0 && quote.quoteDocuments[0].data) {
      const qd = quote.quoteDocuments[0];
      docs.push({ content: Buffer.from(qd.data), fileName: qd.fileName, mime: qd.mimeType || DOCX_MIME });
    }
    if (docs.length === 0) {
      let relPath: string | null = null;
      let diskName: string | null = null;
      if (quote.quoteDocuments?.length > 0) {
        relPath = quote.quoteDocuments[0].filePath;
        diskName = quote.quoteDocuments[0].fileName;
      } else if (quote.lastMergedDocPath) {
        relPath = quote.lastMergedDocPath;
        diskName = path.basename(quote.lastMergedDocPath);
      }
      if (!relPath) {
        throw new BadRequestException('אין מסמך ממוזג להצעה זו — יש לבצע מיזוג קודם');
      }
      const absolutePath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(absolutePath)) {
        throw new BadRequestException(`קובץ המסמך לא נמצא בשרת: ${diskName}`);
      }
      docs.push({ content: fs.readFileSync(absolutePath), fileName: diskName || 'הצעת מחיר.docx', mime: DOCX_MIME });
    }

    // ── המרה ל-PDF בזמן השליחה: כל קובץ DOCX מומר ל-PDF ונשלח כ-PDF (גם אם צורפו כמה קבצים). ──
    // מנוע ראשי: Microsoft Graph (Word — כותרת/עיצוב זהים לתבנית) כשהמשתמש מחובר ל-Outlook;
    // גיבוי: CloudConvert. ההמרה היא best-effort: אם שום מנוע לא זמין/נכשל — נשלח ה-DOCX המקורי.
    const canConvert = (graphReady && !!opts?.userId) || this.pdfConvert.enabled;
    for (const doc of docs) {
      const isDocx = /\.docx$/i.test(doc.fileName) || doc.mime === DOCX_MIME;
      if (!isDocx) continue; // קובץ שאינו DOCX (למשל PDF/תמונה) נשלח כמות שהוא
      if (!canConvert) {
        this.logger.warn(`PDF conversion not configured (Outlook/CloudConvert) — sending "${doc.fileName}" as DOCX`);
        continue;
      }
      try {
        doc.content = await this.pdfConvert.docxToPdf(doc.content, doc.fileName, opts?.userId);
        doc.fileName = doc.fileName.replace(/\.docx$/i, '') + '.pdf';
        doc.mime = 'application/pdf';
      } catch (e: any) {
        this.logger.warn(`PDF conversion failed for "${doc.fileName}" — sending DOCX: ${e?.message || e}`);
      }
    }

    // ── Build the email (HTML עם לחצן/קישור מתויג + הקובץ מצורף) ──
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const quoteNumber = quote.quoteNumber || quote.importLegacyId || 'טיוטה';
    const custName = (opts?.customerName || '').trim();

    // Subject: custom if provided, else default.
    const subject =
      opts?.subject?.trim() ||
      `הצעת מחיר${quoteNumber ? ' ' + quoteNumber : ''}${custName ? ' - ' + custName : ''}`;

    // הקובץ מצורף ישירות למייל — אין צורך בכפתור הורדה/קישור (הוסר למניעת כפילות).
    const linkBlock = '';

    // Resolve the per-user signature (text + optional image, if requested).
    // The image is sent as an INLINE attachment (CID) because Outlook blocks
    // data:base64 <img>. We collect it here and attach it below.
    let signatureHtml = '';
    let signatureImage: { content: Buffer; contentType: string; contentId: string } | null = null;
    if (opts?.includeSignature && opts.userId) {
      const sender = await this.prisma.user.findUnique({
        where: { id: opts.userId },
        select: { mailSignature: true, mailSignatureImage: true, mailSignatureImageType: true },
      });
      const parts: string[] = [];
      if (sender?.mailSignature?.trim()) {
        parts.push(`<div style="color:#444;">${this.toHtml(sender.mailSignature)}</div>`);
      }
      // בחירת תמונת החתימה: אם נבחרה חתימה ספציפית (signatureId) — נשתמש בה;
      // אחרת נופלים לחתימה הבודדת הישנה (תאימות לאחור).
      let sigBytes: Buffer | null = null;
      let sigType = 'image/png';
      if (opts.signatureId) {
        const chosen = await this.prisma.userSignature.findUnique({
          where: { id: opts.signatureId },
        });
        if (chosen && chosen.userId === opts.userId) {
          sigBytes = Buffer.from(chosen.image);
          sigType = chosen.imageType || 'image/png';
        }
      }
      if (!sigBytes && sender?.mailSignatureImage) {
        sigBytes = Buffer.from(sender.mailSignatureImage);
        sigType = sender.mailSignatureImageType || 'image/png';
      }
      if (sigBytes) {
        const cid = 'signature-image';
        signatureImage = {
          content: sigBytes,
          contentType: sigType,
          contentId: cid,
        };
        parts.push(
          `<div style="margin-top:12px;"><img src="cid:${cid}" alt="חתימה" style="max-width:640px;max-height:320px;width:auto;height:auto;" /></div>`,
        );
      }
      if (parts.length) {
        signatureHtml = `<div style="margin-top:18px;">${parts.join('')}</div>`;
      }
    }

    // Body: custom text (converted to HTML) if provided, else the default template.
    const bodyHtml = opts?.body?.trim()
      ? `<div>${this.toHtml(opts.body)}</div>${linkBlock}`
      : `<p>שלום${custName ? ' ' + custName : ''},</p>
<p>מצורפת הצעת מחיר${quoteNumber ? ' מספר <strong>' + quoteNumber + '</strong>' : ''}.</p>
${linkBlock}
<p>בברכה,<br>גלית – החברה לאיכות הסביבה</p>`;

    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#111111;line-height:1.6;">
${bodyHtml}
${signatureHtml}
</div>`;

    const finalFileName = docs[0]?.fileName || 'הצעת מחיר.docx';

    // Normalize CC: dedupe, trim, keep only valid-looking addresses.
    const cc = Array.from(
      new Set((opts?.cc || []).map((e) => e.trim()).filter((e) => e.includes('@'))),
    );

    // ── Send: Graph (user's Outlook) preferred, SMTP fallback ──
    let via: 'graph' | 'smtp';
    if (graphReady && opts?.userId) {
      const graphAttachments = docs.map((d) => ({ name: d.fileName, contentType: d.mime, content: d.content }));
      if (signatureImage) {
        graphAttachments.push({
          name: 'signature' + (signatureImage.contentType === 'image/jpeg' ? '.jpg' : '.png'),
          contentType: signatureImage.contentType,
          content: signatureImage.content,
          contentId: signatureImage.contentId,
        } as any);
      }
      await this.graphMail.sendMailAsUser(opts.userId, {
        to: recipientEmail,
        cc,
        subject,
        html,
        attachments: graphAttachments,
      });
      via = 'graph';
    } else {
      const smtpAttachments: any[] = docs.map((d) => ({ filename: d.fileName, contentType: d.mime, content: d.content }));
      if (signatureImage) {
        smtpAttachments.push({
          filename: 'signature' + (signatureImage.contentType === 'image/jpeg' ? '.jpg' : '.png'),
          content: signatureImage.content,
          contentType: signatureImage.contentType,
          cid: signatureImage.contentId, // referenced via cid: in the HTML
        });
      }
      await this.transporter.sendMail({
        from: fromAddress,
        to: recipientEmail,
        cc: cc.length ? cc : undefined,
        subject,
        html,
        attachments: smtpAttachments,
      });
      via = 'smtp';
    }

    // ── Update quote with email tracking ──
    try {
      await (this.prisma.quote.update as any)({
        where: { id: quoteId },
        data: {
          lastEmailedAt: new Date(),
          lastEmailedTo: recipientEmail,
        },
      });
    } catch (_e) {
      // Fields may not exist in DB yet — don't fail the send
    }

    return { success: true, sentTo: recipientEmail, fileName: finalFileName, via };
  }

  /** קורא את הפניית ה-OneDrive של ההצעה (guarded — מחזיר null אם העמודות לא הוגרו ב-DB). */
  private async getOnedriveRefSafe(
    quoteId: string,
  ): Promise<{ itemId: string; ownerId: string } | null> {
    try {
      const ref: any = await (this.prisma.quote.findUnique as any)({
        where: { id: quoteId },
        select: { onedriveItemId: true, onedriveOwnerId: true },
      });
      if (ref?.onedriveItemId && ref?.onedriveOwnerId) {
        return { itemId: ref.onedriveItemId, ownerId: ref.onedriveOwnerId };
      }
    } catch {
      // עמודות OneDrive עדיין לא קיימות ב-DB (לפני הרצת המיגרציה).
    }
    return null;
  }

  /**
   * Convert plain user text to safe HTML.
   * Escapes, then bolds key data lines (total / payment terms / validity / duration / quote no.)
   * so they stand out in the email.
   */
  private toHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // מילות מפתח שמתחילות שורת נתונים חשובה — נדגיש את כל השורה.
    const keyPrefixes = ['סה"כ', 'סה״כ', 'תנאי תשלום', 'תוקף ההצעה', 'משך ביצוע', 'מספר הצעה'];
    const lines = escaped.split('\n').map((line) => {
      const trimmed = line.trimStart();
      if (keyPrefixes.some((k) => trimmed.startsWith(k))) {
        return `<strong>${line}</strong>`;
      }
      return line;
    });
    return lines.join('<br>');
  }
}
