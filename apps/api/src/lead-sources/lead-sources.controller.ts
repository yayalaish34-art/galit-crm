import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LeadSourcesService } from './lead-sources.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * מקורות הגעה ("מקור הגעה"). קריאה + הוספה זמינות לכל העובדים,
 * כי ההוספה נעשית תוך כדי פתיחת פנייה (כפתור "+" ליד "אחר").
 */
@Controller('lead-sources')
@UseGuards(RolesGuard)
export class LeadSourcesController {
  constructor(private readonly leadSources: LeadSourcesService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  findAll() {
    return this.leadSources.findAll();
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  create(@Body() body: { name?: string }) {
    return this.leadSources.create(body?.name ?? '');
  }
}
