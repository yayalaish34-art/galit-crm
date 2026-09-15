import { Module } from '@nestjs/common';
import { CallRecordingsController } from './call-recordings.controller';
import { CallRecordingsService } from './call-recordings.service';
import { CloudPlusClient } from './cloudplus.client';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CallRecordingsController],
  providers: [CallRecordingsService, CloudPlusClient],
  exports: [CallRecordingsService],
})
export class CallRecordingsModule {}
