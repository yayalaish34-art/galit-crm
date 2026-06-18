import { Injectable, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService } from '../microsoft/graph-mail.service';

@Injectable()
export class QuoteMailService {
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly graphMail: GraphMailService,
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
      docUrl?: string;
      customerName?: string;
      userId?: string;
      subject?: string;
      body?: string;
      cc?: string[];
      includeSignature?: boolean;
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

    // ── Resolve the document: prefer the DB task-attachment (persistent), then disk fallback ──
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let fileName: string | null = null;
    let attachmentContent: Buffer | null = null;
    let attachmentPath: string | null = null;

    if (opts?.attachmentId) {
      const att = await this.prisma.taskAttachment.findUnique({ where: { id: opts.attachmentId } });
      if (att) {
        attachmentContent = Buffer.from(att.data);
        fileName = att.fileName;
      }
    }
    // Prefer DB-stored bytes from the latest QuoteDocument (survives deploys).
    if (!attachmentContent && quote.quoteDocuments?.length > 0 && quote.quoteDocuments[0].data) {
      attachmentContent = Buffer.from(quote.quoteDocuments[0].data);
      fileName = quote.quoteDocuments[0].fileName;
    }
    if (!attachmentContent) {
      let relPath: string | null = null;
      if (quote.quoteDocuments?.length > 0) {
        relPath = quote.quoteDocuments[0].filePath;
        fileName = quote.quoteDocuments[0].fileName;
      } else if (quote.lastMergedDocPath) {
        relPath = quote.lastMergedDocPath;
        fileName = path.basename(quote.lastMergedDocPath);
      }
      if (!relPath) {
        throw new BadRequestException('אין מסמך ממוזג להצעה זו — יש לבצע מיזוג קודם');
      }
      const absolutePath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(absolutePath)) {
        throw new BadRequestException(`קובץ המסמך לא נמצא בשרת: ${fileName}`);
      }
      attachmentPath = absolutePath;
      // Graph needs the bytes in-memory; load once so both paths can use it.
      attachmentContent = fs.readFileSync(absolutePath);
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
      if (sender?.mailSignatureImage) {
        const cid = 'signature-image';
        signatureImage = {
          content: Buffer.from(sender.mailSignatureImage),
          contentType: sender.mailSignatureImageType || 'image/png',
          contentId: cid,
        };
        parts.push(
          `<div style="margin-top:10px;"><img src="cid:${cid}" alt="חתימה" style="max-width:460px;max-height:220px;width:auto;height:auto;" /></div>`,
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

    const finalFileName = fileName || 'הצעת מחיר.docx';

    // Normalize CC: dedupe, trim, keep only valid-looking addresses.
    const cc = Array.from(
      new Set((opts?.cc || []).map((e) => e.trim()).filter((e) => e.includes('@'))),
    );

    // ── Send: Graph (user's Outlook) preferred, SMTP fallback ──
    let via: 'graph' | 'smtp';
    if (graphReady && opts?.userId) {
      const graphAttachments = [
        { name: finalFileName, contentType: DOCX_MIME, content: attachmentContent! },
      ];
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
      const smtpAttachments: any[] = [
        { filename: finalFileName, contentType: DOCX_MIME, content: attachmentContent! },
      ];
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
