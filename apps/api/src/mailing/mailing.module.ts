import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailingListService } from './mailing-list.service';
import { MailingController } from './mailing.controller';

/**
 * רשימת דיוור שיווקי: מי אישר קבלת דיוור בטופס באתר, ומי סומן ידנית להסרה.
 * מוצג כסקשן בדשבורד המנהל; הסימון הידני נעשה מכרטיס הלקוח.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MailingController],
  providers: [MailingListService],
  exports: [MailingListService],
})
export class MailingModule {}
