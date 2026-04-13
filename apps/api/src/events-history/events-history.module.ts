import { Module } from '@nestjs/common';
import { EventsHistoryController } from './events-history.controller';
import { EventsHistoryService } from './events-history.service';

@Module({
  controllers: [EventsHistoryController],
  providers: [EventsHistoryService],
})
export class EventsHistoryModule {}
