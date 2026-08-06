import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { ReviewRequestService } from './review-request.service';

/**
 * שליחה ידנית של בקשת משוב (5 פרצופים) ללקוח — כפתור "שליחת משוב ידנית" בכרטיס
 * הלקוח. זמין לכל העובדים; השליחה מתבצעת מתיבת ה-Outlook של המשתמש המחובר, בדיוק
 * כמו השליחה האוטומטית שאחרי דוח (ReviewRequestService.sendReviewRequest).
 */
@Controller('reviews')
@UseGuards(RolesGuard)
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewRequestService,
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
  ) {}

  @Post('send')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  async send(
    @Req() req: any,
    @Body() body: { customerId?: string; toEmail?: string; taskId?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('משתמש לא מזוהה');

    // המייל: קודם מה-body, אחרת נשלף מהלקוח.
    let toEmail = (body?.toEmail || '').trim();
    let customerName: string | undefined;
    const customerId = (body?.customerId || '').trim() || undefined;

    if (customerId) {
      const c = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true, email: true },
      });
      if (!c) throw new BadRequestException('הלקוח לא נמצא');
      customerName = c.name || undefined;
      if (!toEmail) toEmail = (c.email || '').trim();
    }

    if (!toEmail || !toEmail.includes('@')) {
      throw new BadRequestException('ללקוח אין כתובת אימייל תקינה — לא ניתן לשלוח בקשת משוב');
    }

    // בדיקה מקדימה של חיבור Outlook כדי להחזיר הודעה ברורה (השירות מחזיר false בשקט).
    const connected = await this.msAuth
      .getStatus(userId)
      .then((s) => s.connected)
      .catch(() => false);
    if (!connected) {
      throw new BadRequestException('חשבון ה-Outlook שלך אינו מחובר — יש להתחבר לפני שליחת משוב');
    }

    const ok = await this.reviews.sendReviewRequest({
      toEmail,
      customerName,
      customerId,
      taskId: (body?.taskId || '').trim() || undefined,
      userId,
      requestHost: (req.headers?.host as string) || null,
    });

    if (!ok) throw new BadRequestException('שליחת בקשת המשוב נכשלה — נסו שוב');
    return { ok: true, toEmail };
  }
}
