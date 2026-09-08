import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { MailingListService } from './mailing-list.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * רשימת הדיוור — הסקשן בדשבורד של יורם ("לקוחות שאישרו דיוור").
 * הצפייה ברשימה והייצוא שמורים למנהלים; סימון "לא לכלול ברשימת דיוור" פתוח
 * לכל עובד, כי הוא מתבצע מתוך כרטיס הלקוח תוך כדי שיחה עם הלקוח.
 */
@Controller('mailing')
@UseGuards(RolesGuard)
export class MailingController {
  constructor(private readonly mailing: MailingListService) {}

  @Get('list')
  @Roles('ADMIN', 'MANAGER')
  list(@Query('search') search?: string, @Query('includeUnknown') includeUnknown?: string) {
    return this.mailing.list({ search, includeUnknown: includeUnknown === '1' || includeUnknown === 'true' });
  }

  @Get('export')
  @Roles('ADMIN', 'MANAGER')
  async export(@Res() res: Response) {
    const csv = await this.mailing.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mailing-list.csv"');
    res.send(csv);
  }

  @Post('backfill')
  @Roles('ADMIN', 'MANAGER')
  backfill() {
    return this.mailing.backfillFromLeads();
  }

  /** סימון לקוח כ"לא רוצה להופיע ברשימת דיוור" (או ביטול הסימון). */
  @Post('customers/:id/opt-out')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
  setOptOut(@Param('id') id: string, @Body() body: { optOut?: boolean }, @Req() req: any) {
    return this.mailing.setOptOut(id, body?.optOut !== false, req.user?.id);
  }
}
