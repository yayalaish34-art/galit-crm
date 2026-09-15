import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CallRecordingsService } from './call-recordings.service';

/**
 * הקלטות שיחה ותמלולן.
 *
 * הקליטה (`/ingest`) פתוחה לכל משתמש מזוהה ולא מוגבלת בתפקיד: היא מיועדת
 * למערכת הטלפוניה, לא לאדם. שאר הפעולות הן קריאה/שיוך שכל נציג מבצע.
 */
@Controller('call-recordings')
@UseGuards(RolesGuard)
export class CallRecordingsController {
  constructor(private readonly calls: CallRecordingsService) {}

  /** מה מוגדר בשרת — המסך מתאים את עצמו (כפתור תמלול, כפתור חיוג דרך מרכזייה). */
  @Get('status')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  status() {
    return { transcription: this.calls.transcriptionAvailable, pbx: this.calls.pbxAvailable };
  }

  /**
   * חיוג ללקוח דרך המרכזייה בשם המשתמש המחובר.
   *
   * המרכזייה מצלצלת קודם לשלוחת המשתמש; כשהוא מרים היא מחייגת ללקוח. השיחה
   * מוקלטת ותתומלל אוטומטית — בניגוד לכפתור tel: שלא מגיע למערכת.
   */
  @Post('dial')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  dial(@Body() body: { phone: string }, @Req() req: any) {
    return this.calls.dial(req.user?.id, body?.phone);
  }

  /**
   * קליטת שיחות ממערכת הטלפוניה.
   *
   * מקבל שיחה בודדת או מערך — ספקים שונים שולחים אחרת, ותמיכה בשתי הצורות
   * חוסכת מתאם בצד השולח.
   */
  @Post('ingest')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  ingest(@Body() body: any) {
    const items = Array.isArray(body) ? body : Array.isArray(body?.calls) ? body.calls : [body];
    return this.calls.ingestMany(items);
  }

  /** משיכה יזומה מספק הטלפוניה (טרם מוגדר — ראה fetchFromProvider). */
  @Post('fetch')
  @Roles('ADMIN', 'MANAGER')
  fetch() {
    return this.calls.fetchFromProvider();
  }

  /** שיחות שלא נמצא להן לקוח — למסך השיוך הידני. */
  @Get('unlinked')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  unlinked(@Query('limit') limit?: string) {
    return this.calls.listUnlinked(Number(limit) || 100);
  }

  /** שיחות נכנסות "חיות" (חלון קצר) — לבאנר "מתקשר עכשיו" שהפרונט פוליג עליו. */
  @Get('live')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  live() {
    return this.calls.listLive();
  }

  @Get('customer/:customerId')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  forCustomer(@Param('customerId') customerId: string) {
    return this.calls.listForCustomer(customerId);
  }

  @Get('task/:taskId')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  forTask(@Param('taskId') taskId: string) {
    return this.calls.listForTask(taskId);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  getOne(@Param('id') id: string) {
    return this.calls.getOne(id);
  }

  /** תמלול יזום של שיחה אחת — גם כניסיון חוזר אחרי כישלון. */
  @Post(':id/transcribe')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  transcribe(@Param('id') id: string) {
    return this.calls.transcribe(id);
  }

  /** תמלול התור כולו. */
  @Post('transcribe-pending')
  @Roles('ADMIN', 'MANAGER')
  transcribePending(@Body() body: { limit?: number }) {
    return this.calls.transcribePending(Number(body?.limit) || 10);
  }

  /** שיוך ידני ללקוח (ואופציונלית למשימה). */
  @Post(':id/link')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  link(@Param('id') id: string, @Body() body: { customerId: string; taskId?: string | null }) {
    return this.calls.linkToCustomer(id, body?.customerId, body?.taskId);
  }

  @Delete(':id/link')
  @Roles('ADMIN', 'MANAGER', 'SALES', 'EXPERT', 'TECHNICIAN', 'BILLING')
  unlink(@Param('id') id: string) {
    return this.calls.unlink(id);
  }
}
