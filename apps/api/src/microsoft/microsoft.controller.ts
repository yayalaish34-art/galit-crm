import { BadRequestException, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { MicrosoftAuthService } from './microsoft-auth.service';

@Controller('auth/microsoft')
export class MicrosoftController {
  constructor(private readonly auth: MicrosoftAuthService) {}

  /** Status of the current user's Outlook connection (for the UI button). */
  @Get('status')
  status(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return this.auth.getStatus(userId);
  }

  /**
   * Returns the Microsoft consent URL. The frontend opens it (popup/redirect).
   * We pass the URL back as JSON rather than redirecting so the SPA controls the flow.
   */
  @Get('login')
  login(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    return { url: this.auth.buildAuthUrl(userId) };
  }

  /**
   * OAuth redirect target (must match GRAPH_REDIRECT_URI in Azure).
   * `state` is the CRM user id. Renders a tiny page that closes the popup.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).send(this.closePage(`חיבור נכשל: ${errorDescription || error}`, false));
    }
    if (!code || !state) {
      return res.status(400).send(this.closePage('בקשה לא תקינה', false));
    }
    try {
      const { email } = await this.auth.handleCallback(code, state);
      return res.send(this.closePage(`Outlook חובר בהצלחה${email ? ' (' + email + ')' : ''}`, true));
    } catch (e: any) {
      return res.status(400).send(this.closePage(e?.message || 'חיבור נכשל', false));
    }
  }

  @Post('disconnect')
  async disconnect(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new BadRequestException('Missing x-user-id');
    await this.auth.disconnect(userId);
    return { success: true };
  }

  /** Minimal HTML that notifies the opener and closes the popup. */
  private closePage(message: string, success: boolean): string {
    const safe = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>Outlook</title><style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a}.card{text-align:center;padding:28px 36px;border-radius:14px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}.ic{font-size:40px}</style></head>
<body><div class="card"><div class="ic">${success ? '✅' : '⚠️'}</div><p>${safe}</p><p style="color:#64748b;font-size:13px">ניתן לסגור חלון זה</p></div>
<script>try{window.opener&&window.opener.postMessage({type:'ms-auth',success:${success}},'*');}catch(e){}setTimeout(function(){window.close();},${success ? 1500 : 4000});</script>
</body></html>`;
  }
}
