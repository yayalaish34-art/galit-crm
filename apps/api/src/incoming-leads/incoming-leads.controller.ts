import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IncomingLeadsService } from './incoming-leads.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('incoming-leads')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
export class IncomingLeadsController {
  constructor(private readonly service: IncomingLeadsService) {}

  /** לידים פעילים של המשתמש (NEW/ACTIVE) */
  @Get()
  list(@Req() req: any) {
    return this.service.listForOwner(req.user?.id);
  }

  /** לידים חדשים שטרם הוצגה עליהם התראה צידית (מנהל/אדמין רואה את כל הלידים הנכנסים) */
  @Get('pending')
  pending(@Req() req: any) {
    return this.service.pending(req.user);
  }

  /** סימון לידים כ"הוצגה התראה" */
  @Post('notified')
  notified(@Body() body: { ids?: string[] }, @Req() req: any) {
    return this.service.markNotified(body?.ids || [], req.user?.id);
  }

  /** התחל טיפול בליד */
  @Post(':id/start')
  start(@Param('id') id: string, @Req() req: any) {
    return this.service.start(id, req.user);
  }

  /** העבר ליד לעובד אחר. body: { toUserId } */
  @Post(':id/transfer')
  transfer(@Param('id') id: string, @Body() body: { toUserId?: string }, @Req() req: any) {
    return this.service.transfer(id, body?.toUserId || '', req.user);
  }

  /** דחיית ליד */
  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @Req() req: any) {
    return this.service.dismiss(id, req.user);
  }
}
