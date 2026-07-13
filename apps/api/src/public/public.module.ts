import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { ReviewsModule } from '../reviews/reviews.module';

// PrismaService זמין גלובלית (PrismaModule הוא @Global)
@Module({
  imports: [ReviewsModule],
  controllers: [PublicController],
})
export class PublicModule {}
