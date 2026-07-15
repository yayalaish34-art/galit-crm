import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Bridge to the WhatsApp-bot's voice assistant ("גלי").
 *
 * The bot owns the voice page + personal access tokens. This service asks the
 * bot (server-to-server, shared secret) for a personal /voice link for the
 * logged-in CRM user, so the CRM's "עוזרת קולית" button can open it already
 * identified — no manual link minting per employee.
 *
 * Config (Railway env):
 *   VOICE_BOT_BASE_URL   e.g. https://whatsapp-bot-tasks-management.onrender.com
 *   VOICE_LINK_SECRET    identical to the bot's VOICE_LINK_SECRET
 */
@Injectable()
export class VoiceAssistantService {
  private readonly logger = new Logger(VoiceAssistantService.name);
  private readonly TIMEOUT_MS = 10_000;

  private botBase(): string | null {
    const raw = (process.env.VOICE_BOT_BASE_URL ?? '').trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  private secret(): string | null {
    const raw = (process.env.VOICE_LINK_SECRET ?? '').trim();
    return raw || null;
  }

  /** True when the bridge is configured (button is shown only then). */
  isConfigured(): boolean {
    return this.botBase() !== null && this.secret() !== null;
  }

  /**
   * Get a personal voice-assistant link for `userId` (the logged-in CRM user).
   * Returns { url, name }. Throws ServiceUnavailable on any bridge failure so
   * the frontend shows a friendly Hebrew message rather than a broken link.
   */
  async getPersonalLink(userId: string): Promise<{ url: string; name: string }> {
    const base = this.botBase();
    const secret = this.secret();
    if (!base || !secret) {
      throw new ServiceUnavailableException('העוזרת הקולית אינה מוגדרת בשרת');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/voice/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-voice-link-secret': secret,
        },
        body: JSON.stringify({ userId, label: 'CRM' }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`voice/link failed: HTTP ${res.status}`);
        throw new ServiceUnavailableException('לא הצלחתי לפתוח את העוזרת הקולית כרגע');
      }
      const data = (await res.json()) as { url?: string; name?: string };
      if (!data.url) {
        throw new ServiceUnavailableException('לא הצלחתי לפתוח את העוזרת הקולית כרגע');
      }
      return { url: data.url, name: data.name ?? '' };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`voice/link error: ${(err as Error).message}`);
      throw new ServiceUnavailableException('לא הצלחתי לפתוח את העוזרת הקולית כרגע');
    } finally {
      clearTimeout(timer);
    }
  }
}
