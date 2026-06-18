import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftController } from './microsoft.controller';
import { OutlookCalendarController } from './outlook-calendar.controller';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { GraphMailService } from './graph-mail.service';
import { GraphCalendarService } from './graph-calendar.service';

@Module({
  imports: [PrismaModule],
  controllers: [MicrosoftController, OutlookCalendarController],
  providers: [MicrosoftAuthService, GraphMailService, GraphCalendarService],
  exports: [MicrosoftAuthService, GraphMailService, GraphCalendarService],
})
export class MicrosoftModule {}
