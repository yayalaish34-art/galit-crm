import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesModule } from '../quotes/quotes.module';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { AffiliateModule } from '../affiliate/affiliate.module';

@Module({
  imports: [PrismaModule, QuotesModule, MicrosoftModule, AffiliateModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}

