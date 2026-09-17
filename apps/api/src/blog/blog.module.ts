import { Module } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { BlogAutoDraftService } from './blog-auto-draft.service';
import { BlogResearchService } from './blog-research.service';
import { BlogImageService } from './blog-image.service';

/**
 * מודול בלוגים — כתיבה ופרסום לאתר וורדפרס.
 * PrismaModule גלובלי; JwtModule/RolesGuard זמינים כרגיל.
 * BlogAutoDraftService מריץ את הניסוח היומי (ScheduleModule מאותחל ב-AppModule).
 * BlogResearchService אוסף מקורות אמיתיים מהרשת לפני כל ניסוח.
 * BlogImageService מייצר את התמונה הראשית (מודל תמונה זול) לטיוטה ולעורך.
 */
@Module({
  controllers: [BlogController],
  providers: [BlogService, BlogAutoDraftService, BlogResearchService, BlogImageService],
  exports: [BlogService],
})
export class BlogModule {}
