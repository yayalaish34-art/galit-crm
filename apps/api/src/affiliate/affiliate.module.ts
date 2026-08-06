import { Module } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateAdminController } from './affiliate-admin.controller';

/**
 * מודול פורטל השותפים. PrismaModule גלובלי (@Global) ו-JwtModule גלובלי (מ-AuthModule)
 * — אין צורך לייבא אותם במפורש. מייצא את השירות כדי ש-TasksService יוכל להזריק אותו
 * לצורך חישוב עמלה אוטומטי כשמסמנים "שולם".
 */
@Module({
  controllers: [AffiliateController, AffiliateAdminController],
  providers: [AffiliateService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
