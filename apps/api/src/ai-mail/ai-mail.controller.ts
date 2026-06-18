import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiMailService, DraftContext } from './ai-mail.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('ai-mail')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
export class AiMailController {
  constructor(private readonly aiMail: AiMailService) {}

  /** POST /ai-mail/quote-draft — generate (or refine) a quote email subject + body. */
  @Post('quote-draft')
  draft(@Body() body: DraftContext) {
    return this.aiMail.generateDraft(body || {});
  }
}
