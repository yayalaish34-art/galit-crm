import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * ערים. קריאה + הוספה זמינות לכל העובדים — בדיוק כמו מקורות הגעה,
 * כי ההוספה נעשית תוך כדי פתיחת פנייה (כפתור "הוסף עיר" בשדה העיר).
 */
@Controller('cities')
@UseGuards(RolesGuard)
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  findAll() {
    return this.cities.findAll();
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  create(@Body() body: { name?: string }) {
    return this.cities.create(body?.name ?? '');
  }
}
