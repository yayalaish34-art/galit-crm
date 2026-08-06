import { Module } from '@nestjs/common';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { ReviewRequestService } from './review-request.service';
import { ReviewSchedulerService } from './review-scheduler.service';
import { ReviewsController } from './reviews.controller';

/**
 * שירות בקשות דירוג (5 פרצופים) שנשלחות ללקוח אוטומטית אחרי שליחת דוח.
 * PrismaService גלובלי (PrismaModule הוא @Global). מייבא Microsoft לשליחה דרך Outlook.
 * ה-endpoints הציבוריים (קליטת לחיצה + דפי תודה/משוב) יושבים ב-PublicController.
 */
@Module({
  imports: [MicrosoftModule],
  controllers: [ReviewsController],
  providers: [ReviewRequestService, ReviewSchedulerService],
  exports: [ReviewRequestService],
})
export class ReviewsModule {}
