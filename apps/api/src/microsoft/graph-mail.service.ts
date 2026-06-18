import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from './microsoft-auth.service';

export interface GraphMailAttachment {
  name: string;
  contentType: string;
  /** raw file bytes */
  content: Buffer;
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

  constructor(private readonly auth: MicrosoftAuthService) {}

  /**
   * Send mail from the given CRM user's own Outlook mailbox via Microsoft Graph.
   * Uses sendMail (small attachments, < ~3 MB encoded — fine for a single .docx quote).
   */
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
      message.attachments = msg.attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: a.content.toString('base64'),
      }));
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
