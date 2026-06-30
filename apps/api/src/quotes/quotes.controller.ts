import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { QuoteSignatureService } from './quote-signature.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('quotes')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly quoteMailService: QuoteMailService,
    private readonly pdfConvert: PdfConvertService,
    private readonly signatureService: QuoteSignatureService,
  ) {}

  /** המרת DOCX (base64) ל-PDF: Microsoft Graph (Word) אם המשתמש מחובר, אחרת CloudConvert. body: { dataBase64, fileName } */
  @Post('convert-docx-to-pdf')
  async convertDocxToPdf(@Body() body: { dataBase64?: string; fileName?: string }, @Req() req: any) {
    if (!body?.dataBase64) throw new BadRequestException('חסר קובץ DOCX להמרה');
    const clean = body.dataBase64.replace(/^data:[^;]+;base64,/, '');
    const docx = Buffer.from(clean, 'base64');
    const pdf = await this.pdfConvert.docxToPdf(docx, body.fileName || 'quote.docx', req.user?.id);
    const pdfName = (body.fileName || 'הצעת מחיר').replace(/\.docx$/i, '') + '.pdf';
    return { dataBase64: pdf.toString('base64'), fileName: pdfName, mimeType: 'application/pdf' };
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
    @Query('linkedEntityId') linkedEntityId?: string,
  ) {
    return this.quotesService.findAll({ projectId, opportunityId, customerId, leadId, linkedEntityId, user: req.user });
  }

  @Get('next-reference')
  nextReference() {
    return this.quotesService.getNextReference();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.quotesService.create(body, req.user);
  }

  @Post(':id/pdf')
  async createPdf(@Param('id') id: string) {
    return this.quotesService.generatePdf(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const quote = await this.quotesService.findOne(id);
    if (!quote || !quote.pdfPath) {
      res.status(404).send('PDF not found');
      return;
    }

    const absolute = path.join(process.cwd(), quote.pdfPath);
    if (!fs.existsSync(absolute)) {
      res.status(404).send('PDF file missing on disk');
      return;
    }
    res.sendFile(absolute);
  }

  @Get(':id/merged-doc')
  async getMergedDoc(@Param('id') id: string, @Res() res: Response) {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // משיכה-בקריאה: לפני ההגשה מסנכרנים את הגרסה הערוכה האחרונה מ-OneDrive (אם קיימת),
    // כך שהמסמך שמורידים בכרטיס הלקוח תמיד מעודכן — בלי תלות באירועי focus בצד הלקוח.
    await this.quotesService.syncFromOneDrive(id).catch(() => null);

    // Prefer the DB-stored bytes (survive deploys); fall back to disk for legacy rows.
    const doc = await this.quotesService.getLatestMergedDocument(id);
    if (doc?.data) {
      res.setHeader('Content-Type', doc.mimeType || DOCX_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName || 'quote.docx')}"`);
      res.send(Buffer.from(doc.data));
      return;
    }

    const quote: any = await this.quotesService.findOne(id);
    const relPath = doc?.filePath || quote?.lastMergedDocPath;
    if (!relPath) {
      res.status(404).send('Merged document not found');
      return;
    }
    const absolute = path.join(process.cwd(), relPath);
    if (!fs.existsSync(absolute)) {
      res.status(404).send('Merged document file missing on disk');
      return;
    }
    const filename = path.basename(relPath);
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.sendFile(absolute);
  }

  /**
   * POST /quotes/:id/send-email
   * שליחת המסמך האחרון של ההצעה כקובץ מצורף במייל
   */
  @Post(':id/send-email')
  sendEmail(
    @Param('id') id: string,
    @Body()
    body: {
      email: string;
      attachmentId?: string;
      attachmentIds?: string[];
      docUrl?: string;
      customerName?: string;
      subject?: string;
      messageBody?: string;
      cc?: string[];
      includeSignature?: boolean;
      signatureId?: string;
      preferOnedrive?: boolean;
      /** קישור לעמוד הצפייה/חתימה (/sign). אם סופק — לא מצרפים קובץ, אלא כפתור "צפייה בהצעת מחיר". */
      viewUrl?: string;
    },
    @Req() req: any,
  ) {
    return this.quoteMailService.sendQuoteEmail(id, body.email, {
      attachmentId: body.attachmentId,
      attachmentIds: body.attachmentIds,
      docUrl: body.docUrl,
      customerName: body.customerName,
      userId: req.user?.id,
      subject: body.subject,
      body: body.messageBody,
      cc: body.cc,
      includeSignature: body.includeSignature,
      signatureId: body.signatureId,
      preferOnedrive: body.preferOnedrive,
      viewUrl: body.viewUrl,
      // ה-host של הבקשה = הדומיין הציבורי של ה-API (Railway תמיד https חיצונית).
      // משמש לבניית הקישור לכפתור "הפרופיל שלנו + רישיונות". PUBLIC_API_URL גובר אם הוגדר.
      publicApiBaseUrl: req?.headers?.host ? `https://${req.headers.host}` : undefined,
    });
  }

  /**
   * POST /quotes/:id/request-signature
   * מכין את ההצעה לחתימת לקוח דיגיטלית (ממיר ל-PDF, מייצר טוקן) ומחזיר את הטוקן
   * + פרטי הלקוח. הקישור עצמו נבנה בצד הלקוח: `${origin}/sign/${token}`.
   */
  @Post(':id/request-signature')
  requestSignature(@Param('id') id: string, @Req() req: any) {
    return this.signatureService.requestSignature(id, req.user?.id);
  }

  @Post(':id/save-merged-doc')
  saveMergedDoc(@Param('id') id: string, @Body() body: { base64Data: string; fileName: string; mimeType?: string }) {
    return this.quotesService.saveMergedDoc(id, body.base64Data, body.fileName, body.mimeType);
  }

  /**
   * POST /quotes/:id/onedrive-edit
   * פותח את המסמך הממוזג לעריכה ב-Word דרך OneDrive (שמירה-חזרה אוטומטית).
   * מחזיר { webUrl, webDavUrl, itemId, reused } — הפרונט פותח את webDavUrl ב-Word דסקטופ.
   */
  @Post(':id/onedrive-edit')
  openInOneDrive(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.openInOneDrive(id, req.user?.id);
  }

  /**
   * POST /quotes/:id/onedrive-sync
   * מושך את הגרסה הערוכה האחרונה מ-OneDrive ושומר אותה ב-DB (נקרא כשחוזרים מ-Word ל-CRM / ידנית).
   */
  @Post(':id/onedrive-sync')
  onedriveSync(@Param('id') id: string) {
    return this.quotesService.syncFromOneDrive(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.quotesService.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.remove(id, req.user);
  }
}

