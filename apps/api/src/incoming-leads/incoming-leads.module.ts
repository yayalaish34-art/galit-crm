import { Module } from '@nestjs/common';
import { IncomingLeadsService } from './incoming-leads.service';
import { IncomingLeadsController } from './incoming-leads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [IncomingLeadsController],
  providers: [IncomingLeadsService],
})
export class IncomingLeadsModule {}
