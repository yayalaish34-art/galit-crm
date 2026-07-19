import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { PrismaService } from '../prisma/prisma.service';

export interface GraphEventAttendee {
  email: string;
  name?: string;
  /** required → "חובה"; optional → "רשות". ברירת מחדל: required */
  type?: 'required' | 'optional';
}

export interface GraphEventAttachment {
  /** שם הקובץ כפי שיוצג בפגישה */
  fileName: string;
  /** תוכן הקובץ בקידוד base64 (ללא תחילית data:) */
  contentBase64: string;
  /** סוג MIME (ברירת מחדל application/octet-stream) */
  mimeType?: string;
}

/** מגבלת Graph לצירוף inline בבקשת יצירת האירוע (~3MB לכלל הבקשה). שמרני. */
const MAX_INLINE_ATTACHMENTS_BYTES = 3 * 1024 * 1024;

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
  /** קבצים לצירוף לפגישה (אם הלקוח/המשתמש בחר לצרף) */
  attachments?: GraphEventAttachment[];
}

export interface GraphCalendarEventResult {
  id: string;
  webLink: string | null;
  /** קישור הצטרפות לפגישת Teams (אם נוצרה כמקוונת) */
  joinUrl: string | null;
  /** כתובות המשתתפים שהוזמנו בפועל — לתצוגה אחרי יצירה */
  invited: string[];
}

export interface ListEventsOptions {
  /** ISO 8601 UTC, e.g. "2026-07-15T00:00:00Z". When both start+end are given, uses calendarView. */
  startIso?: string;
  endIso?: string;
  /** default 25, clamped to [1, 100] */
  top?: number;
}

export interface CalendarEventSummary {
  id: string;
  subject: string | null;
  start: { dateTime: string; timeZone: string } | null;
  end: { dateTime: string; timeZone: string } | null;
  location: string | null;
  isOnlineMeeting: boolean;
  isAllDay: boolean;
  webLink: string | null;
}

/** סטטוס תגובת מוזמן ל-Graph: none / organizer / tentativelyAccepted / accepted / declined / notResponded */
export type CalendarAttendeeResponse =
  | 'none'
  | 'organizer'
  | 'tentativelyAccepted'
  | 'accepted'
  | 'declined'
  | 'notResponded';

export interface CalendarEventAttendee {
  email: string;
  name: string | null;
  type: 'required' | 'optional' | 'resource';
  responseStatus: CalendarAttendeeResponse;
}

/**
 * פרטים מלאים לאירוע יחיד (עשירים יותר מ-CalendarEventSummary):
 * body/bodyPreview, attendees עם סטטוס תגובה, organizer, joinUrl של Teams, ועוד.
 */
export interface CalendarEventDetails {
  id: string;
  subject: string | null;
  body: { content: string; contentType: 'html' | 'text' } | null;
  bodyPreview: string | null;
  start: { dateTime: string; timeZone: string } | null;
  end: { dateTime: string; timeZone: string } | null;
  location: string | null;
  attendees: CalendarEventAttendee[];
  organizer: { email: string; name: string | null } | null;
  isOnlineMeeting: boolean;
  isAllDay: boolean;
  /** קישור הצטרפות ל-Teams (רק אם isOnlineMeeting=true); שטוח מ-onlineMeeting.joinUrl של Graph */
  joinUrl: string | null;
  webLink: string | null;
  categories: string[];
  /** low / normal / high */
  importance: string | null;
  /** free / tentative / busy / oof / workingElsewhere / unknown */
  showAs: string | null;
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

