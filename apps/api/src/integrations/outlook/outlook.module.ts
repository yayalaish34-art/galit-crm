import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiMailModule } from '../../ai-mail/ai-mail.module';
import { OutlookController } from './outlook.controller';
import { OutlookImportService } from './outlook-import.service';
import { OutlookAuthService } from './outlook-auth.service';

@Module({
  imports: [PrismaModule, AiMailModule],
  controllers: [OutlookController],
  providers: [OutlookImportService, OutlookAuthService],
})
export class OutlookModule {}
