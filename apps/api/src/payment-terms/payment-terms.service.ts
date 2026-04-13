import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.paymentTerm.findMany({ orderBy: { label: 'asc' } });
  }

  async create(dto: CreatePaymentTermDto) {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('label required');
    const existing = await this.prisma.paymentTerm.findUnique({ where: { label } });
    if (existing) return existing;
    return this.prisma.paymentTerm.create({ data: { label } });
  }
}
