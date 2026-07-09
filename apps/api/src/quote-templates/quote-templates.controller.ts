import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { QuoteTemplatesService } from './quote-templates.service';
import { DocxMergeService } from './docx-merge.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('quote-templates')
@UseGuards(RolesGuard)
export class QuoteTemplatesController {
  constructor(
    private readonly quoteTemplatesService: QuoteTemplatesService,
    private readonly docxMergeService: DocxMergeService,
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

    const hasFile = this.docxMergeService.hasDocxTemplate(template.docxTemplatePath);
    const placeholders = hasFile
      ? this.docxMergeService.extractPlaceholders(template.docxTemplatePath)
      : [];

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
    if (!this.docxMergeService.hasDocxTemplate(template.docxTemplatePath)) {
      return res.status(404).json({ message: `DOCX template file missing: ${template.docxTemplatePath}` });
    }

    const buffer = this.docxMergeService.mergeTemplate(template.docxTemplatePath, body);

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