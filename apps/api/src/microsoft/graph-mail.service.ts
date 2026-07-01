import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from './microsoft-auth.service';

export interface GraphMailAttachment {
  name: string;
  contentType: string;
  /** raw file bytes */
  content: Buffer;
  /** if set, the attachment is inline (referenced from HTML via cid:<contentId>) */
  contentId?: string;
}

export interface GraphMailMessage {
  to: string;
  cc?: string[];
  subject: string;
  /** HTML body */
  html: string;
  attachments?: GraphMailAttachment[];
}

@Injectable()
export class GraphMailService {
  private readonly logger = new Logger(GraphMailService.name);
  /** קאש למזהי תיקיות לפי שם (per-user) — נמנע מחיפוש תיקייה בכל סבב polling */
  private readonly folderIdCache = new Map<string, { id: string | null; ts: number }>();
  /** תיקיות נוספות לסריקה מעבר ל-/me/messages (לידים שמסוננים לתיקייה) */
  private static readonly EXTRA_LEAD_FOLDERS = ['עומס'];
  /** רק מיילים מאחת הכתובות האלה נחשבים לידים אמיתיים (טופס האתר / web3forms). */
  private static readonly LEAD_SENDER_ALLOWLIST = ['noreply@galit.co.il', 'no-reply@galit.co.il', 'notify@web3forms.com'];

  constructor(private readonly auth: MicrosoftAuthService) {}

  /**
   * Send mail from the given CRM user's own Outlook mailbox via Microsoft Graph.
   * Uses sendMail (small attachments, < ~3 MB encoded — fine for a single .docx quote).
   */
  /**
   * קורא מהתיבה של המשתמש הודעות שהתקבלו מאז `sinceIso`, ומחזיר את אלה
   * שהנושא שלהן מכיל "ליד". דורש את ההרשאה Mail.Read.
   */
  async listRecentLeadMessages(
    userId: string,
    sinceIso: string,
  ): Promise<
    {
      id: string;
      internetMessageId: string;
      subject: string;
      bodyText: string;
      fromName: string;
      fromEmail: string;
      receivedDateTime: string;
    }[]
  > {
    const accessToken = await this.auth.getAccessToken(userId);

    // מקורות לסריקה: כל התיבה (/me/messages) + תיקיות ייעודיות (למשל "עומס") למקרה שהליד סונן לשם.
    const sources = ['/me/messages'];
    for (const folderName of GraphMailService.EXTRA_LEAD_FOLDERS) {
      const fid = await this.findFolderIdByName(accessToken, userId, folderName);
      if (fid) sources.push(`/me/mailFolders/${fid}/messages`);
    }

    const seen = new Set<string>();
    const all: any[] = [];
    for (const path of sources) {
      const items = await this.fetchMessagesFrom(accessToken, path, sinceIso, userId);
      for (const m of items) {
        if (m?.id && !seen.has(m.id)) { seen.add(m.id); all.push(m); }
      }
    }

    return all
      .filter((m) => GraphMailService.isLeadSender(m?.from?.emailAddress?.address))
      .map((m) => ({
        id: String(m.id),
        internetMessageId: String(m?.internetMessageId || m.id),
        subject: String(m.subject || ''),
        bodyText: this.htmlToText(m?.body?.content || m?.bodyPreview || ''),
        fromName: String(m?.from?.emailAddress?.name || ''),
        fromEmail: String(m?.from?.emailAddress?.address || ''),
        receivedDateTime: String(m?.receivedDateTime || ''),
      }));
  }

  /** רק מיילים מכתובת שולח מאושרת (טופס האתר / web3forms) נחשבים לידים. */
  private static isLeadSender(fromEmail?: string | null): boolean {
    return GraphMailService.LEAD_SENDER_ALLOWLIST.includes(String(fromEmail || '').trim().toLowerCase());
  }

  /** שולף הודעות מנתיב נתון (תיבה או תיקייה) עם אותו פילטר זמן ושדות. */
  private async fetchMessagesFrom(
    accessToken: string,
    path: string,
    sinceIso: string,
    userId: string,
  ): Promise<any[]> {
    const url =
      `https://graph.microsoft.com/v1.0${path}` +
      `?$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
      `&$select=id,internetMessageId,subject,bodyPreview,body,from,receivedDateTime` +
      `&$orderby=receivedDateTime desc&$top=25`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      this.logger.warn(`fetch messages ${path} for ${userId}: ${res.status} ${t.slice(0, 160)}`);
      return [];
    }
    const data: any = await res.json();
    return Array.isArray(data?.value) ? data.value : [];
  }

  /** מאתר מזהה תיקייה לפי שם תצוגה (רמה עליונה + רמת ילדים אחת), עם קאש של 10 דקות. */
  private async findFolderIdByName(accessToken: string, userId: string, name: string): Promise<string | null> {
    const key = `${userId}|${name}`;
    const cached = this.folderIdCache.get(key);
    if (cached && Date.now() - cached.ts < 600_000) return cached.id;

    let found: string | null = null;
    try {
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&$select=id,displayName,childFolderCount',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data: any = await res.json();
        const folders: any[] = Array.isArray(data?.value) ? data.value : [];
        found = folders.find((f) => (f?.displayName || '').trim() === name)?.id || null;
        if (!found) {
          // חיפוש ברמת ילדים אחת (התיקייה עשויה להיות תת-תיקייה של Inbox וכד')
          for (const f of folders.filter((x) => (x?.childFolderCount || 0) > 0)) {
            const cr = await fetch(
              `https://graph.microsoft.com/v1.0/me/mailFolders/${f.id}/childFolders?$top=100&$select=id,displayName`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!cr.ok) continue;
            const cd: any = await cr.json();
            const hit = (cd?.value || []).find((c: any) => (c?.displayName || '').trim() === name);
            if (hit) { found = hit.id; break; }
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`findFolderIdByName "${name}" failed for ${userId}: ${e?.message || e}`);
    }
    this.folderIdCache.set(key, { id: found, ts: Date.now() });
    return found;
  }

  /** המרה גסה של HTML לטקסט קריא (להצגת פרטי הליד בתיאור המשימה). */
  private htmlToText(html: string): string {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .trim();
  }

  async sendMailAsUser(userId: string, msg: GraphMailMessage): Promise<void> {
    if (!msg.to || !msg.to.includes('@')) {
      throw new BadRequestException('כתובת מייל לא תקינה');
    }

    const accessToken = await this.auth.getAccessToken(userId);

    const message: any = {
      subject: msg.subject,
      body: { contentType: 'HTML', content: msg.html },
      toRecipients: [{ emailAddress: { address: msg.to } }],
    };

    if (msg.cc?.length) {
      message.ccRecipients = msg.cc.map((address) => ({ emailAddress: { address } }));
    }

    if (msg.attachments?.length) {
      message.attachments = msg.attachments.map((a) => {
        const att: any = {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.content.toString('base64'),
        };
        // Inline images (signature/logo) — referenced from HTML via cid:<contentId>.
        // Outlook blocks data:base64 <img>, so embedded images must use CID.
        if (a.contentId) {
          att.contentId = a.contentId;
          att.isInline = true;
        }
        return att;
      });
    }

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    // Graph returns 202 Accepted on success (empty body).
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph sendMail failed for user ${userId}: ${res.status} ${detail}`);
      throw new BadRequestException('שליחת המייל דרך Outlook נכשלה');
    }
  }
}
