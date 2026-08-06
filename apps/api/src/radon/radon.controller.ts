import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RadonJobsService } from './radon-jobs.service';
import { RadonDetectorsService } from './radon-detectors.service';
import { RadonAlertsService } from './radon-alerts.service';
import { CustomerReminderService } from './customer-reminder.service';
import {
  ALL_TRACKS,
  RADON_TEST_SKUS,
  RADON_LABELS,
  RADON_KIT_SKUS,
  isRadonTestSku,
  isRadonKitSku,
} from './radon-tracks';
import { RADON_DETECTOR_STATUSES, DETECTOR_STATUS_LABELS } from './radon-detector-status';
import { RadonDetectorStatusId } from './radon-detector-status';

/**
 * API של מודול הראדון. כל הנתיבים תחת /radon — המודול לא נוגע בנתיבים קיימים.
 */
@Controller('radon')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'TECHNICIAN')
export class RadonController {
  constructor(
    private readonly jobs: RadonJobsService,
    private readonly detectors: RadonDetectorsService,
    private readonly alerts: RadonAlertsService,
    private readonly reminders: CustomerReminderService,
  ) {}

  // ── מטא-דאטה: קודי השירות, המסלולים והתוויות — הממשק נטען מכאן ──

  @Get('meta')
  meta() {
    return {
      testSkus: RADON_TEST_SKUS,
      tracks: ALL_TRACKS,
      labels: RADON_LABELS,
      detectorStatuses: RADON_DETECTOR_STATUSES.map((s) => ({
        id: s, label: DETECTOR_STATUS_LABELS[s],
      })),
    };
  }

  /** האם קוד שירות פותח את הזרימה — הבדיקה שהממשק עושה לפני הצגת הכפתור. */
  @Get('applies')
  applies(@Query('sku') sku?: string) {
    return { sku: sku ?? null, applies: isRadonTestSku(sku) };
  }

  // ── עבודות ──

  @Get('jobs')
  listJobs(@Query('status') status?: string, @Query('track') track?: string) {
    return this.jobs.list({ status, track });
  }

  @Get('jobs/by-task/:taskId')
  getByTask(@Param('taskId') taskId: string) {
    return this.jobs.getByTask(taskId);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.get(id);
  }

  @Post('jobs')
  createJob(@Body() body: any) {
    return this.jobs.create(body);
  }

  @Patch('jobs/:id/answers')
  updateAnswers(@Param('id') id: string, @Body() body: any) {
    return this.jobs.updateAnswers(id, body?.answers ?? body);
  }

  @Post('jobs/:id/advance')
  advance(@Param('id') id: string, @Body() body: any) {
    return this.jobs.advanceStage(id, body?.toIndex);
  }

  @Post('jobs/:id/client-placement')
  clientPlacement(@Param('id') id: string, @Body() body: any) {
    return this.jobs.reportClientPlacement(id, body);
  }

  // ── מלאי גלאים ──

  @Get('detectors')
  listDetectors(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.detectors.list({ status, q, availableOnly: availableOnly === 'true' });
  }

  @Get('detectors/summary')
  detectorSummary() {
    return this.detectors.summary();
  }

  @Get('detectors/:id')
  getDetector(@Param('id') id: string) {
    return this.detectors.get(id);
  }

  @Post('detectors')
  createDetector(@Body() body: any, @Req() req: any) {
    return this.detectors.create(body, req?.user?.id);
  }

  @Patch('detectors/:id/status')
  changeStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.detectors.changeStatus(id, body?.status as RadonDetectorStatusId, {
      note: body?.note,
      jobId: body?.jobId,
      heldByUserId: body?.heldByUserId,
      byUserId: req?.user?.id,
    });
  }

  @Post('detectors/:id/assign')
  assign(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.detectors.assign(id, body?.jobId, req?.user?.id);
  }

  @Post('detectors/:id/release')
  release(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.detectors.release(id, body?.jobId, req?.user?.id);
  }

  @Patch('assignments/:assignmentId/placement')
  recordPlacement(@Param('assignmentId') assignmentId: string, @Body() body: any, @Req() req: any) {
    return this.detectors.recordPlacement(assignmentId, body, req?.user?.id);
  }

  // ── התראות ──

  @Get('alerts')
  listAlerts() {
    return this.alerts.listOpen();
  }

  @Post('alerts/:id/dismiss')
  dismissAlert(@Param('id') id: string, @Req() req: any) {
    return this.alerts.dismiss(id, req?.user?.id);
  }

  /** הרצה ידנית של חישוב ההתראות — לבדיקה ולתפעול. */
  @Post('alerts/recompute')
  @Roles('ADMIN', 'MANAGER')
  recomputeAlerts() {
    return this.alerts.recompute();
  }

  // ── תזכורת ללקוח ("תזכור לקוח") ──
  //
  // רק לשירותי ערכה (61 / 10000): הגלאים אצל הלקוח, והוא זה שאמור להוריד
  // ולהחזיר. השליחה עצמה מתבצעת בבוט — כאן רק מתזמנים.

  /** האם הכפתור זמין: גם קוד השירות מתאים וגם הגשר לבוט מוגדר. */
  @Get('reminder/available')
  reminderAvailable(@Query('sku') sku?: string) {
    return {
      sku: sku ?? null,
      isKit: isRadonKitSku(sku),
      configured: this.reminders.isConfigured(),
      available: isRadonKitSku(sku) && this.reminders.isConfigured(),
      kitSkus: RADON_KIT_SKUS,
    };
  }

  /** נוסח ההודעה + הנמען שייקבע — לתצוגה מקדימה לפני אישור. */
  @Get('reminder/preview/:taskId')
  reminderPreview(@Param('taskId') taskId: string) {
    return this.reminders.preview(taskId);
  }

  /** מה מתוזמן כרגע למשימה, כולל היסטוריית תזכורות. */
  @Get('reminder/task/:taskId')
  reminderForTask(@Param('taskId') taskId: string) {
    return this.reminders.listForTask(taskId);
  }

  /** מתזמן תזכורת ללקוח (ברירת מחדל: 90 יום). */
  @Post('reminder')
  scheduleReminder(@Body() body: any, @Req() req: any) {
    return this.reminders.schedule({
      taskId: body?.taskId,
      sku: body?.sku,
      radonJobId: body?.radonJobId ?? null,
      delayDays: body?.delayDays,
      messageText: body?.messageText ?? null,
      phoneOverride: body?.phoneOverride ?? null,
      actorUserId: req?.user?.id ?? null,
    });
  }

  /** מבטל תזכורת מתוזמנת. */
  @Post('reminder/:id/cancel')
  cancelReminder(@Param('id') id: string) {
    return this.reminders.cancel(id);
  }
}
