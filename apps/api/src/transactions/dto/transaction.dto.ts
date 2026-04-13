import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class TransactionJournalFilterDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsDateString()
  fromDeliveryDate?: string;

  @IsOptional()
  @IsDateString()
  toDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  text?: string;
}

export class CreateTransactionDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) number?: string | null;
  @IsOptional() @IsString() @MaxLength(191) status?: string | null;
  @IsOptional() @IsString() @MaxLength(191) workStatus?: string | null;
  @IsOptional() @IsString() @MaxLength(191) weekday?: string | null;
  @IsOptional() @IsDateString() date?: string | null;
  @IsOptional() @IsDateString() deliveryDate?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) linkedCustomerName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) transactionType?: string | null;
  @IsOptional() @IsString() @MaxLength(191) productName?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() price?: number | null;
  @IsOptional() @IsString() @MaxLength(191) deliveryLocation?: string | null;
  @IsOptional() @IsString() @MaxLength(191) coordinateDay?: string | null;
  @IsOptional() @IsString() @MaxLength(191) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(191) basketOrRefNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(191) stage?: string | null;
  @IsOptional() @IsString() @MaxLength(191) supplierName?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class UpdateTransactionDto extends CreateTransactionDto {}
