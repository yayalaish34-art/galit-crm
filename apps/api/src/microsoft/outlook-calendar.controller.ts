import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { GraphCalendarService, GraphEventAttendee, GraphEventAttachment } from './graph-calendar.service';

interface CreateOutlookEventBody {
  subject: string;
  body?: string;
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  attendees?: GraphEventAttendee[];
  employeeUserIds?: string[];
  isOnlineMeeting?: boolean;
  attachments?: GraphEventAttachment[];
}

@Controller('outlook/calendar')
export class OutlookCalendarController {
  constructor(private readonly calendar: GraphCalendarService) {}

  /**
   * יצירת פגישה ביומן ה-Outlook של המשתמש המחובר.
   * עובדים/לקוח שנכללים ב-attendees מקבלים הזמנה והפגישה מופיעה ביומן שלהם.
   */
  @Post('events')
  async createEvent(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: CreateOutlookEventBody,
  ) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return this.calendar.createEventAsUser(userId, body);
  }

  /**
   * קריאת אירועי היומן של המשתמש המחובר. חלון תאריכים אופציונלי (start/end ISO UTC).
   * משמש את בוט ה-WhatsApp (העוזרת "גלי") לקריאת יומן דרך חיבור ה-Outlook השמור ב-CRM.
   */
  @Get('events')
  async listEvents(
    @Headers('x-user-id') userId: string | undefined,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('top') top?: string,
  ) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    const parsedTop = top ? Number(top) : undefined;
    const events = await this.calendar.listEventsAsUser(userId, {
      startIso: start,
      endIso: end,
      top: Number.isFinite(parsedTop) ? parsedTop : undefined,
    });
    return { events, count: events.length };
  }

  /**
   * שליפת פרטים מלאים לאירוע יחיד לפי מזהה — כולל גוף, מוזמנים עם סטטוס תגובה,
   * מארגן, joinUrl של Teams, קטגוריות ועוד. משמש את העוזרת "גלי" כשהמשתמש
   * מבקש פרטים נוספים על פגישה שכבר זוהתה (למשל אחרי get_calendar_events).
   */
  @Get('events/:id')
  async getEvent(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') id: string,
  ) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return this.calendar.getEventByIdAsUser(userId, id);
  }

  /**
   * עדכון אירוע קיים ביומן המשתמש (רק השדות שסופקו). משמש את העוזרת "גלי".
   */
  @Patch('events/:id')
  async updateEvent(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') id: string,
    @Body() body: Partial<Pick<CreateOutlookEventBody, 'subject' | 'start' | 'end' | 'timeZone' | 'location' | 'body'>>,
  ) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return this.calendar.updateEventAsUser(userId, id, body);
  }

  /**
   * מחיקת אירוע מהיומן של המשתמש. משמש את העוזרת "גלי" (אחרי אישור המשתמש).
   */
  @Delete('events/:id')
  async deleteEvent(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') id: string,
  ) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return this.calendar.deleteEventAsUser(userId, id);
  }
}
