import { Module } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';

/**
 * מודול בלוגים — כתיבה ופרסום לאתר וורדפרס.
 * PrismaModule גלובלי; JwtModule/RolesGuard זמינים כרגיל.
 */
@Module({
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
