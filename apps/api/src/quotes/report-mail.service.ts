import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { ReviewRequestService } from '../reviews/review-request.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface SendReportEmailOpts {
  /** מסמך לקוח קיים (Document, documentType=REPORT) שכבר נשמר בכרטיס — נשלח לפי המזהה. */
  documentId?: string;
  /** חלופה: הדוח כ-base64 גולמי (כשאין customerId / לא נשמר בכרטיס). גובר רק אם אין documentId. */
  attachment?: { fileName: string; mimeType?: string; dataBase64: string };
  /** נמען ראשי (חובה — מאומת בזמן ריצה). */
  to?: string;
  /** נמענים נוספים — יתווספו כ-To. */
  toList?: string[];
  cc?: string[];
  /** עותק מוסתר — נמענים שיקבלו את המייל בלי שייראו לשאר. */
  bcc?: string[];
  subject?: string;
  body?: string;
  includeSignature?: boolean;
  signatureId?: string;
  customerName?: string;
  /** המשתמש השולח (לתיבת ה-Outlook שלו + חתימה). */
  userId?: string;
  /**
   * לשלוח אוטומטית מייל "בקשת דירוג" (5 פרצופים) ללקוח מיד אחרי שליחת הדוח.
   * ברירת מחדל: true. best-effort — כישלון לא מפיל את שליחת הדוח.
   */
  sendReviewRequest?: boolean;
  /** host הבקשה — לבניית קישור ה-API הציבורי שנצרב במייל הדירוג. */
  requestHost?: string | null;
}

/**
 * שליחת "דוח" שהופק ללקוח במייל דרך ה-Outlook של המשתמש (Microsoft Graph),
 * וסימון משימת הביצוע כ-DONE. כל DOCX מומר ל-PDF בזמן השליחה (כמו בהצעת מחיר).
 * מקור הקובץ: Document(documentType=REPORT) לפי documentId, או base64 גולמי כ-fallback.
 */
@Injectable()
export class ReportMailService {
  private readonly logger = new Logger(ReportMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly graphMail: GraphMailService,
    private readonly pdfConvert: PdfConvertService,
    private readonly reviewRequest: ReviewRequestService,
  ) {}

