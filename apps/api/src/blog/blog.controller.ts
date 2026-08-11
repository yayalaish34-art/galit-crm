import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BlogService, type BlogPostInput } from './blog.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * בלוגים — כתיבה ופרסום לאתר galit.co.il מתוך ה-CRM.
 * מנהלים בלבד: התוכן עולה לאתר הציבורי.
 */
@Controller('blog')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  // ── הגדרות חיבור ──────────────────────────────────────────────────────────

  @Get('settings')
  settings() {
    return this.blog.getStatus();
  }

  @Post('settings')
  saveSettings(
    @Body() body: { siteUrl?: string; username?: string; appPassword?: string; categoryId?: number },
  ) {
    return this.blog.saveCredentials({
      siteUrl: body?.siteUrl,
      username: body?.username || '',
      appPassword: body?.appPassword,
      categoryId: body?.categoryId,
    });
  }

  @Post('test')
  test() {
    return this.blog.testConnection();
  }

  // ── פוסטים ────────────────────────────────────────────────────────────────

  @Get('posts')
  list(@Query('status') status?: string, @Query('search') search?: string) {
    return this.blog.listPosts({ status, search });
  }

  @Get('posts/:id')
  getOne(@Param('id') id: string) {
    return this.blog.getPost(Number(id));
  }

  @Post('posts')
  create(@Body() body: BlogPostInput) {
    return this.blog.createPost(body || {});
  }

  /** עדכון. POST ולא PATCH — וורדפרס עצמו מקבל POST לעדכון, וכך גם אחיד מול הלקוח. */
  @Post('posts/:id')
  update(@Param('id') id: string, @Body() body: BlogPostInput) {
    return this.blog.updatePost(Number(id), body || {});
  }

  @Delete('posts/:id')
  remove(@Param('id') id: string) {
    return this.blog.deletePost(Number(id));
  }

  // ── מדיה + AI ─────────────────────────────────────────────────────────────

  @Post('media')
  upload(@Body() body: { dataUrl?: string; filename?: string }) {
    return this.blog.uploadMedia(body?.dataUrl || '', body?.filename || 'blog-image');
  }

  @Post('ai-draft')
  aiDraft(
    @Body()
    body: {
      topic?: string;
      audience?: string;
      tone?: string;
      length?: 'short' | 'medium' | 'long';
      notes?: string;
    },
  ) {
    return this.blog.aiDraft({
      topic: body?.topic || '',
      audience: body?.audience,
      tone: body?.tone,
      length: body?.length,
      notes: body?.notes,
    });
  }
}
