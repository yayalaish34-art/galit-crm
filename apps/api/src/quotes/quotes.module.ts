import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { QuotesController } from './quotes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuoteMailService],
})
export class QuotesModule {}

