import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { GraphCalendarService, GraphEventAttendee } from './graph-calendar.service';

interface CreateOutlookEventBody {
  subject: string;
  body?: string;
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  attendees?: GraphEventAttendee[];
  isOnlineMeeting?: boolean;
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
}
