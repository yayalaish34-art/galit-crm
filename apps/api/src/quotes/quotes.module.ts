import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuoteMailService } from './quote-mail.service';
import { PdfConvertService } from './pdf-convert.service';
import { QuoteSignatureService } from './quote-signature.service';
import { ReportMailService } from './report-mail.service';
import { CompanyProfileService } from './company-profile.service';
import { QuotesController } from './quotes.controller';
import { QuoteSignatureController } from './quote-signature.controller';
import { ReportMailController } from './report-mail.controller';
import { CompanyProfileController } from './company-profile.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [PrismaModule, MicrosoftModule, ReviewsModule],
  controllers: [QuotesController, QuoteSignatureController, ReportMailController, CompanyProfileController],
  providers: [QuotesService, QuoteMailService, PdfConvertService, QuoteSignatureService, ReportMailService, CompanyProfileService],
  exports: [QuotesService],
})
export class QuotesModule {}

