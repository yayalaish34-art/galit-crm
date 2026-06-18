import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { PrismaService } from '../prisma/prisma.service';

export interface GraphEventAttendee {
  email: string;
  name?: string;
  /** required → "חובה"; optional → "רשות". ברירת מחדל: required */
  type?: 'required' | 'optional';
}

export interface GraphCalendarEvent {
  subject: string;
  /** הערות/תיאור הפגישה (טקסט חופשי; שורות חדשות יומרו ל-<br>) */
  body?: string;
  /** מחרוזת זמן מקומי ISO ללא היסט, למשל 2026-06-20T14:00:00 (אזור הזמן נשלח בנפרד) */
  start: string;
  end: string;
  /** IANA timezone; ברירת מחדל Asia/Jerusalem */
  timeZone?: string;
  location?: string;
  /** משתתפים מפורשים (למשל הלקוח) — נשלחים עם כתובת מייל ישירה */
  attendees?: GraphEventAttendee[];
  /** מזהי עובדים מהמסד — הכתובת נפתרת בשרת ל-msEmail (התיבה המחוברת) ובהיעדרה ל-email */
  employeeUserIds?: string[];
  /** יצירת פגישת Teams מקוונת */
  isOnlineMeeting?: boolean;
}

export interface GraphCalendarEventResult {
  id: string;
  webLink: string | null;
  /** קישור הצטרפות לפגישת Teams (אם נוצרה כמקוונת) */
  joinUrl: string | null;
  /** כתובות המשתתפים שהוזמנו בפועל — לתצוגה אחרי יצירה */
  invited: string[];
}

/**
 * יצירת אירועי יומן ב-Outlook בשם המשתמש המחובר, דרך Microsoft Graph.
 * האירוע נוצר ביומן של המארגן (POST /me/events). כל עובד/לקוח שנכלל ב-attendees
 * מקבל הזמנה, והפגישה מופיעה ביומן ה-Outlook שלו. דורש את ההרשאה Calendars.ReadWrite
 * (ראה MicrosoftAuthService.SCOPES) — משתמשים שחוברו לפני הוספת ההרשאה יתחברו מחדש פעם אחת.
 */
@Injectable()
export class GraphCalendarService {
  private readonly logger = new Logger(GraphCalendarService.name);

  constructor(
    private readonly auth: MicrosoftAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async createEventAsUser(userId: string, ev: GraphCalendarEvent): Promise<GraphCalendarEventResult> {
    if (!ev?.subject?.trim()) {
      throw new BadRequestException('חסרה כותרת לפגישה');
    }
    if (!ev.start || !ev.end) {
      throw new BadRequestException('חסרים תאריך/שעת התחלה או סיום');
    }
    if (new Date(ev.end).getTime() <= new Date(ev.start).getTime()) {
      throw new BadRequestException('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    }

    const accessToken = await this.auth.getAccessToken(userId);
    const timeZone = ev.timeZone || 'Asia/Jerusalem';

    // משתתפים מפורשים (לקוח/כתובת חיצונית) + עובדים שנפתרים מהמסד לפי msEmail || email
    const explicit = ev.attendees || [];
    const resolvedEmployees = await this.resolveEmployeeAttendees(ev.employeeUserIds);
    const attendees = [...resolvedEmployees, ...explicit]
      .filter((a) => a.email && a.email.includes('@'))
      // הסרת כפילויות לפי כתובת מייל (case-insensitive)
      .filter((a, i, arr) => arr.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === i);

    const payload: Record<string, unknown> = {
      subject: ev.subject.trim(),
      body: { contentType: 'HTML', content: (ev.body || '').replace(/\n/g, '<br>') },
      start: { dateTime: ev.start, timeZone },
      end: { dateTime: ev.end, timeZone },
    };

    if (ev.location?.trim()) {
      payload.location = { displayName: ev.location.trim() };
    }

    if (attendees.length) {
      payload.attendees = attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name || a.email },
        type: a.type || 'required',
      }));
    }

    if (ev.isOnlineMeeting) {
      payload.isOnlineMeeting = true;
      payload.onlineMeetingProvider = 'teamsForBusiness';
    }

    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Graph מחזיר 201 Created עם גוף האירוע.
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph create event failed for user ${userId}: ${res.status} ${detail}`);
      if (res.status === 403) {
        throw new BadRequestException(
          'אין הרשאת יומן ל-Outlook — יש להתחבר מחדש כדי לאשר את הרשאת היומן (Calendars.ReadWrite)',
        );
      }
      throw new BadRequestException('יצירת הפגישה ב-Outlook נכשלה');
    }

    const data = (await res.json()) as {
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
    };

    return {
      id: data.id,
      webLink: data.webLink ?? null,
      joinUrl: data.onlineMeeting?.joinUrl ?? null,
      invited: attendees.map((a) => a.email),
    };
  }

  /**
   * ממיר מזהי עובדים לכתובות משתתפים. מעדיף את תיבת ה-Outlook המחוברת (msEmail)
   * ונופל חזרה לכתובת ה-CRM (email) כשהעובד לא חיבר Outlook.
   */
  private async resolveEmployeeAttendees(employeeUserIds?: string[]): Promise<GraphEventAttendee[]> {
    if (!employeeUserIds?.length) return [];
    const ids = [...new Set(employeeUserIds.filter(Boolean))];
    if (!ids.length) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, msEmail: true },
    });

    return users
      .map((u) => ({
        email: (u.msEmail || u.email || '').trim(),
        name: u.name,
        type: 'required' as const,
      }))
      .filter((a) => a.email.includes('@'));
  }
}