    // ── קבצים מצורפים לפגישה ── (inline fileAttachment; מתאים לקבצים קטנים)
    const attachments = (ev.attachments || []).filter(
      (a) => a?.fileName?.trim() && a?.contentBase64?.trim(),
    );
    if (attachments.length) {
      const totalBytes = attachments.reduce(
        (sum, a) => sum + Math.floor((a.contentBase64.length * 3) / 4),
        0,
      );
      if (totalBytes > MAX_INLINE_ATTACHMENTS_BYTES) {
        throw new BadRequestException(
          'הקבצים המצורפים גדולים מדי (מגבלת ~3MB לכלל הקבצים). צרפו קבצים קטנים יותר.',
        );
      }
      payload.attachments = attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.fileName.trim(),
        contentType: a.mimeType?.trim() || 'application/octet-stream',
        contentBytes: a.contentBase64.trim(),
      }));
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
   * קריאת אירועי היומן של המשתמש המחובר דרך Microsoft Graph.
   * כשמסופקים גם startIso וגם endIso — משתמש ב-calendarView (חלון תאריכים);
   * אחרת /me/events. דורש את ההרשאה Calendars.ReadWrite (כלולה ב-SCOPES).
   */
  async listEventsAsUser(userId: string, opts: ListEventsOptions = {}): Promise<CalendarEventSummary[]> {
    const accessToken = await this.auth.getAccessToken(userId);
    const top = Math.min(Math.max(opts.top ?? 25, 1), 100);
    const select = 'id,subject,start,end,location,isOnlineMeeting,isAllDay,webLink';

    let url: string;
    if (opts.startIso && opts.endIso) {
      url =
        'https://graph.microsoft.com/v1.0/me/calendarView' +
        `?startDateTime=${encodeURIComponent(opts.startIso)}` +
        `&endDateTime=${encodeURIComponent(opts.endIso)}` +
        `&$orderby=${encodeURIComponent('start/dateTime')}` +
        `&$top=${top}&$select=${encodeURIComponent(select)}`;
    } else {
      url =
        'https://graph.microsoft.com/v1.0/me/events' +
        `?$orderby=${encodeURIComponent('start/dateTime')}` +
        `&$top=${top}&$select=${encodeURIComponent(select)}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph list events failed for user ${userId}: ${res.status} ${detail}`);
      if (res.status === 403) {
        throw new BadRequestException(
          'אין הרשאת יומן ל-Outlook — יש להתחבר מחדש כדי לאשר את הרשאת היומן (Calendars.ReadWrite)',
        );
      }
      throw new BadRequestException('קריאת היומן מ-Outlook נכשלה');
    }

    const data = (await res.json()) as { value?: unknown[] };
    const items = Array.isArray(data.value) ? data.value : [];
    return items.map((raw) => {
      const r = (raw ?? {}) as Record<string, any>;
      const start = r.start && typeof r.start === 'object'
        ? { dateTime: String(r.start.dateTime ?? ''), timeZone: String(r.start.timeZone ?? '') }
        : null;
      const end = r.end && typeof r.end === 'object'
        ? { dateTime: String(r.end.dateTime ?? ''), timeZone: String(r.end.timeZone ?? '') }
        : null;
      const location =
        r.location && typeof r.location === 'object' && typeof r.location.displayName === 'string'
          ? r.location.displayName || null
          : null;
      return {
        id: typeof r.id === 'string' ? r.id : '',
        subject: typeof r.subject === 'string' ? r.subject : null,
        start,
        end,
        location,
        isOnlineMeeting: r.isOnlineMeeting === true,
        isAllDay: r.isAllDay === true,
        webLink: typeof r.webLink === 'string' ? r.webLink : null,
      };
    });
  }

  /**
   * שליפת פרטים מלאים לאירוע ספציפי מיומן ה-Outlook של המשתמש (GET /me/events/{id}).
   * מחזיר את הגוף/הערות, רשימת המוזמנים עם סטטוס תגובה, המארגן, קישור Teams להצטרפות,
   * קטגוריות, חשיבות ו-showAs — מעבר לשדות הרזים של listEventsAsUser. משמש את העוזרת
   * "גלי" כשהמשתמש מבקש פרטים נוספים על פגישה מסוימת שכבר זוהתה. דורש Calendars.ReadWrite.
   */
  async getEventByIdAsUser(userId: string, eventId: string): Promise<CalendarEventDetails> {
    const accessToken = await this.auth.getAccessToken(userId);
    const select =
      'id,subject,body,bodyPreview,start,end,location,attendees,organizer,' +
      'isOnlineMeeting,isAllDay,onlineMeeting,webLink,categories,importance,showAs';
    const url =
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}` +
      `?$select=${encodeURIComponent(select)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(
        `Graph get event failed for user ${userId} event ${eventId}: ${res.status} ${detail}`,
      );
      if (res.status === 403) {
        throw new BadRequestException(
          'אין הרשאת יומן ל-Outlook — יש להתחבר מחדש כדי לאשר את הרשאת היומן (Calendars.ReadWrite)',
        );
      }
      if (res.status === 404) throw new BadRequestException('האירוע לא נמצא ביומן');
      throw new BadRequestException('קריאת פרטי הפגישה מ-Outlook נכשלה');
    }

    const r = (await res.json()) as Record<string, any>;

    const start =
      r.start && typeof r.start === 'object'
        ? { dateTime: String(r.start.dateTime ?? ''), timeZone: String(r.start.timeZone ?? '') }
        : null;
    const end =
      r.end && typeof r.end === 'object'
        ? { dateTime: String(r.end.dateTime ?? ''), timeZone: String(r.end.timeZone ?? '') }
        : null;
    const location =
      r.location && typeof r.location === 'object' && typeof r.location.displayName === 'string'
        ? r.location.displayName || null
        : null;
    const body =
      r.body && typeof r.body === 'object'
        ? {
            content: String(r.body.content ?? ''),
            contentType: (r.body.contentType === 'html' ? 'html' : 'text') as 'html' | 'text',
          }
        : null;
    const organizerEmail = r.organizer?.emailAddress;
    const organizer =
      organizerEmail && typeof organizerEmail === 'object' && typeof organizerEmail.address === 'string'
        ? {
            email: organizerEmail.address,
            name:
              typeof organizerEmail.name === 'string' && organizerEmail.name
                ? organizerEmail.name
                : null,
          }
        : null;
    const attendees: CalendarEventAttendee[] = Array.isArray(r.attendees)
      ? r.attendees
          .map((a: any): CalendarEventAttendee => ({
            email: String(a?.emailAddress?.address ?? ''),
            name:
              typeof a?.emailAddress?.name === 'string' && a.emailAddress.name
                ? a.emailAddress.name
                : null,
            type:
              a?.type === 'optional' || a?.type === 'resource'
                ? a.type
                : 'required',
            responseStatus: (typeof a?.status?.response === 'string'
              ? a.status.response
              : 'none') as CalendarAttendeeResponse,
          }))
          .filter((a: CalendarEventAttendee) => a.email.includes('@'))
      : [];
    const categories: string[] = Array.isArray(r.categories)
      ? r.categories.filter((c: unknown): c is string => typeof c === 'string')
      : [];

    return {
      id: typeof r.id === 'string' ? r.id : '',
      subject: typeof r.subject === 'string' ? r.subject : null,
      body,
      bodyPreview: typeof r.bodyPreview === 'string' ? r.bodyPreview : null,
      start,
      end,
      location,
      attendees,
      organizer,
      isOnlineMeeting: r.isOnlineMeeting === true,
      isAllDay: r.isAllDay === true,
      joinUrl:
        r.onlineMeeting && typeof r.onlineMeeting === 'object' && typeof r.onlineMeeting.joinUrl === 'string'
          ? r.onlineMeeting.joinUrl
          : null,
      webLink: typeof r.webLink === 'string' ? r.webLink : null,
      categories,
      importance: typeof r.importance === 'string' ? r.importance : null,
      showAs: typeof r.showAs === 'string' ? r.showAs : null,
    };
  }

  /**
   * עדכון אירוע קיים ביומן ה-Outlook של המשתמש (PATCH — רק השדות שסופקו).
   * משמש את העוזרת "גלי" לעריכת פגישות. דורש Calendars.ReadWrite.
   */
  async updateEventAsUser(
    userId: string,
    eventId: string,
    patch: {
      subject?: string;
      start?: string;
      end?: string;
      timeZone?: string;
      location?: string;
      body?: string;
    },
  ): Promise<{ id: string; webLink: string | null }> {
    const accessToken = await this.auth.getAccessToken(userId);
    const tz = patch.timeZone || 'Asia/Jerusalem';

    // Build a minimal PATCH body — only the provided fields are sent.
    const payload: Record<string, unknown> = {};
    if (patch.subject !== undefined) payload.subject = patch.subject;
    if (patch.start !== undefined) payload.start = { dateTime: patch.start, timeZone: tz };
    if (patch.end !== undefined) payload.end = { dateTime: patch.end, timeZone: tz };
    if (patch.location !== undefined) payload.location = { displayName: patch.location };
    if (patch.body !== undefined) payload.body = { contentType: 'text', content: patch.body };

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('לא צוין מה לעדכן באירוע');
    }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph update event failed for user ${userId}: ${res.status} ${detail}`);
      if (res.status === 403) {
        throw new BadRequestException(
          'אין הרשאת יומן ל-Outlook — יש להתחבר מחדש כדי לאשר את הרשאת היומן (Calendars.ReadWrite)',
        );
      }
      if (res.status === 404) throw new BadRequestException('האירוע לא נמצא ביומן');
      throw new BadRequestException('עדכון הפגישה ב-Outlook נכשל');
    }

    const data = (await res.json()) as { id: string; webLink?: string };
    return { id: data.id, webLink: data.webLink ?? null };
  }

  /**
   * מחיקת אירוע מהיומן של המשתמש (DELETE). Graph מחזיר 204 בהצלחה.
   * משמש את העוזרת "גלי" למחיקת פגישות (אחרי אישור המשתמש). דורש Calendars.ReadWrite.
   */
  async deleteEventAsUser(userId: string, eventId: string): Promise<{ deleted: true }> {
    const accessToken = await this.auth.getAccessToken(userId);

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    // 204 No Content on success; 404 if already gone — treat as success (idempotent).
    if (res.status === 404) return { deleted: true };
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph delete event failed for user ${userId}: ${res.status} ${detail}`);
      if (res.status === 403) {
        throw new BadRequestException(
          'אין הרשאת יומן ל-Outlook — יש להתחבר מחדש כדי לאשר את הרשאת היומן (Calendars.ReadWrite)',
        );
      }
      throw new BadRequestException('מחיקת הפגישה מ-Outlook נכשלה');
    }
    return { deleted: true };
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
