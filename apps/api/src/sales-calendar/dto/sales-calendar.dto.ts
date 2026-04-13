import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SalesCalendarFilterDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  viewMode?: string;

  @IsOptional()
  @IsUUID()
  salesRepresentativeId?: string;
}

export class CreateSalesCalendarEntryDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @IsUUID() salesRepresentativeId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) salesRepresentativeName?: string | null;
  @IsOptional() @IsDateString() date?: string | null;
  @IsOptional() @IsString() @MaxLength(32) startTime?: string | null;
  @IsOptional() @IsString() @MaxLength(32) endTime?: string | null;
  @IsOptional() @IsString() @MaxLength(191) title?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerName?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() @MaxLength(64) entryType?: string | null;
  @IsOptional() @IsString() @MaxLength(64) relatedEntityType?: string | null;
  @IsOptional() @IsString() @MaxLength(191) relatedEntityId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) status?: string | null;
}

export class UpdateSalesCalendarEntryDto extends CreateSalesCalendarEntryDto {}
