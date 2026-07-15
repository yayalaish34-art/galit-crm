import { Module } from '@nestjs/common';
import { VoiceAssistantController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';

@Module({
  controllers: [VoiceAssistantController],
  providers: [VoiceAssistantService],
})
export class VoiceAssistantModule {}
