import { Module } from '@nestjs/common';
import { ExecutionCalendarController } from './execution-calendar.controller';
import { ExecutionCalendarService } from './execution-calendar.service';

@Module({
  controllers: [ExecutionCalendarController],
  providers: [ExecutionCalendarService],
})
export class ExecutionCalendarModule {}
