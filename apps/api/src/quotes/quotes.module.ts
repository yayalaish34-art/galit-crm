import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { QuotesController } from './quotes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuoteMailService, PdfConvertService],
})
export class QuotesModule {}

