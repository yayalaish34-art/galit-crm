import { Module } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { BlogAutoDraftService } from './blog-auto-draft.service';

/**
 * מודול בלוגים — כתיבה ופרסום לאתר וורדפרס.
 * PrismaModule גלובלי; JwtModule/RolesGuard זמינים כרגיל.
 * BlogAutoDraftService מריץ את הניסוח היומי (ScheduleModule מאותחל ב-AppModule).
 */
@Module({
  controllers: [BlogController],
  providers: [BlogService, BlogAutoDraftService],
  exports: [BlogService],
})
export class BlogModule {}
