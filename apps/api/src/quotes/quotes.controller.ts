import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
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
  ) {}

  @Get()
  findAll(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.quotesService.findAll({ projectId, opportunityId, customerId, leadId, user: req.user });
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
    const quote: any = await this.quotesService.findOne(id);
    if (!quote || !quote.lastMergedDocPath) {
      res.status(404).send('Merged document not found');
      return;
    }
    const absolute = path.join(process.cwd(), quote.lastMergedDocPath);
    if (!fs.existsSync(absolute)) {
      res.status(404).send('Merged document file missing on disk');
      return;
    }
    const filename = path.basename(quote.lastMergedDocPath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.sendFile(absolute);
  }

  /**
   * POST /quotes/:id/send-email
   * שליחת המסמך האחרון של ההצעה כקובץ מצורף במייל
   */
  @Post(':id/send-email')
  sendEmail(@Param('id') id: string, @Body() body: { email: string }) {
    return this.quoteMailService.sendQuoteEmail(id, body.email);
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

