import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AffiliateService } from './affiliate.service';

/**
 * ניהול השותפים + ההפניות ע"י הצוות שלנו — /affiliate-admin/*.
 * מאחורי RolesGuard (JWT של User). יצירת שותפים/סיסמה = ADMIN/MANAGER/SALES
 * (איש מכירות יכול לגייס חברות משלו); צפייה ועדכון סטטוס הפניות = כל העובדים.
 */
@Controller('affiliate-admin')
@UseGuards(RolesGuard)
export class AffiliateAdminController {
  constructor(private readonly affiliate: AffiliateService) {}

  /**
   * רשימת שותפים (עם סטטיסטיקה פר-שורה).
   * mine=1 — להציג רק שותפים שהיוזר הנוכחי גייס (דשבורד "המכירות שלי").
   */
  @Get('affiliates')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  listAffiliates(@Query('mine') mine: string | undefined, @Req() req: any) {
    const filter = mine === '1' && req.user?.id ? { recruitedByUserId: req.user.id } : undefined;
    return this.affiliate.listAffiliates(filter);
  }

  @Post('affiliates')
  @Roles('ADMIN', 'MANAGER', 'SALES')
  createAffiliate(@Body() body: any, @Req() req: any) {
    return this.affiliate.createAffiliate({
      ...(body || {}),
      // SALES: תמיד נצרב כגייס. ADMIN/MANAGER: ברירת מחדל לעצמם, אפשר לדרוס דרך הגוף.
      recruitedByUserId: body?.recruitedByUserId || req.user?.id || null,
    });
  }

  @Patch('affiliates/:id')
  @Roles('ADMIN', 'MANAGER', 'SALES')
  updateAffiliate(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const role = String(req.user?.role || '').toUpperCase();
    // SALES יכול לערוך רק שותפים שגייס בעצמו. ADMIN/MANAGER — כל אחד.
    const opts = role === 'SALES' ? { onlyIfRecruitedBy: req.user?.id } : {};
    return this.affiliate.updateAffiliate(id, body || {}, opts);
  }

  @Post('affiliates/:idOrUsername/password')
  @Roles('ADMIN', 'MANAGER', 'SALES')
  setPassword(
    @Param('idOrUsername') idOrUsername: string,
    @Body() body: { password?: string },
    @Req() req: any,
  ) {
    // SALES: רק לחברה שהוא גייס.
    const role = String(req.user?.role || '').toUpperCase();
    const opts = role === 'SALES' ? { onlyIfRecruitedBy: req.user?.id } : {};
    return this.affiliate.setPassword(idOrUsername, body?.password || '', opts);
  }

  @Get('referrals')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  listReferrals(@Query('status') status?: string, @Query('affiliateId') affiliateId?: string) {
    return this.affiliate.listReferrals({ status, affiliateId });
  }

  @Patch('referrals/:id')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  updateReferral(@Param('id') id: string, @Body() body: any) {
    return this.affiliate.updateReferral(id, body || {});
  }

  @Post('referrals/:id/settle')
  @Roles('ADMIN', 'MANAGER', 'BILLING')
  settle(@Param('id') id: string) {
    return this.affiliate.settleCommission(id);
  }
}
