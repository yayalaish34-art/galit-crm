import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateEventHistoryDto,
  EventsHistoryFilterDto,
  UpdateEventHistoryDto,
} from './dto/events-history.dto';
import { EventsHistoryService } from './events-history.service';

@Controller('events-history')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN')
export class EventsHistoryController {
  constructor(private readonly eventsHistoryService: EventsHistoryService) {}

  @Get()
  findAll(@Query() query: EventsHistoryFilterDto) {
    return this.eventsHistoryService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsHistoryService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateEventHistoryDto) {
    return this.eventsHistoryService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateEventHistoryDto) {
    return this.eventsHistoryService.update(id, body);
  }
}
