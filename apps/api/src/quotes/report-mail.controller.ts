import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ReportMailService, SendReportEmailOpts } from './report-mail.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('tasks')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
export class ReportMailController {
  constructor(private readonly reportMail: ReportMailService) {}

  /**
   * POST /tasks/:id/send-report-email
   * שולח את הדוח שהופק ללקוח דרך ה-Outlook של המשתמש, ומסמן את משימת הביצוע כ-DONE.
   */
  @Post(':id/send-report-email')
  send(@Param('id') id: string, @Body() body: SendReportEmailOpts, @Req() req: any) {
    return this.reportMail.sendReportEmail(id, { ...(body || {}), userId: req.user?.id });
  }
}
