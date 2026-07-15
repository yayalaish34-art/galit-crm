import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { VoiceAssistantService } from './voice-assistant.service';

/**
 * CRM-facing endpoints for the voice assistant button.
 *   GET /voice-assistant/status  → { available } (should the button show?)
 *   GET /voice-assistant/link    → { url, name } personal link for req.user
 *
 * Guarded like the rest of the CRM (JWT via RolesGuard); the link is minted
 * for the CURRENTLY LOGGED-IN user only (req.user.id) — a user can never
 * request someone else's link.
 */
@Controller('voice-assistant')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN', 'EXPERT', 'BILLING')
export class VoiceAssistantController {
  constructor(private readonly voice: VoiceAssistantService) {}

  @Get('status')
  status() {
    return { available: this.voice.isConfigured() };
  }

  @Get('link')
  getLink(@Req() req: any) {
    return this.voice.getPersonalLink(req.user.id);
  }
}
