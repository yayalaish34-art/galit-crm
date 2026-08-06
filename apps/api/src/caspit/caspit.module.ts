import { Module } from '@nestjs/common';
import { CaspitService } from './caspit.service';
import { CaspitController } from './caspit.controller';

/**
 * מודול כספית (Caspit) — הנפקת חשבוniות + הגדרות גישה.
 * PrismaModule גלובלי; JwtModule/RolesGuard זמינים כרגיל.
 */
@Module({
  controllers: [CaspitController],
  providers: [CaspitService],
  exports: [CaspitService],
})
export class CaspitModule {}
