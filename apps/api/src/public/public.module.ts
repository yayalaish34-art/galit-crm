import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';

// PrismaService זמין גלובלית (PrismaModule הוא @Global)
@Module({
  controllers: [PublicController],
})
export class PublicModule {}
