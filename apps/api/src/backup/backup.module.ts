import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { CustomerBackupScheduler } from './customer-backup.scheduler';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [BackupController],
  providers: [BackupService, CustomerBackupScheduler],
  exports: [BackupService],
})
export class BackupModule {}
