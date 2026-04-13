import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EventsHistoryFilterDto {
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional() @IsString() @MaxLength(255) customer?: string;
  @IsOptional() @IsString() @MaxLength(255) contact?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() communicationFlag?: boolean;
  @IsOptional() @IsString() @MaxLength(255) activity?: string;
  @IsOptional() @IsString() @MaxLength(255) product?: string;
  @IsOptional() @IsString() @MaxLength(255) salesRep?: string;
  @IsOptional() @IsString() @MaxLength(255) executor?: string;
  @IsOptional() @IsString() @MaxLength(255) text?: string;
}

export class CreateEventHistoryDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) linkedCustomerId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) linkedCustomerName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(191) mobilePhone?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerPhone1?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerPhone2?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerPhone3?: string | null;
  @IsOptional() @IsString() @MaxLength(191) status?: string | null;
  @IsOptional() @IsDateString() date?: string | null;
  @IsOptional() @IsString() @MaxLength(32) time?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() @MaxLength(191) activityName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) productName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) salesRepresentativeName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) executorName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) sourceName?: string | null;
  @IsOptional() @IsString() @MaxLength(255) activityTreePath?: string | null;
  @IsOptional() @IsString() @MaxLength(255) productTreePath?: string | null;
  @IsOptional() @Type(() => Boolean) @IsBoolean() communicationFlag?: boolean | null;
}

export class UpdateEventHistoryDto extends CreateEventHistoryDto {}
