import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * החלפת זהות Microsoft (מהתוסף, דרך Office-SSO/MSAL) ל-JWT של ה-CRM.
 * התוסף משיג id_token מ-Microsoft ושולח אותו; אנחנו מאמתים אותו מול Microsoft
 * (tokeninfo) ומזהים את עובד ה-CRM לפי msEmail/email. מנפיקים JWT קצר-טווח.
 */
@Injectable()
export class OutlookAuthService {
  private readonly logger = new Logger(OutlookAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * מאמת id_token של Microsoft מול Graph (/me) ומחזיר את כתובת המייל של הבעלים.
   * שימוש ב-Graph כ-source-of-truth נמנע מאימות חתימה ידני של ה-JWT.
   */
  private async resolveMicrosoftEmail(msAccessToken: string): Promise<string | null> {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${msAccessToken}` },
      });
      if (!res.ok) {
        this.logger.warn(`Graph /me failed: ${res.status}`);
        return null;
      }
      const me: any = await res.json();
      const email = (me?.mail || me?.userPrincipalName || '').toString().trim().toLowerCase();
      return email || null;
    } catch (e: any) {
      this.logger.warn(`resolveMicrosoftEmail failed: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * מקבל Microsoft access token (Bearer של Graph) מהתוסף, מזהה את העובד ומנפיק JWT של ה-CRM.
   * העובד מזוהה לפי User.msEmail או User.email (case-insensitive), חייב להיות ACTIVE.
   */
  async exchangeMicrosoftToken(msAccessToken: string): Promise<{ accessToken: string; user: { id: string; name: string; role: string; email: string } }> {
    if (!msAccessToken || msAccessToken.length < 20) {
      throw new UnauthorizedException('חסר טוקן Microsoft תקין');
    }
    const email = await this.resolveMicrosoftEmail(msAccessToken);
    if (!email) throw new UnauthorizedException('לא ניתן לאמת את זהות ה-Microsoft');

    const user = await this.prisma.user.findFirst({
      where: {
        status: 'ACTIVE' as any,
        OR: [
          { msEmail: { equals: email, mode: 'insensitive' } },
          { email: { equals: email, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, role: true, email: true },
    });
    if (!user) {
      // אין למפות משתמש Microsoft שאינו עובד CRM פעיל.
      throw new UnauthorizedException('המשתמש אינו מזוהה כעובד CRM פעיל');
    }

    // JWT קצר-טווח לתוסף (8 שעות) — נפרד מברירת המחדל של 30 יום ב-web.
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role, email: user.email, name: user.name },
      { expiresIn: '8h' },
    );
    return { accessToken, user };
  }
}
