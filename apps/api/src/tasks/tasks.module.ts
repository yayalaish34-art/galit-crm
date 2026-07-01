import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesModule } from '../quotes/quotes.module';

@Module({
  imports: [PrismaModule, QuotesModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}

