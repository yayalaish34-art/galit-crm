import { Module } from '@nestjs/common';
import { QuoteTemplatesService } from './quote-templates.service';
import { QuoteTemplatesController } from './quote-templates.controller';
import { DocxMergeService } from './docx-merge.service';

@Module({
  controllers: [QuoteTemplatesController],
  providers: [QuoteTemplatesService, DocxMergeService],
  exports: [QuoteTemplatesService, DocxMergeService],
})
export class QuoteTemplatesModule {}
