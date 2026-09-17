import { Module } from '@nestjs/common';
import { QuoteTemplatesService } from './quote-templates.service';
import { QuoteTemplatesController } from './quote-templates.controller';
import { DocxMergeService } from './docx-merge.service';
import { TemplateDocxStore } from './template-docx-store.service';
import { DocxTextEditService } from '../quotes/docx-text-edit.service';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  // MicrosoftModule מספק את GraphFilesService — העלאת קובץ התבנית ל-OneDrive
  // לעריכה ב-Word ומשיכת הגרסה הערוכה בחזרה.
  imports: [MicrosoftModule],
  controllers: [QuoteTemplatesController],
  // DocxTextEditService חסר-מצב (עובד על Buffer בלבד), ולכן מסופק כאן ישירות
  // ולא דרך ייבוא QuotesModule — כדי לא ליצור תלות מעגלית בין המודולים.
  providers: [QuoteTemplatesService, DocxMergeService, TemplateDocxStore, DocxTextEditService],
  exports: [QuoteTemplatesService, DocxMergeService, TemplateDocxStore],
})
export class QuoteTemplatesModule {}
