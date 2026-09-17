import { Module } from '@nestjs/common';
import { RadonController, RadonInternalController } from './radon.controller';
import { RadonJobsService } from './radon-jobs.service';
import { RadonDetectorsService } from './radon-detectors.service';
import { RadonAlertsService } from './radon-alerts.service';
import { CustomerReminderService } from './customer-reminder.service';
import { RadonKitService } from './radon-kit.service';
import { RadonKitAutoSendService } from './radon-kit-autosend.service';

/**
 * מודול שירות ראדון — עצמאי לחלוטין.
 *
 * לא נוגע בצינור המשימות הקיים: העבודה מקושרת למשימה דרך taskId רופף בלבד,
 * וכל הנתיבים תחת /radon. PrismaService זמין גלובלית (PrismaModule הוא @Global).
 */
@Module({
  controllers: [RadonController, RadonInternalController],
  providers: [
    RadonJobsService,
    RadonDetectorsService,
    RadonAlertsService,
    CustomerReminderService,
    RadonKitService,
    RadonKitAutoSendService,
  ],
  exports: [RadonJobsService, RadonDetectorsService, CustomerReminderService, RadonKitService],
})
export class RadonModule {}
