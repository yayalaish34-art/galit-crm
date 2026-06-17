import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftController } from './microsoft.controller';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { GraphMailService } from './graph-mail.service';

@Module({
  imports: [PrismaModule],
  controllers: [MicrosoftController],
  providers: [MicrosoftAuthService, GraphMailService],
  exports: [MicrosoftAuthService, GraphMailService],
})
export class MicrosoftModule {}
