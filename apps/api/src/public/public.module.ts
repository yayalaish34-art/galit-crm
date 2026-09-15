import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { ReviewsModule } from '../reviews/reviews.module';
import { CallRecordingsModule } from '../call-recordings/call-recordings.module';

// PrismaService זמין גלובלית (PrismaModule הוא @Global)
@Module({
  imports: [ReviewsModule, CallRecordingsModule],
  controllers: [PublicController],
})
export class PublicModule {}
