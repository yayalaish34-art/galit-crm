import { Module } from '@nestjs/common';
import { AiMailController } from './ai-mail.controller';
import { AiMailService } from './ai-mail.service';

@Module({
  controllers: [AiMailController],
  providers: [AiMailService],
})
export class AiMailModule {}
