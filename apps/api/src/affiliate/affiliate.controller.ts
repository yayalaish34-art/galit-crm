import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { AffiliateGuard } from './affiliate.guard';

/**
 * פורטל השותפים (צד שלישי) — /affiliate/*.
 * - /affiliate/login  — פתוח (username+password → JWT).
 * - /affiliate/me/*   — מאחורי AffiliateGuard (JWT של שותף).
 */
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliate: AffiliateService) {}

  /** התחברות שותף. */
  @Post('login')
  login(@Body() body: { username?: string; password?: string }) {
    return this.affiliate.login(body?.username || '', body?.password || '');
  }

  /** הפרופיל + ההפניות + סיכום העמלות של השותף המחובר. */
  @Get('me')
  @UseGuards(AffiliateGuard)
  me(@Req() req: any) {
    return this.affiliate.me(req.affiliate.id);
  }

  /** השותף שולח לנו לקוח חדש. */
  @Post('me/referrals')
  @UseGuards(AffiliateGuard)
  submit(@Req() req: any, @Body() body: any) {
    return this.affiliate.submitReferral(req.affiliate.id, body || {});
  }
}
