import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftController } from './microsoft.controller';
import { OutlookCalendarController, OutlookMailController } from './outlook-calendar.controller';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { GraphMailService } from './graph-mail.service';
import { GraphCalendarService } from './graph-calendar.service';
import { GraphPdfService } from './graph-pdf.service';
import { GraphFilesService } from './graph-files.service';

@Module({
  imports: [PrismaModule],
  controllers: [MicrosoftController, OutlookCalendarController, OutlookMailController],
  providers: [MicrosoftAuthService, GraphMailService, GraphCalendarService, GraphPdfService, GraphFilesService],
  exports: [MicrosoftAuthService, GraphMailService, GraphCalendarService, GraphPdfService, GraphFilesService],
})
export class MicrosoftModule {}
