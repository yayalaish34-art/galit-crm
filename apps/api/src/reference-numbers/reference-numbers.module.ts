import { Module } from '@nestjs/common';
import { ReferenceNumbersService } from './reference-numbers.service';
import { ReferenceNumbersInternalController } from './reference-numbers.controller';

@Module({
  controllers: [ReferenceNumbersInternalController],
  providers: [ReferenceNumbersService],
  exports: [ReferenceNumbersService],
})
export class ReferenceNumbersModule {}
