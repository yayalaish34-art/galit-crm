import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { QuoteSignatureService } from './quote-signature.service';
import { ReportMailService } from './report-mail.service';
import { QuotesController } from './quotes.controller';
import { QuoteSignatureController } from './quote-signature.controller';
import { ReportMailController } from './report-mail.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [QuotesController, QuoteSignatureController, ReportMailController],
  providers: [QuotesService, QuoteMailService, PdfConvertService, QuoteSignatureService, ReportMailService],
})
export class QuotesModule {}

