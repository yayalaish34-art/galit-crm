import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesModule } from '../quotes/quotes.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { PreVisitEmailService } from './pre-visit-email.service';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [PrismaModule, QuotesModule, MicrosoftModule, AffiliateModule, ReviewsModule],
  controllers: [TasksController],
  providers: [TasksService, PreVisitEmailService],
})
export class TasksModule {}

