import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/crypto.util';

/**
 * Delegated Microsoft Graph OAuth (authorization-code flow).
 * Each CRM user connects their own Outlook mailbox once; we store an
 * encrypted refresh token and mint short-lived access tokens on demand,
 * so mail is sent "on the user's behalf" via POST /me/sendMail.
 */
@Injectable()
export class MicrosoftAuthService {
  private readonly logger = new Logger(MicrosoftAuthService.name);

  // offline_access → refresh tokens; Mail.Send → send; User.Read → resolve the mailbox address;
  // Calendars.ReadWrite → create calendar events / send meeting invites (שלב "תיאום");
  // Mail.Read → קריאת תיבת הדואר לזיהוי מיילים נכנסים עם "ליד" בנושא (לידים אוטומטיים);
  // Files.ReadWrite → המרת DOCX ל-PDF דרך ה-OneDrive (מנוע Word — כותרת/עיצוב זהים לתבנית).
  // הוספת scope מחייבת חיבור-מחדש חד-פעמי של כל משתמש כדי לאשר את ההרשאה החדשה.
  static readonly SCOPES = 'offline_access Mail.Send Mail.Read User.Read Calendars.ReadWrite Files.ReadWrite';

  constructor(private readonly prisma: PrismaService) {}

  private cfg() {
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;
    const tenantId = process.env.GRAPH_TENANT_ID || 'common';
    const redirectUri = process.env.GRAPH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'אינטגרציית Outlook אינה מוגדרת בשרת — חסרים GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET / GRAPH_REDIRECT_URI',
      );
    }
    return { clientId, clientSecret, tenantId, redirectUri };
  }

  /** Build the Microsoft consent URL. `state` carries the CRM user id back to the callback. */
  buildAuthUrl(userId: string): string {
    const { clientId, tenantId, redirectUri } = this.cfg();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MicrosoftAuthService.SCOPES,
      state: userId,
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /** Exchange the auth code for tokens and persist the (encrypted) refresh token against the user. */
  async handleCallback(code: string, userId: string): Promise<{ email: string | null }> {
    const { clientId, clientSecret, tenantId, redirectUri } = this.cfg();
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: MicrosoftAuthService.SCOPES,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Token exchange failed: ${detail}`);
      throw new BadRequestException('חיבור ל-Outlook נכשל בעת קבלת ההרשאה');
    }

    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (!data.refresh_token) {
      throw new BadRequestException('לא התקבל refresh token — ודא שההרשאה offline_access אושרה');
    }

    let email: string | null = null;
    if (data.access_token) {
      email = await this.fetchMailbox(data.access_token);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        msRefreshToken: encryptSecret(data.refresh_token),
        msEmail: email,
        msConnectedAt: new Date(),
      },
    });

    return { email };
  }

  /** Mint a fresh access token for a connected user; rotates the stored refresh token. */
  async getAccessToken(userId: string): Promise<string> {
    const { clientId, clientSecret, tenantId } = this.cfg();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.msRefreshToken) {
      throw new BadRequestException('חשבון Outlook אינו מחובר — יש להתחבר תחילה');
    }

    const refreshToken = decryptSecret(user.msRefreshToken);
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: MicrosoftAuthService.SCOPES,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Token refresh failed for user ${userId}: ${detail}`);
      // Refresh token revoked/expired — clear it so the UI prompts a reconnect.
      await this.prisma.user
        .update({ where: { id: userId }, data: { msRefreshToken: null, msConnectedAt: null } })
        .catch(() => undefined);
      throw new BadRequestException('חיבור ה-Outlook פג תוקף — יש להתחבר מחדש');
    }

    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    // Microsoft rotates refresh tokens — persist the new one if present.
    if (data.refresh_token) {
      await this.prisma.user
        .update({ where: { id: userId }, data: { msRefreshToken: encryptSecret(data.refresh_token) } })
        .catch(() => undefined);
    }
    return data.access_token;
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { msRefreshToken: null, msEmail: null, msConnectedAt: null },
    });
  }

  async getStatus(userId: string): Promise<{ connected: boolean; email: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return { connected: !!user?.msRefreshToken, email: user?.msEmail ?? null };
  }

  private async fetchMailbox(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
      return me.mail || me.userPrincipalName || null;
    } catch {
      return null;
    }
  }
}
