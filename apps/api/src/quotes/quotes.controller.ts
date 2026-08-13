import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { QuoteSignatureService } from './quote-signature.service';
import { DocxTextEditService } from './docx-text-edit.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('quotes')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly quoteMailService: QuoteMailService,
    private readonly pdfConvert: PdfConvertService,
    private readonly signatureService: QuoteSignatureService,
    private readonly docxTextEdit: DocxTextEditService,
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
    @Query('q') q?: string,
    @Query('take') take?: string,
  ) {
    return this.quotesService.findAll({
      projectId,
      opportunityId,
      customerId,
      leadId,
      linkedEntityId,
      q,
      take: take ? Number(take) : undefined,
      user: req.user,
    });
  }

  @Get('next-reference')
  nextReference() {
    return this.quotesService.getNextReference();
  }

  /* ── עריכת טקסט בקבצים ממוזגים — מנהל/אדמין בלבד ──
   * חייב להיות מוצהר *לפני* `@Get(':id')`, אחרת Nest מתאים את הנתיב ל-:id
   * ו-"merged-docs" נקרא כמזהה הצעה. */

  /** רשימת הקבצים הממוזגים (DOCX) לעריכה. ללא תוכן הקבצים. */
  @Get('merged-docs')
  @Roles('ADMIN', 'MANAGER')
  listMergedDocs(@Query('q') q?: string, @Query('take') take?: string) {
    return this.quotesService.listMergedDocs({ q, take: take ? Number(take) : undefined });
  }

  /** הפסקאות הניתנות לעריכה במסמך ממוזג. */
  @Get('merged-docs/:docId/text')
  @Roles('ADMIN', 'MANAGER')
  async getMergedDocText(@Param('docId') docId: string) {
    const doc = await this.quotesService.getMergedDocById(docId);
    if (!/\.docx$/i.test(doc.fileName || '') && doc.mimeType === 'application/pdf') {
      throw new BadRequestException('קובץ PDF אינו ניתן לעריכת טקסט — יש לערוך את גרסת ה-Word');
    }
    return {
      id: doc.id,
      quoteId: doc.quoteId,
      fileName: doc.fileName,
      paragraphs: this.docxTextEdit.extractParagraphs(doc.bytes),
    };
  }

  /** הורדת המסמך הממוזג לבדיקה ב-Word. */
  @Get('merged-docs/:docId/download')
  @Roles('ADMIN', 'MANAGER')
  async downloadMergedDoc(@Param('docId') docId: string, @Res() res: Response) {
    const doc = await this.quotesService.getMergedDocById(docId);
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    res.setHeader('Content-Type', doc.mimeType || DOCX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName || 'quote.docx')}"`);
    res.send(doc.bytes);
  }

  /**
   * POST /quotes/merged-docs/:docId/text  { paragraphs: [{ id, text }] }
   * מחיל את העריכות ושומר גרסה חדשה. המקור נשמר כפי שהוא.
   */
  @Post('merged-docs/:docId/text')
  @Roles('ADMIN', 'MANAGER')
  async saveMergedDocText(
    @Param('docId') docId: string,
    @Body() body: { paragraphs?: Array<{ id: number; text: string }> },
    @Req() req: any,
  ) {
    const edits = (body?.paragraphs || []).filter(
      (p) => p && Number.isInteger(Number(p.id)) && typeof p.text === 'string',
    );
    if (edits.length === 0) throw new BadRequestException('לא נשלחו פסקאות לעדכון');

    const doc = await this.quotesService.getMergedDocById(docId);
    const { buffer, changed } = this.docxTextEdit.applyParagraphEdits(
      doc.bytes,
      edits.map((p) => ({ id: Number(p.id), text: p.text })),
    );
    if (changed === 0) return { changed: 0, saved: false };

    const created = await this.quotesService.saveEditedMergedDoc(docId, buffer, req.user?.id);
    return { changed, saved: true, document: created };
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
      bcc?: string[];
      /** אישור קריאה — Graph isReadReceiptRequested */
      requestReadReceipt?: boolean;
      /** אישור מסירה — Graph isDeliveryReceiptRequested */
      requestDeliveryReceipt?: boolean;
      includeSignature?: boolean;
      signatureId?: string;
      preferOnedrive?: boolean;
      /** מצב חתימה: טוקן החתימה. אם סופק — מצרפים את קובץ ההצעה עם כפתור "לחץ כאן לחתימה" מוטמע בפנים. */
      signToken?: string;
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
      bcc: body.bcc,
      requestReadReceipt: body.requestReadReceipt,
      requestDeliveryReceipt: body.requestDeliveryReceipt,
      includeSignature: body.includeSignature,
      signatureId: body.signatureId,
      preferOnedrive: body.preferOnedrive,
      signToken: body.signToken,
      publicApiBaseUrl: req?.headers?.host ? `https://${req.headers.host}` : undefined,
    });
  }

  /**
   * POST /quotes/:id/request-signature
   * מכין את ההצעה לחתימת לקוח דיגיטלית (ממיר ל-PDF, מייצר טוקן) ומחזיר את הטוקן
   * + פרטי הלקוח. הקישור עצמו נבנה בצד הלקוח: `${origin}/sign/${token}`.
   */
  @Post(':id/request-signature')
  requestSignature(
    @Param('id') id: string,
    @Body() body: { markRequested?: boolean; webOrigin?: string } | undefined,
    @Req() req: any,
  ) {
    // markRequested=false — יצירת קישור להורדת PDF (למשל "שלח בווצאפ" הפשוט) בלי לשנות
    // את סטטוס החתימה של ההצעה ל-REQUESTED.
    // webOrigin — כתובת האתר (window.location.origin) לבניית הקישור של כפתור "לחץ כאן לחתימה" ב-PDF.
    return this.signatureService.requestSignature(id, req.user?.id, {
      markRequested: body?.markRequested,
      webOrigin: body?.webOrigin,
    });
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
  openInOneDrive(
    @Param('id') id: string,
    @Body() body: { attachmentId?: string } | undefined,
    @Req() req: any,
  ) {
    // attachmentId — עריכה פר-קובץ: פותח ב-Word את הקובץ המצורף הספציפי (ולא את המיזוג האחרון).
    return this.quotesService.openInOneDrive(id, req.user?.id, body?.attachmentId);
  }

  /**
   * POST /quotes/:id/onedrive-sync
   * מושך את הגרסה הערוכה האחרונה מ-OneDrive ושומר אותה ב-DB (נקרא כשחוזרים מ-Word ל-CRM / ידנית).
   */
  @Post(':id/onedrive-sync')
  onedriveSync(@Param('id') id: string) {
    return this.quotesService.syncFromOneDrive(id);
  }

  /**
   * POST /quotes/:id/onedrive-rename  { fileName }
   * עריכה ידנית של שם קובץ → משנה את שם הקובץ ב-OneDrive ונועל אותו (השם הידני מנצח).
   * best-effort — מחזיר { renamed } (false אם אין קובץ פעיל ב-OneDrive).
   */
  @Post(':id/onedrive-rename')
  async onedriveRename(@Param('id') id: string, @Body() body: { fileName?: string }) {
    const renamed = await this.quotesService.renameOnedriveForQuote(id, body?.fileName || '');
    return { renamed };
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

