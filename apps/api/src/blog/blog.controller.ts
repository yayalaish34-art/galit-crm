import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BlogService, type BlogPostInput } from './blog.service';
import { BlogAutoDraftService } from './blog-auto-draft.service';
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
  constructor(
    private readonly blog: BlogService,
    private readonly autoDraft: BlogAutoDraftService,
  ) {}

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

  /** נושאי הבלוג — כל נושא ממופה לעמוד השירות הכללי שבו הפוסט יופיע. */
  @Get('topics')
  topics() {
    return this.blog.listTopics();
  }

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

  /**
   * תמונה ראשית שנוצרת ב-AI מנושא הבלוג, ומועלית ישר לספריית המדיה של וורדפרס.
   * מחזיר { id, url } — בדיוק כמו העלאה ידנית, כדי שהעורך לא יבחין ביניהן.
   */
  @Post('ai-image')
  aiImage(@Body() body: { title?: string; topic?: string }) {
    return this.blog.generateFeaturedImage({ title: body?.title, topic: body?.topic });
  }

  /**
   * כמה חלופות תמונה לבחירת המנהל, **בלי העלאה** — הבחירה נשלחת אחר כך
   * ל-`POST /blog/media` כמו כל העלאה ידנית. מחזיר { options: [...] }.
   */
  @Post('ai-image-options')
  aiImageOptions(@Body() body: { title?: string; topic?: string; count?: number }) {
    return this.blog.generateFeaturedImageOptions({
      title: body?.title,
      topic: body?.topic,
      count: body?.count,
    });
  }

  // ── ניסוח יומי אוטומטי + תור אישורים ──────────────────────────────────────

  /** הטיוטות האוטומטיות שממתינות לאישור — מזין את הפופ-אפ בדשבורד. */
  @Get('pending')
  pending() {
    return this.blog.listPendingApprovals();
  }

  /** סגירת הפופ-אפ בלי לפרסם — הטיוטה נשארת ברשימת הבלוגים. */
  @Post('pending/:id/dismiss')
  dismissPending(@Param('id') id: string) {
    return this.blog.dismissApproval(Number(id));
  }

  /** הרצה ידנית של הניסוח היומי (בדיקה / "תנסח לי אחד עכשיו"). */
  @Post('auto-draft/run')
  runAutoDraft() {
    return this.autoDraft.generate();
  }

  @Post('posts/:id/rewrite')
  rewrite(
    @Param('id') _id: string,
    @Body() body: { title?: string; body?: string; instruction?: string; research?: boolean },
  ) {
    return this.blog.aiRewrite({
      title: body?.title || '',
      body: body?.body || '',
      instruction: body?.instruction,
      research: body?.research,
    });
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
      /** false = ניסוח מהיר בלי חיפוש מקורות ברשת. ברירת מחדל: מחקר מופעל. */
      research?: boolean;
    },
  ) {
    return this.blog.aiDraft({
      topic: body?.topic || '',
      audience: body?.audience,
      tone: body?.tone,
      length: body?.length,
      notes: body?.notes,
      research: body?.research,
    });
  }
}
