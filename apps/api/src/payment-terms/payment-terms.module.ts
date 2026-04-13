import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentTermsController } from './payment-terms.controller';
import { PaymentTermsService } from './payment-terms.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService],
})
export class PaymentTermsModule {}
