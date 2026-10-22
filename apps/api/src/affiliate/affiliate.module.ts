import { Module } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { AffiliateNotifierService } from './affiliate-notifier.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateAdminController } from './affiliate-admin.controller';

/**
 * מודול פורטל השותפים. PrismaModule גלובלי (@Global) ו-JwtModule גלובלי (מ-AuthModule)
 * — אין צורך לייבא אותם במפורש. מייצא את השירותים כדי ש-TasksService יוכל להזריק את
 * AffiliateService לחישוב עמלה אוטומטי, ו-CustomersService את AffiliateNotifierService
 * כדי להודיע לשותף על דחיית ליד.
 */
@Module({
  controllers: [AffiliateController, AffiliateAdminController],
  providers: [AffiliateService, AffiliateNotifierService],
  exports: [AffiliateService, AffiliateNotifierService],
})
export class AffiliateModule {}
