import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RadonJobsService } from './radon-jobs.service';
import { RadonDetectorsService } from './radon-detectors.service';
import { RadonAlertsService } from './radon-alerts.service';
import { CustomerReminderService } from './customer-reminder.service';
import { RadonKitService } from './radon-kit.service';
import { RadonKitAutoSendService } from './radon-kit-autosend.service';
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
    private readonly kit: RadonKitService,
    private readonly autoSend: RadonKitAutoSendService,
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

  /** מתזמן תזכורת ללקוח — בעוד X ימים (ברירת מחדל 90) או בתאריך ושעה מדויקים (`dueAt`). */
  @Post('reminder')
  scheduleReminder(@Body() body: any, @Req() req: any) {
    return this.reminders.schedule({
      taskId: body?.taskId,
      sku: body?.sku,
      radonJobId: body?.radonJobId ?? null,
      delayDays: body?.delayDays,
      dueAt: body?.dueAt ?? null,
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

  // ── מעקב ערכת ראדון — הקומפוננטה הקבועה בסרגל הימני ──
  //
  // כל התהליך שהלקוח מבצע לבדו: שליחת הערכה, אישור ההתקנה שלו בוואטסאפ,
  // הספירה לאחור, וסיום התקופה. ראה RadonKitService.

  /** המצב המלא של המשימה: שלב, ספירה לאחור, ושתי ההודעות המנוסחות. */
  @Get('kit/:taskId')
  kitState(@Param('taskId') taskId: string, @Query('sku') sku: string) {
    return this.kit.getState(taskId, sku);
  }

  /** "הערכה נשלחה ללקוח" — מסמן, ושולח מיד את הודעת ההוראות + בקשת התאריך. */
  @Post('kit/sent')
  kitSent(@Body() body: any, @Req() req: any) {
    return this.kit.markKitSent({
      taskId: body?.taskId,
      sku: body?.sku,
      customerId: body?.customerId ?? null,
      testDurationDays: body?.testDurationDays ?? null,
      phoneOverride: body?.phoneOverride ?? null,
      actorUserId: req?.user?.id ?? null,
    });
  }

  /** אישור התקנה ידני — כשהלקוח מסר את התאריך בטלפון ולא בוואטסאפ. */
  @Post('kit/confirm')
  kitConfirm(@Body() body: any, @Req() req: any) {
    return this.kit.confirmInstallation({
      taskId: body?.taskId,
      radonJobId: body?.radonJobId ?? null,
      installedOn: body?.installedOn,
      note: body?.note ?? null,
      via: 'manual',
      actorUserId: req?.user?.id ?? null,
    });
  }

  /** שינוי משך תקופת הבדיקה — אפשרי רק לפני שהודעת ההוראות יצאה. */
  @Post('kit/duration')
  kitDuration(@Body() body: any) {
    return this.kit.setDuration(body?.taskId, body?.sku, Number(body?.testDurationDays));
  }

  /** הערכה חזרה אלינו — סוגר את הספירה ואת ההתראה. */
  @Post('kit/returned')
  kitReturned(@Body() body: any) {
    return this.kit.markReturned(body?.taskId, body?.sku);
  }

  /** הרצה ידנית של סריקת 48 השעות — לבדיקה ולתפעול. */
  @Post('kit/autosend/run')
  @Roles('ADMIN', 'MANAGER')
  kitAutoSendRun() {
    return this.autoSend.run();
  }
}

/**
 * הנתיב שהבוט קורא לו כשהלקוח אישר בוואטסאפ מתי הוא התקין.
 *
 * מופרד לבקר משלו כי RolesGuard דורש JWT של משתמש, ולבוט אין כזה — הוא
 * מזדהה בסוד המשותף, אותו סוד שה-CRM שולח לבוט בכיוון ההפוך. הבדיקה כאן
 * היא timing-safe באותה מידה שהיא בצד הבוט.
 */
@Controller('radon/internal')
export class RadonInternalController {
  constructor(private readonly kit: RadonKitService) {}

  private assertSecret(provided?: string) {
    const expected =
      (process.env.CUSTOMER_REMINDER_SECRET ?? '').trim() ||
      (process.env.INTERNAL_API_SECRET ?? '').trim();
    // סוד לא מוגדר = הנתיב סגור. לא פתוח.
    if (!expected) throw new UnauthorizedException('internal API not configured');
    const got = (provided ?? '').trim();
    if (got.length !== expected.length) throw new UnauthorizedException('unauthorized');
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) throw new UnauthorizedException('unauthorized');
  }

  /** הלקוח אישר התקנה — מכאן מתחילה הספירה לאחור. */
  @Post('kit-installed')
  kitInstalled(@Body() body: any, @Headers('x-internal-secret') secret?: string) {
    this.assertSecret(secret);
    return this.kit.confirmInstallation({
      taskId: body?.taskId ?? null,
      radonJobId: body?.radonJobId ?? null,
      installedOn: body?.installedOn,
      note: body?.note ?? null,
      via: 'whatsapp',
    });
  }
}
