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

  // חשבון OneDrive נפרד (uri@galit.co.il) — קבצים בלבד, ללא הרשאות דואר/יומן.
  // חשבון זה יכול להיות Microsoft שונה מ-Outlook; משמש רק לאחסון/עריכת הצעות מחיר ב-OneDrive.
  static readonly ONEDRIVE_SCOPES = 'offline_access User.Read Files.ReadWrite';

  // הודעת השגיאה כשאין חשבון OneDrive מחובר להמרת PDF. מזוהה ב-PdfConvertService כדי לא ליפול
  // חזרה ל-CloudConvert/חשבון הקורא אלא להעביר את השגיאה כמות שהיא (fail-with-clear-error).
  static readonly NO_ONEDRIVE_FOR_PDF =
    'לא מחובר חשבון OneDrive להמרת PDF. חבר "חשבון OneDrive נפרד" בהגדרות (מנהל) ונסה שוב.';

  constructor(private readonly prisma: PrismaService) {}

  private scopesFor(account: 'outlook' | 'onedrive'): string {
    return account === 'onedrive' ? MicrosoftAuthService.ONEDRIVE_SCOPES : MicrosoftAuthService.SCOPES;
  }

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

  /**
   * Build the Microsoft consent URL. `state` carries the CRM user id — and, for the separate
   * OneDrive account, an `od:` prefix — back to the callback.
   * `prompt=select_account` lets the user pick a *different* account than their Outlook login.
   */
  buildAuthUrl(userId: string, account: 'outlook' | 'onedrive' = 'outlook'): string {
    const { clientId, tenantId, redirectUri } = this.cfg();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: this.scopesFor(account),
      state: account === 'onedrive' ? `od:${userId}` : userId,
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange the auth code for tokens and persist the (encrypted) refresh token against the user.
   * The `state` may carry an `od:` prefix, meaning the separate OneDrive account (files only).
   */
  async handleCallback(code: string, state: string): Promise<{ email: string | null }> {
    const isOneDrive = state.startsWith('od:');
    const userId = isOneDrive ? state.slice(3) : state;
    const account: 'outlook' | 'onedrive' = isOneDrive ? 'onedrive' : 'outlook';
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
        scope: this.scopesFor(account),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Token exchange failed: ${detail}`);
      throw new BadRequestException(
        isOneDrive ? 'חיבור ל-OneDrive נכשל בעת קבלת ההרשאה' : 'חיבור ל-Outlook נכשל בעת קבלת ההרשאה',
      );
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
      data: isOneDrive
        ? {
            odRefreshToken: encryptSecret(data.refresh_token),
            odEmail: email,
            odConnectedAt: new Date(),
          }
        : {
            msRefreshToken: encryptSecret(data.refresh_token),
            msEmail: email,
            msConnectedAt: new Date(),
          },
    });

    return { email };
  }

  /** Mint a fresh access token for a connected user (Outlook account); rotates the stored refresh token. */
  async getAccessToken(userId: string): Promise<string> {
    return this.mintAccessToken(userId, 'outlook');
  }

  /**
   * Mint an access token for OneDrive file operations. If the user has connected a *separate*
   * OneDrive account, that account's token is used; otherwise it falls back to the Outlook account.
   * Lets an employee (e.g. Uri) store quote files in a OneDrive that isn't their login mailbox.
   */
  async getFilesAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.odRefreshToken) return this.mintAccessToken(userId, 'onedrive');
    return this.mintAccessToken(userId, 'outlook');
  }

  /**
   * Mint an access token for the ONE designated OneDrive account used for PDF conversion —
   * independent of whoever is calling. PDF rendering must always go through the connected
   * OneDrive account (the separate `od*` account, e.g. Uri's), NEVER through the calling
   * user's own Outlook/login account. We pick any user that has a separate OneDrive connected
   * (most-recently-connected wins if more than one). Throws a clear error if none is connected —
   * we deliberately do NOT fall back to the caller's account.
   */
  async getPdfConverterAccessToken(): Promise<{ token: string; userId: string }> {
    const owner = await this.prisma.user.findFirst({
      where: { odRefreshToken: { not: null } },
      orderBy: { odConnectedAt: 'desc' },
      select: { id: true },
    });
    if (!owner) {
      throw new BadRequestException(
        MicrosoftAuthService.NO_ONEDRIVE_FOR_PDF,
      );
    }
    const token = await this.mintAccessToken(owner.id, 'onedrive');
    return { token, userId: owner.id };
  }

  private async mintAccessToken(userId: string, account: 'outlook' | 'onedrive'): Promise<string> {
    const { clientId, clientSecret, tenantId } = this.cfg();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const stored = account === 'onedrive' ? user?.odRefreshToken : user?.msRefreshToken;
    if (!stored) {
      throw new BadRequestException(
        account === 'onedrive'
          ? 'חשבון OneDrive אינו מחובר — יש להתחבר תחילה'
          : 'חשבון Outlook אינו מחובר — יש להתחבר תחילה',
      );
    }

    const refreshToken = decryptSecret(stored);
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: this.scopesFor(account),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Token refresh failed for user ${userId} (${account}): ${detail}`);
      // Refresh token revoked/expired — clear it so the UI prompts a reconnect.
      await this.prisma.user
        .update({
          where: { id: userId },
          data:
            account === 'onedrive'
              ? { odRefreshToken: null, odConnectedAt: null }
              : { msRefreshToken: null, msConnectedAt: null },
        })
        .catch(() => undefined);
      throw new BadRequestException(
        account === 'onedrive'
          ? 'חיבור ה-OneDrive פג תוקף — יש להתחבר מחדש'
          : 'חיבור ה-Outlook פג תוקף — יש להתחבר מחדש',
      );
    }

    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    // Microsoft rotates refresh tokens — persist the new one if present.
    if (data.refresh_token) {
      await this.prisma.user
        .update({
          where: { id: userId },
          data:
            account === 'onedrive'
              ? { odRefreshToken: encryptSecret(data.refresh_token) }
              : { msRefreshToken: encryptSecret(data.refresh_token) },
        })
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

  /** Disconnect the separate OneDrive account (file operations fall back to the Outlook account). */
  async disconnectOneDrive(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { odRefreshToken: null, odEmail: null, odConnectedAt: null },
    });
  }

  async getOneDriveStatus(userId: string): Promise<{ connected: boolean; email: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return { connected: !!user?.odRefreshToken, email: user?.odEmail ?? null };
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
