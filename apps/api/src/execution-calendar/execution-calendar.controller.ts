import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateExecutionCalendarEntryDto,
  ExecutionCalendarFilterDto,
  UpdateExecutionCalendarEntryDto,
} from './dto/execution-calendar.dto';
import { ExecutionCalendarService } from './execution-calendar.service';

@Controller('execution-calendar')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN')
export class ExecutionCalendarController {
  constructor(private readonly executionCalendarService: ExecutionCalendarService) {}

  @Get()
  findAll(@Query() query: ExecutionCalendarFilterDto) {
    return this.executionCalendarService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.executionCalendarService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateExecutionCalendarEntryDto) {
    return this.executionCalendarService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateExecutionCalendarEntryDto) {
    return this.executionCalendarService.update(id, body);
  }
}
