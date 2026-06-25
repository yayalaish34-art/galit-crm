import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  FeedbackAutomationConfig,
  FeedbackSendDto,
  FeedbackService,
  FollowupAutomationConfig,
} from './feedback.service';
import { FeedbackAutomationService } from './feedback-automation.service';
import { SmsConfig, SmsService } from './sms.service';

@Controller('feedback')
@UseGuards(RolesGuard)
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly automation: FeedbackAutomationService,
    private readonly sms: SmsService,
  ) {}

  /** רשימת הלקוחות עם משימות שהסתיימו (ללא כפילויות) — admin בלבד. */
  @Get('customers')
  @Roles('ADMIN')
  customers(@Req() req: any) {
    return this.feedback.listFeedbackCustomers(req.user);
  }

  /** טיוטה אישית מוכנה (נושא + גוף) לחלון השליחה. */
  @Get('draft')
  @Roles('ADMIN')
  draft(@Query('name') name?: string) {
    return this.feedback.feedbackDraft(name);
  }

  /** שליחת מייל משוב ללקוח דרך Outlook המחובר — admin בלבד. */
  @Post('send-email')
  @Roles('ADMIN')
  sendEmail(@Req() req: any, @Body() body: FeedbackSendDto) {
    return this.feedback.sendFeedbackEmail(req.user, body || {});
  }

  // ── הגדרות אוטומציה + SMS ──

  @Get('settings')
  @Roles('ADMIN')
  async settings() {
    const [feedback, followup, smsRaw] = await Promise.all([
      this.feedback.getFeedbackAutomation(),
      this.feedback.getFollowupAutomation(),
      this.sms.getConfig(),
    ]);
    // לא מחזירים סודות גולמיים — רק האם קיימים.
    const sms = {
      enabled: smsRaw.enabled,
      provider: smsRaw.provider,
      senderId: smsRaw.senderId,
      companyPhone: smsRaw.companyPhone,
      hasApiKey: !!smsRaw.apiKey,
      hasApiSecret: !!smsRaw.apiSecret,
    };
    return { feedback, followup, sms };
  }

  @Post('settings/feedback')
  @Roles('ADMIN')
  saveFeedbackAutomation(@Req() req: any, @Body() body: Partial<FeedbackAutomationConfig>) {
    return this.feedback.saveFeedbackAutomation(req.user, body || {});
  }

  @Post('settings/followup')
  @Roles('ADMIN')
  saveFollowupAutomation(@Req() req: any, @Body() body: Partial<FollowupAutomationConfig>) {
    return this.feedback.saveFollowupAutomation(req.user, body || {});
  }

  @Post('settings/sms')
  @Roles('ADMIN')
  async saveSmsConfig(@Body() body: Partial<SmsConfig>) {
    // לא דורסים מפתחות בריקים — רק אם נשלח ערך חדש.
    const patch: Partial<SmsConfig> = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.senderId !== undefined) patch.senderId = body.senderId;
    if (body.companyPhone !== undefined) patch.companyPhone = body.companyPhone;
    if (body.apiKey) patch.apiKey = body.apiKey;
    if (body.apiSecret) patch.apiSecret = body.apiSecret;
    const next = await this.sms.saveConfig(patch);
    return {
      enabled: next.enabled,
      provider: next.provider,
      senderId: next.senderId,
      companyPhone: next.companyPhone,
      hasApiKey: !!next.apiKey,
      hasApiSecret: !!next.apiSecret,
    };
  }

  // ── הרצה ידנית (שלח לכולם עכשיו) ──

  @Post('run/feedback')
  @Roles('ADMIN')
  runFeedback() {
    return this.automation.runFeedback({ force: true });
  }

  @Post('run/followup')
  @Roles('ADMIN')
  runFollowup() {
    return this.automation.runFollowup({ force: true });
  }

  // ── פולואו-אפ פר-לקוח ──

  @Get('followup-customers')
  @Roles('ADMIN')
  followupCustomers(@Req() req: any) {
    return this.feedback.listFollowupCustomers(req.user);
  }

  @Post('followup-customers/:id')
  @Roles('ADMIN')
  setCustomerFollowup(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { autoFollowupEnabled?: boolean; followupIntervalDays?: number | null; followupChannel?: 'email' | 'sms' | null },
  ) {
    return this.feedback.setCustomerFollowup(req.user, id, body || {});
  }
}
