import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('quotes')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

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

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.quotesService.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.quotesService.remove(id, req.user);
  }
}

