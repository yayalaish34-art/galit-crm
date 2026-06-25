import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackAutomationService } from './feedback-automation.service';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [DashboardController, FeedbackController],
  providers: [DashboardService, FeedbackService, FeedbackAutomationService, SmsService],
})
export class DashboardModule {}

