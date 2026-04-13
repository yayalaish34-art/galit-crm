import { Module } from '@nestjs/common';
import { SalesCalendarController } from './sales-calendar.controller';
import { SalesCalendarService } from './sales-calendar.service';

@Module({
  controllers: [SalesCalendarController],
  providers: [SalesCalendarService],
})
export class SalesCalendarModule {}
