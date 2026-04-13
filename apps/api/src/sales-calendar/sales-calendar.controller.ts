import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateSalesCalendarEntryDto,
  SalesCalendarFilterDto,
  UpdateSalesCalendarEntryDto,
} from './dto/sales-calendar.dto';
import { SalesCalendarService } from './sales-calendar.service';

@Controller('sales-calendar')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN')
export class SalesCalendarController {
  constructor(private readonly salesCalendarService: SalesCalendarService) {}

  @Get()
  findAll(@Query() query: SalesCalendarFilterDto) {
    return this.salesCalendarService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesCalendarService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateSalesCalendarEntryDto) {
    return this.salesCalendarService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateSalesCalendarEntryDto) {
    return this.salesCalendarService.update(id, body);
  }
}
