import { Module } from '@nestjs/common';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { ReviewRequestService } from './review-request.service';

/**
 * שירות בקשות דירוג (5 פרצופים) שנשלחות ללקוח אוטומטית אחרי שליחת דוח.
 * PrismaService גלובלי (PrismaModule הוא @Global). מייבא Microsoft לשליחה דרך Outlook.
 * ה-endpoints הציבוריים (קליטת לחיצה + דפי תודה/משוב) יושבים ב-PublicController.
 */
@Module({
  imports: [MicrosoftModule],
  providers: [ReviewRequestService],
  exports: [ReviewRequestService],
})
export class ReviewsModule {}
