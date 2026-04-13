import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateInquiryDto, InquiryFilterDto, InquiryJournalFilterDto, UpdateInquiryDto } from './dto/inquiry.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  findAll(@Query() query: InquiryFilterDto) {
    return this.inquiriesService.findAll(query);
  }

  @Get('journal')
  findJournal(@Query() query: InquiryJournalFilterDto) {
    return this.inquiriesService.findJournal(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inquiriesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateInquiryDto) {
    return this.inquiriesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateInquiryDto) {
    return this.inquiriesService.update(id, body);
  }
}
