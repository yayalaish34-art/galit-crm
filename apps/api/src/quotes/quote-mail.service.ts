import { Injectable, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuoteMailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly prisma: PrismaService) {
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
  async sendQuoteEmail(quoteId: string, recipientEmail: string): Promise<{ success: true; sentTo: string; fileName: string }> {
    if (!this.transporter) {
      throw new BadRequestException('שליחת מייל לא מוגדרת — יש להגדיר SMTP_HOST, SMTP_USER, SMTP_PASS בקובץ .env');
    }

    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new BadRequestException('כתובת מייל לא תקינה');
    }

    // ── Find quote with latest document ──
    const quote: any = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        quoteDocuments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!quote) {
      throw new BadRequestException('הצעת מחיר לא נמצאה');
    }

    // ── Resolve document path: QuoteDocument first, then fallback ──
    let relPath: string | null = null;
    let fileName: string | null = null;

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

    // ── Send email ──
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const quoteNumber = quote.quoteNumber || quote.importLegacyId || 'טיוטה';
    const subject = `הצעת מחיר ${quoteNumber}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;">
<p>שלום,</p>
<p>מצורפת הצעת מחיר מספר <strong>${quoteNumber}</strong>.</p>
<p>בברכה</p>
</div>`;

    await this.transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject,
      html,
      attachments: [
        {
          filename: fileName!,
          path: absolutePath,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ],
    });

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

    return { success: true, sentTo: recipientEmail, fileName: fileName! };
  }
}
