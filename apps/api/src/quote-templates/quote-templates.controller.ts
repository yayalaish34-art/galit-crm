import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards,
  UploadedFile, UseInterceptors, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { QuoteTemplatesService } from './quote-templates.service';
import { DocxMergeService } from './docx-merge.service';
import { TemplateDocxStore } from './template-docx-store.service';
import { GraphFilesService } from '../microsoft/graph-files.service';
import { DocxTextEditService } from '../quotes/docx-text-edit.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Controller('quote-templates')
@UseGuards(RolesGuard)
export class QuoteTemplatesController {
  constructor(
    private readonly quoteTemplatesService: QuoteTemplatesService,
    private readonly docxMergeService: DocxMergeService,
    private readonly docxStore: TemplateDocxStore,
    private readonly docxTextEdit: DocxTextEditService,
    private readonly graphFiles: GraphFilesService,
    private readonly prisma: PrismaService,
  ) {}

  /* ── Static routes FIRST (before :id) ── */

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  findAll(@Query('serviceType') serviceType?: string, @Query('activeOnly') activeOnly?: string) {
    return this.quoteTemplatesService.findAll({
      serviceType: serviceType || undefined,
      activeOnly: activeOnly === 'true' || activeOnly === '1',
    });
  }

  /**
   * GET /quote-templates/docx-files
   * רשימת קבצי DOCX זמינים בתיקיית התבניות
   */
  @Get('docx-files')
  @Roles('ADMIN', 'MANAGER')
  listDocxFiles() {
    return this.docxMergeService.listTemplates();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  עורך התבניות — עריכת קובץ ה-DOCX שממנו נוצרות ההצעות
   *
   *  המסלול הראשי: **עריכת קובץ ה-Word עצמו** (onedrive-edit → onedrive-sync).
   *  הקובץ עולה ל-OneDrive של העורך ונפתח ב-Word האמיתי; אחרי שמירה מושכים
   *  אותו חזרה. כך עורכים מסמך קיים במקום — בלי להרכיב אותו מחדש.
   *
   *  מסלולי גיבוי לאותה "גרסה פעילה": הורדה/העלאה ידנית (למי שאין לו OneDrive
   *  מחובר) ועריכת משפטים (text). ביטול עריכה (revert) מחזיר את הקובץ המקורי.
   *
   *  חייב להיות מוצהר לפני `@Get(':id')`, אחרת Nest יתפוס "docx-editor" כמזהה.
   * ══════════════════════════════════════════════════════════════════════════ */

  /** רשימת התבניות הניתנות לעריכה (אלה שיש להן קובץ DOCX). */
  @Get('docx-editor')
  @Roles('ADMIN', 'MANAGER')
  async listEditableTemplates(@Query('q') q?: string) {
    const all = await this.quoteTemplatesService.findAll({});
    const term = (q || '').trim().toLowerCase();
    const withDocx = all.filter((t: any) => !!t.docxTemplatePath);
    const filtered = term
      ? withDocx.filter((t: any) =>
          `${t.name} ${t.serviceType} ${t.docxTemplatePath}`.toLowerCase().includes(term),
        )
      : withDocx;

    const info = await this.docxStore.overrideInfoFor(filtered.map((t: any) => t.id));
    return filtered.map((t: any) => {
      const edited = info.get(t.id);
      return {
        id: t.id,
        name: t.name,
        serviceType: t.serviceType,
        isActive: t.isActive,
        fileName: t.docxTemplatePath,
        edited: !!edited,
        editedAt: edited?.updatedAt ?? null,
        editedByName: edited?.updatedByName ?? null,
        // קיים קובץ פעיל ב-OneDrive → אפשר להציע "משוך שינויים מ-Word".
        onedriveWebUrl: edited?.onedriveWebUrl ?? null,
      };
    });
  }

  /** תבנית + הבדיקה שהקובץ שלה קיים בפועל. */
  private async requireTemplateWithDocx(id: string) {
    const template = await this.quoteTemplatesService.findOne(id);
    if (!template) throw new NotFoundException('התבנית לא נמצאה');
    if (!template.docxTemplatePath) throw new BadRequestException('לתבנית זו אין קובץ DOCX');
    return template;
  }

  /** הפסקאות הניתנות לעריכה בתבנית (מהגרסה הפעילה). */
  @Get('docx-editor/:id/text')
  @Roles('ADMIN', 'MANAGER')
  async getTemplateText(@Param('id') id: string) {
    const template = await this.requireTemplateWithDocx(id);
    const { bytes, source } = await this.docxStore.getBytes(id, template.docxTemplatePath);
    return {
      id: template.id,
      name: template.name,
      fileName: template.docxTemplatePath,
      edited: source === 'edited',
      paragraphs: this.docxTextEdit.extractParagraphs(bytes),
    };
  }

  /**
   * POST /quote-templates/docx-editor/:id/text  { paragraphs: [{ id, text }] }
   * מחיל עריכת משפטים על הגרסה הפעילה ושומר אותה כגרסה הערוכה.
   */
  @Post('docx-editor/:id/text')
  @Roles('ADMIN', 'MANAGER')
  async saveTemplateText(
    @Param('id') id: string,
    @Body() body: { paragraphs?: Array<{ id: number; text: string }> },
    @Req() req: any,
  ) {
    const edits = (body?.paragraphs || []).filter(
      (p) => p && Number.isInteger(Number(p.id)) && typeof p.text === 'string',
    );
    if (edits.length === 0) throw new BadRequestException('לא נשלחו פסקאות לעדכון');

    const template = await this.requireTemplateWithDocx(id);
    const { bytes } = await this.docxStore.getBytes(id, template.docxTemplatePath);
    const { buffer, changed } = this.docxTextEdit.applyParagraphEdits(
      bytes,
      edits.map((p) => ({ id: Number(p.id), text: String(p.text) })),
    );
    if (changed === 0) throw new BadRequestException('אף פסקה לא השתנתה');

    const user = await this.prisma.user
      .findUnique({ where: { id: req.user?.id }, select: { name: true } })
      .catch(() => null);
    await this.docxStore.saveOverride(id, buffer, { id: req.user?.id, name: user?.name ?? null });
    return { success: true, changed };
  }

  /** הורדת הגרסה הפעילה — לעריכה ב-Word ואז העלאה חזרה. */
  @Get('docx-editor/:id/download')
  @Roles('ADMIN', 'MANAGER')
  async downloadTemplate(@Param('id') id: string, @Res() res: Response) {
    const template = await this.requireTemplateWithDocx(id);
    const { bytes } = await this.docxStore.getBytes(id, template.docxTemplatePath);
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(template.docxTemplatePath!)}"`,
    );
    res.send(bytes);
  }

  /** העלאת קובץ Word ערוך — מחליף את הגרסה הפעילה של התבנית. */
  @Post('docx-editor/:id/upload')
  @Roles('ADMIN', 'MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplateDocx(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; size?: number } | undefined,
    @Req() req: any,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('לא צורף קובץ');
    await this.requireTemplateWithDocx(id);

    // הקובץ חייב להיות תקין *ופריק* — אחרת כל הצעה עתידית מהתבנית הזו תישבר.
    this.docxTextEdit.extractParagraphs(file.buffer);

    const user = await this.prisma.user
      .findUnique({ where: { id: req.user?.id }, select: { name: true } })
      .catch(() => null);
    await this.docxStore.saveOverride(id, file.buffer, { id: req.user?.id, name: user?.name ?? null });
    return { success: true, sizeBytes: file.buffer.length };
  }

  /** ביטול העריכה — חזרה לקובץ המקורי שבתיקיית התבניות. */
  @Post('docx-editor/:id/revert')
  @Roles('ADMIN', 'MANAGER')
  async revertTemplateDocx(@Param('id') id: string) {
    const reverted = await this.docxStore.revert(id);
    return { success: true, reverted };
  }

  /**
   * POST /quote-templates/docx-editor/:id/onedrive-edit
   * פותח את **קובץ התבנית עצמו** לעריכה ב-Word: מעלה אותו ל-OneDrive של העורך
   * ומחזיר כתובות פתיחה. Word שומר חזרה ל-OneDrive, ומשם מסנכרנים ל-CRM.
   *
   * העלאה מחדש רק כשאין קובץ פעיל — אחרת היינו דורסים עריכות שכבר נעשו.
   */
  @Post('docx-editor/:id/onedrive-edit')
  @Roles('ADMIN', 'MANAGER')
  async openTemplateInWord(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('משתמש לא מזוהה — יש להתחבר מחדש');
    const template = await this.requireTemplateWithDocx(id);

    const existing = await this.docxStore.getOnedriveRef(id);
    if (existing && existing.ownerId === userId) {
      try {
        const item = await this.graphFiles.getItem(userId, existing.itemId);
        if (item) {
          return { webUrl: item.webUrl, webDavUrl: item.webDavUrl, itemId: item.itemId, reused: true };
        }
      } catch {
        /* הקובץ נמחק/לא נגיש — נעלה מחדש */
      }
    }

    const { bytes } = await this.docxStore.getBytes(id, template.docxTemplatePath);
    // שם ייחודי-לתבנית, כדי שתבניות שונות לא ידרסו זו את זו בתיקייה של המשתמש.
    const base = String(template.docxTemplatePath).replace(/\.docx$/i, '');
    const fileName = `תבנית - ${base} ${id.slice(0, 6)}`;

    let uploaded: { itemId: string; webUrl: string; webDavUrl: string; name: string };
    try {
      uploaded = await this.graphFiles.uploadEditable(userId, fileName, bytes);
    } catch (e: any) {
      // רמז ההתחברות רלוונטי רק לכשל הרשאה — ראו uploadEditable.
      const raw = String(e?.message || '');
      const isLock = /נעול|resourceLocked|\b423\b/.test(raw);
      const isAuth = /\b40[13]\b|invalid_grant|token|unauthor/i.test(raw);
      const hint = isLock ? '' : isAuth ? ' — ייתכן שצריך לחבר מחדש את Outlook (הרשאת קבצים)' : '';
      throw new BadRequestException(
        `העלאת התבנית ל-OneDrive נכשלה: ${raw || 'שגיאה לא ידועה'}${hint}`,
      );
    }

    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { name: true } })
      .catch(() => null);
    await this.docxStore.setOnedriveRef(id, bytes, { ...uploaded, ownerId: userId }, { id: userId, name: user?.name ?? null });

    return { webUrl: uploaded.webUrl, webDavUrl: uploaded.webDavUrl, itemId: uploaded.itemId, reused: false };
  }

  /**
   * POST /quote-templates/docx-editor/:id/onedrive-sync
   * מושך את הגרסה שנשמרה ב-Word חזרה לתבנית. נקרא כשחוזרים מ-Word ל-CRM.
   */
  @Post('docx-editor/:id/onedrive-sync')
  @Roles('ADMIN', 'MANAGER')
  async syncTemplateFromWord(@Param('id') id: string, @Req() req: any) {
    const ref = await this.docxStore.getOnedriveRef(id);
    if (!ref) return { synced: false, reason: 'no-file' };

    let bytes: Buffer;
    try {
      bytes = await this.graphFiles.downloadContent(ref.ownerId, ref.itemId);
    } catch {
      return { synced: false, reason: 'download-failed' };
    }
    if (!bytes?.length) return { synced: false, reason: 'empty' };

    // הקובץ חייב להיות פריק לפני שהוא הופך לתבנית הפעילה — קובץ פגום
    // היה שובר כל הצעה שתיווצר ממנו.
    this.docxTextEdit.extractParagraphs(bytes);

    const user = await this.prisma.user
      .findUnique({ where: { id: req.user?.id }, select: { name: true } })
      .catch(() => null);
    await this.docxStore.saveSyncedFromOnedrive(id, bytes, { id: req.user?.id, name: user?.name ?? null });
    return { synced: true, sizeBytes: bytes.length };
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: any) {
    return this.quoteTemplatesService.create(body);
  }

  /* ── Parameterized routes ── */

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  findOne(@Param('id') id: string) {
    return this.quoteTemplatesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() body: any) {
    return this.quoteTemplatesService.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  remove(@Param('id') id: string) {
    return this.quoteTemplatesService.remove(id);
  }

  /**
   * GET /quote-templates/:id/docx-info
   * מידע על תבנית ה-DOCX: נתיב, placeholders, וגודל קובץ
   */
  @Get(':id/docx-info')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  async docxInfo(@Param('id') id: string) {
    const template = await this.quoteTemplatesService.findOne(id);
    if (!template) {
      throw new BadRequestException('Template not found');
    }

    if (!template.docxTemplatePath) {
      return {
        hasDocx: false,
        docxTemplatePath: null,
        placeholders: [],
      };
    }

    // הגרסה הפעילה (ערוכה אם קיימת) — ה-placeholders חייבים לשקף את מה שימוזג בפועל.
    const hasFile = await this.docxStore.has(id, template.docxTemplatePath);
    let placeholders: string[] = [];
    if (hasFile) {
      const { bytes } = await this.docxStore.getBytes(id, template.docxTemplatePath);
      placeholders = this.docxMergeService.extractPlaceholdersFromBytes(bytes);
    }

    return {
      hasDocx: hasFile,
      docxTemplatePath: template.docxTemplatePath,
      placeholders,
    };
  }

  /**
   * POST /quote-templates/:id/merge-docx
   * מיזוג תבנית DOCX עם נתוני הצעת מחיר — מחזיר קובץ Word אמיתי (.docx)
   */
  @Post(':id/merge-docx')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  async mergeDocx(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const template = await this.quoteTemplatesService.findOne(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    if (!template.docxTemplatePath) {
      return res.status(400).json({ message: 'Template has no DOCX file' });
    }
    if (!(await this.docxStore.has(id, template.docxTemplatePath))) {
      return res.status(404).json({ message: `DOCX template file missing: ${template.docxTemplatePath}` });
    }

    // ── מספר הצעת המחיר תמיד מהמקור-אמת ב-DB ──
    // המסמך מרנדר את המספר מ-{contractSurveyNumber} (fallback ל-{quoteNumber}). כשהמיזוג
    // מתבצע בעוד ההצעה טיוטה, ה-frontend שולח ערך ריק/"חדש" — והמסמך יוצא בלי מספר.
    // אם קיים quoteId, שולפים את המספר האמיתי מה-DB וממלאים בו את שני השדות. כך המספר
    // מופיע תמיד, בכל התבניות, בלי תלות בעיתוי המיזוג.
    const isEmptyNum = (v: unknown) => {
      const s = String(v ?? '').trim();
      return !s || s === 'חדש' || s === '—' || s === '-';
    };
    const quoteIdForNum = body.quoteId as string | undefined;
    if (quoteIdForNum && (isEmptyNum(body.contractSurveyNumber) || isEmptyNum(body.quoteNumber))) {
      try {
        const q: any = await (this.prisma.quote.findUnique as any)({
          where: { id: quoteIdForNum },
          select: { quoteNumber: true, orderReferenceNumber: true },
        });
        const realNum = String(q?.quoteNumber ?? '').trim() || String(q?.orderReferenceNumber ?? '').trim();
        if (realNum) {
          if (isEmptyNum(body.contractSurveyNumber)) body.contractSurveyNumber = realNum;
          if (isEmptyNum(body.quoteNumber)) body.quoteNumber = realNum;
        }
      } catch {
        /* best-effort — אם השליפה נכשלה, ממשיכים עם מה שנשלח */
      }
    }

    // ממזגים מהגרסה **הפעילה** של התבנית — כך עריכות שהמנהל ביצע בעורך התבניות
    // משפיעות על ההצעות שנוצרות מכאן והלאה.
    const { bytes: templateBytes } = await this.docxStore.getBytes(id, template.docxTemplatePath);
    const buffer = this.docxMergeService.mergeTemplateBytes(templateBytes, body);

    // ── Save merged file and link to Quote if quoteId provided ──
    const quoteId = body.quoteId as string | undefined;
    if (quoteId) {
      try {
        const mergedDir = path.resolve(process.cwd(), 'storage', 'merged-quotes');
        if (!fs.existsSync(mergedDir)) fs.mkdirSync(mergedDir, { recursive: true });
        const safeNum = String(body.quoteNumber || 'draft').replace(/[^a-zA-Z0-9\u0590-\u05FF_-]/g, '-');
        const ts = Date.now();
        const savedName = `quote-${safeNum}-${ts}.docx`;
        const fullPath = path.join(mergedDir, savedName);
        fs.writeFileSync(fullPath, buffer);
        const relPath = `storage/merged-quotes/${savedName}`;

        // Update lastMergedDocPath for backward compatibility
        await (this.prisma.quote.update as any)({
          where: { id: quoteId },
          data: { lastMergedDocPath: relPath },
        });

        // Create QuoteDocument record for document history.
        // Store the bytes in the DB so the file survives Railway deploys (ephemeral disk).
        await (this.prisma.quoteDocument.create as any)({
          data: {
            quoteId,
            fileName: savedName,
            filePath: relPath,
            data: Uint8Array.from(buffer),
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            documentType: 'MERGED_DOCX',
            documentDescription: `מיזוג הצעה ${body.quoteNumber || 'טיוטה'}`,
          },
        });
      } catch (e) {
        console.error('Failed to save merged doc to quote:', e);
        // Don't fail the merge — still return the file
      }
    }

    const filename = `quote-${body.quoteNumber || 'draft'}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  /**
   * POST /quote-templates/:id/upload-docx
   * העלאת קובץ Word כתבנית מיזוג — שומר את הקובץ ומעדכן את הרשומה ב-DB
   */
  @Post(':id/upload-docx')
  @Roles('ADMIN', 'MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocx(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.originalname.endsWith('.docx')) {
      throw new BadRequestException('Only .docx files are supported');
    }

    const template = await this.quoteTemplatesService.findOne(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Save the uploaded file
    const savedPath = this.docxMergeService.saveUploadedTemplate(
      file.originalname,
      file.buffer,
    );

    // Update the template record in DB
    await this.quoteTemplatesService.update(id, { docxTemplatePath: savedPath });

    // Extract placeholders for reference
    const placeholders = this.docxMergeService.extractPlaceholders(savedPath);

    return res.json({
      docxTemplatePath: savedPath,
      placeholders,
      fileSize: file.size,
    });
  }
}