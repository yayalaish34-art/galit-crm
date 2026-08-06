import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReviewRequestService } from './review-request.service';

/**
 * Dispatcher לתור בקשות הדירוג המתוזמנות. בקשת דירוג אחרי דוח מתוזמנת ל-09:00
 * למחרת (ReviewRequestService.enqueueReviewRequest); שירות זה סורק את התור כל 5
 * דקות ושולח את מה שהגיע מועדו. עבודה כושלת חוזרת לתור עם ניסיון חוזר.
 */
@Injectable()
export class ReviewSchedulerService {
  private readonly logger = new Logger(ReviewSchedulerService.name);

  constructor(private readonly reviews: ReviewRequestService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    try {
      await this.reviews.processScheduledReviews();
    } catch (e: any) {
      this.logger.error(`scheduled reviews dispatch failed: ${e?.message || e}`);
    }
  }
}
