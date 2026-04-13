import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class InquiryFilterDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  text?: string;
}

export class InquiryJournalFilterDto extends InquiryFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  salesRep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  status?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isClosed?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isUrgent?: boolean;
}

export class CreateInquiryDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  importLegacyId?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsDateString()
  date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  time?: string | null;

  @IsOptional()
  @IsDateString()
  trackingDate?: string | null;

  @IsOptional()
  @IsDateString()
  receivedDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  hour?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  customerName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  customerCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  productCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  contactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  salesRepresentativeName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  status?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  inquiryDuration?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  homePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  mobilePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  workPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  hValue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  productName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  faultCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  eValue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  dValue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  treatmentCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  handlerName?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  followUp?: boolean | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOpen?: boolean | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isClosed?: boolean | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isUrgent?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  campaignName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  operationName?: string | null;

  @IsOptional()
  @IsString()
  lastStatusNotes?: string | null;

  @IsOptional()
  @IsString()
  faultDescription?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateInquiryDto extends CreateInquiryDto {}