  async sendReportEmail(
    taskId: string,
    opts: SendReportEmailOpts,
  ): Promise<{ success: true; sentTo: string; fileName: string; via: 'graph' }> {
    const task: any = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('משימה לא נמצאה');

    // שליחה דרך Outlook בלבד (כפי שביקש המשתמש — "שולח אוטומטית עם ה-Outlook API").
    const graphReady = opts.userId ? (await this.msAuth.getStatus(opts.userId)).connected : false;
    if (!graphReady || !opts.userId) {
      throw new BadRequestException('שליחת הדוח דורשת חיבור ל-Outlook — חבר חשבון Outlook ונסה שוב');
    }

    const to = (opts.to || '').trim();
    if (!to || !to.includes('@')) throw new BadRequestException('כתובת מייל לא תקינה');

    // ── איתור הקובץ לשליחה: Document(REPORT) לפי מזהה, או base64 גולמי ──
    let fileBuf: Buffer;
    let fileName: string;
    let mime: string;
    if (opts.documentId) {
      const doc: any = await this.prisma.document.findUnique({ where: { id: opts.documentId } });
      if (!doc || !doc.dataBase64) throw new BadRequestException('הדוח לא נמצא או ריק');
      fileBuf = Buffer.from(doc.dataBase64, 'base64');
      fileName = doc.name || 'דוח.pdf';
      mime = doc.mimeType || DOCX_MIME;
    } else if (opts.attachment?.dataBase64) {
      fileBuf = Buffer.from(opts.attachment.dataBase64, 'base64');
      fileName = opts.attachment.fileName || 'דוח.pdf';
      mime = opts.attachment.mimeType || DOCX_MIME;
    } else {
      throw new BadRequestException('לא צורף דוח לשליחה');
    }

    // ── המרת הדוח ל-PDF אם הוא לא כבר PDF (best-effort) ──
    const isPdf = /\.pdf$/i.test(fileName) || mime === 'application/pdf';
    if (!isPdf) {
      const isDocx = /\.docx$/i.test(fileName) || mime === DOCX_MIME;
      try {
        if (isDocx && (graphReady || this.pdfConvert.enabled)) {
          // DOCX: מנוע Graph (Word) עם נפילה-חזרה ל-CloudConvert + הקפאת תאריכים, כמו בהצעת מחיר.
          fileBuf = await this.pdfConvert.docxToPdf(fileBuf, fileName, opts.userId);
        } else if (graphReady) {
          // כל פורמט אחר (DOC ישן / XLS / XLSX / תמונה וכו') — דרך Graph בלבד.
          fileBuf = await this.pdfConvert.fileToPdf(fileBuf, fileName, mime, opts.userId);
        } else {
          throw new Error('no conversion engine available');
        }
        fileName = fileName.replace(/\.[a-z0-9]+$/i, '') + '.pdf';
        mime = 'application/pdf';
      } catch (e: any) {
        this.logger.warn(`PDF conversion failed for "${fileName}" — sending original file: ${e?.message || e}`);
      }
    }

    // ── חתימה אישית (טקסט + תמונה inline דרך CID) — זהה להצעת מחיר ──
    const custName = (opts.customerName || '').trim();
    let signatureHtml = '';
    let signatureImage: { content: Buffer; contentType: string; contentId: string } | null = null;
    if (opts.includeSignature && opts.userId) {
      const sender = await this.prisma.user.findUnique({
        where: { id: opts.userId },
        select: { mailSignature: true, mailSignatureImage: true, mailSignatureImageType: true },
      });
      const parts: string[] = [];
      if (sender?.mailSignature?.trim()) {
        parts.push(`<div style="color:#444;">${this.toHtml(sender.mailSignature)}</div>`);
      }
      let sigBytes: Buffer | null = null;
      let sigType = 'image/png';
      if (opts.signatureId) {
        const chosen = await this.prisma.userSignature.findUnique({ where: { id: opts.signatureId } });
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
        signatureImage = { content: sigBytes, contentType: sigType, contentId: cid };
        parts.push(
          `<div style="margin-top:12px;"><img src="cid:${cid}" alt="חתימה" style="max-width:640px;max-height:320px;width:auto;height:auto;" /></div>`,
        );
      }
      if (parts.length) signatureHtml = `<div style="margin-top:18px;">${parts.join('')}</div>`;
    }

    const subject = opts.subject?.trim() || `דוח${custName ? ' - ' + custName : ''}`;
    const bodyHtml = opts.body?.trim()
      ? `<div>${this.toHtml(opts.body)}</div>`
      : `<p>שלום${custName ? ' ' + custName : ''},</p>
<p>מצורף הדוח שהופק עבורכם.</p>
<p>בברכה,<br>גלית – החברה לאיכות הסביבה</p>`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#111111;line-height:1.6;">
${bodyHtml}
${signatureHtml}
</div>`;

    // נמענים: To = ראשי + נוספים; CC נפרד. ניקוי וכפילויות.
    const toAll = Array.from(
      new Set([to, ...((opts.toList || []).map((e) => e.trim()))].filter((e) => e.includes('@'))),
    );
    const cc = Array.from(
      new Set((opts.cc || []).map((e) => e.trim()).filter((e) => e.includes('@') && !toAll.includes(e))),
    );
    // עותק מוסתר — ניקוי + הסרת כתובות שכבר מופיעות ב-To/CC
    const bcc = Array.from(
      new Set(
        (opts.bcc || [])
          .map((e) => e.trim())
          .filter((e) => e.includes('@') && !toAll.includes(e) && !cc.includes(e)),
      ),
    );

    const attachments = [{ name: fileName, contentType: mime, content: fileBuf }];
    if (signatureImage) {
      attachments.push({
        name: 'signature' + (signatureImage.contentType === 'image/jpeg' ? '.jpg' : '.png'),
        contentType: signatureImage.contentType,
        content: signatureImage.content,
        contentId: signatureImage.contentId,
      } as any);
    }

    // Graph sendMail מקבל To יחיד — נשלח לראשי, והשאר כ-CC כדי שכולם יקבלו.
    const ccCombined = Array.from(new Set([...toAll.slice(1), ...cc]));
    await this.graphMail.sendMailAsUser(opts.userId, {
      to: toAll[0],
      cc: ccCombined,
      bcc,
      subject,
      html,
      attachments,
    });

    // ── סימון משימת הביצוע כ-DONE ──
    try {
      await this.prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' as any } });
    } catch (e: any) {
      this.logger.warn(`mark task ${taskId} DONE failed: ${e?.message || e}`);
    }

    // ── שליחת מייל "בקשת דירוג" (5 פרצופים) ללקוח מיד אחרי הדוח (best-effort) ──
    // נשלח לנמען הראשי בלבד. כישלון כאן לא מפיל את שליחת הדוח.
    if (opts.sendReviewRequest !== false) {
      try {
        await this.reviewRequest.sendReviewRequest({
          toEmail: toAll[0],
          customerName: custName || undefined,
          taskId,
          customerId: task.customerId || undefined,
          userId: opts.userId,
          requestHost: opts.requestHost,
        });
      } catch (e: any) {
        this.logger.warn(`auto review request failed for task ${taskId}: ${e?.message || e}`);
      }
    }

    return { success: true, sentTo: toAll[0], fileName, via: 'graph' };
  }

  /** טקסט חופשי → HTML בטוח (escape + שורות חדשות). */
  private toHtml(text: string): string {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.split('\n').join('<br>');
  }
}
