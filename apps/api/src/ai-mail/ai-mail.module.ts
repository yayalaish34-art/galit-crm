import { Module } from '@nestjs/common';
import { AiMailController } from './ai-mail.controller';
import { AiMailService } from './ai-mail.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiMailController],
  providers: [AiMailService],
})
export class AiMailModule {}
