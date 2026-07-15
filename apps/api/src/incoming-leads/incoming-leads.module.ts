import { Module } from '@nestjs/common';
import { IncomingLeadsService } from './incoming-leads.service';
import { IncomingLeadsController } from './incoming-leads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { AiMailModule } from '../ai-mail/ai-mail.module';

@Module({
  imports: [PrismaModule, MicrosoftModule, AiMailModule],
  controllers: [IncomingLeadsController],
  providers: [IncomingLeadsService],
})
export class IncomingLeadsModule {}
