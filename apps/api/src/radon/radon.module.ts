import { Module } from '@nestjs/common';
import { RadonController } from './radon.controller';
import { RadonJobsService } from './radon-jobs.service';
import { RadonDetectorsService } from './radon-detectors.service';
import { RadonAlertsService } from './radon-alerts.service';
import { CustomerReminderService } from './customer-reminder.service';

/**
 * מודול שירות ראדון — עצמאי לחלוטין.
 *
 * לא נוגע בצינור המשימות הקיים: העבודה מקושרת למשימה דרך taskId רופף בלבד,
 * וכל הנתיבים תחת /radon. PrismaService זמין גלובלית (PrismaModule הוא @Global).
 */
@Module({
  controllers: [RadonController],
  providers: [RadonJobsService, RadonDetectorsService, RadonAlertsService, CustomerReminderService],
  exports: [RadonJobsService, RadonDetectorsService, CustomerReminderService],
})
export class RadonModule {}
