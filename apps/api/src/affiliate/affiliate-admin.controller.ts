import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AffiliateService } from './affiliate.service';

/**
 * ניהול השותפים + ההפניות ע"י הצוות שלנו — /affiliate-admin/*.
 * מאחורי RolesGuard (JWT של User). יצירת שותפים/סיסמאות = ADMIN/MANAGER;
 * צפייה ועדכון סטטוס הפניות = כל העובדים.
 */
@Controller('affiliate-admin')
@UseGuards(RolesGuard)
export class AffiliateAdminController {
  constructor(private readonly affiliate: AffiliateService) {}

  @Get('affiliates')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  listAffiliates() {
    return this.affiliate.listAffiliates();
  }

  @Post('affiliates')
  @Roles('ADMIN', 'MANAGER')
  createAffiliate(@Body() body: any) {
    return this.affiliate.createAffiliate(body || {});
  }

  @Post('affiliates/:idOrUsername/password')
  @Roles('ADMIN', 'MANAGER')
  setPassword(@Param('idOrUsername') idOrUsername: string, @Body() body: { password?: string }) {
    return this.affiliate.setPassword(idOrUsername, body?.password || '');
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
