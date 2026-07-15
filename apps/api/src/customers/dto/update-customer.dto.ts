import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Partial customer update — every field optional; service still whitelists before Prisma. */
export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() companyname?: string | null;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) services?: string[];
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() leadSource?: string | null;
  @IsOptional() @IsString() phone2?: string | null;
  @IsOptional() @IsString() phone3?: string | null;
  @IsOptional() @IsString() fax?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() companyRegNumber?: string | null;
  @IsOptional() @IsString() internalNotes?: string | null;
  @IsOptional() @Allow() balanceLegacy?: unknown;
  @IsOptional() @IsString() birthdayLegacy?: string | null;
  @IsOptional() @IsString() cityCodeLegacy?: string | null;
  @IsOptional() @IsString() zipLegacy?: string | null;
  @IsOptional() @IsString() legacyUpdatedAt?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;

  @IsOptional() @IsString() legacyAccountNumber?: string | null;
  @IsOptional() @IsString() legacySubClassificationCode?: string | null;
  @IsOptional() @IsString() salesRepresentative?: string | null;
  @IsOptional() @IsString() functionalLabel?: string | null;
  @IsOptional() @IsString() customerSize?: string | null;
  @IsOptional() @IsString() managementProfile?: string | null;
  @IsOptional() @IsString() countryOrRegion?: string | null;

  @IsOptional() @IsString() mailingAddress?: string | null;
  @IsOptional() @IsString() mailingCity?: string | null;
  @IsOptional() @IsString() mailingZip?: string | null;
  @IsOptional() @IsString() mailingPoBox?: string | null;
  @IsOptional() @IsString() mailingInvalidField?: string | null;
  @IsOptional() @IsBoolean() allowMail?: boolean | null;
  @IsOptional() @IsBoolean() allowFax?: boolean | null;
  @IsOptional() @IsBoolean() allowEmail?: boolean | null;
  @IsOptional() @IsBoolean() allowSms?: boolean | null;
  @IsOptional() @IsString() mailingNote?: string | null;

  @IsOptional() @IsString() registrationDate?: string | null;
  @IsOptional() @IsString() registrationNote?: string | null;
  @IsOptional() @IsString() lastUpdateDate?: string | null;
  @IsOptional() @IsString() lastUpdateNote?: string | null;
  @IsOptional() @IsString() lastUpdatedBy?: string | null;

  @IsOptional() @IsString() priceList?: string | null;
  @IsOptional() @IsString() roundedPricing?: string | null;
  @IsOptional() @IsString() employeeCount?: string | null;
  @IsOptional() @IsString() managementCustomerLabel?: string | null;
  @IsOptional() @IsString() financialNumber1?: string | null;
  @IsOptional() @IsString() financialNumber2?: string | null;
  @IsOptional() @IsString() financialNumber2Large?: string | null;
  @IsOptional() @IsString() financialNumber3?: string | null;
  @IsOptional() @IsString() financeToken?: string | null;
  @IsOptional() @IsString() financeTokenDate?: string | null;
  @IsOptional() @IsBoolean() financeTokenActive?: boolean | null;
  @IsOptional() @IsString() financeUnnamed1?: string | null;
  @IsOptional() @IsString() financeUnnamed2?: string | null;
  @IsOptional() @IsString() financeUnnamed3?: string | null;
  @IsOptional() @IsString() financeUnnamed4?: string | null;
  @IsOptional() @Allow() totalPurchases?: unknown;
  @IsOptional() @Allow() totalSales?: unknown;
  @IsOptional() @Allow() percentageValue?: unknown;
  @IsOptional() @IsString() paymentTerms?: string | null;
  @IsOptional() @IsString() creditDays?: string | null;
  @IsOptional() @IsBoolean() creditEnabled?: boolean | null;
  @IsOptional() @IsString() creditNumber?: string | null;
  @IsOptional() @IsString() creditExpiry?: string | null;

  @IsOptional() @IsString() microwaveModel?: string | null;
  @IsOptional() @IsString() detectorLocation?: string | null;
  @IsOptional() @IsString() companyAmount?: string | null;
  @IsOptional() @IsString() feature7?: string | null;
  @IsOptional() @IsString() detailDate1?: string | null;
  @IsOptional() @IsString() detailDate2?: string | null;
  @IsOptional() @IsString() detailDate3?: string | null;
  @IsOptional() @IsString() detailDate4?: string | null;
  @IsOptional() @IsString() detectorModel?: string | null;
  @IsOptional() @IsString() feature4?: string | null;
  @IsOptional() @IsString() companyWall?: string | null;
  @IsOptional() @IsString() feature8?: string | null;

  /** סיווג "לא רלוונטי" */
  @IsOptional() @IsString() notRelevantReason?: string | null;
  @IsOptional() @IsString() notRelevantNote?: string | null;
  @IsOptional() @IsString() notRelevantAt?: string | null;
}

export class ReferralSourceRowDto {
  @IsOptional() @IsString() date?: string | null;
  @IsOptional() @IsString() sourceName?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
}

export class ReplaceReferralSourcesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralSourceRowDto)
  items!: ReferralSourceRowDto[];
}

export class BlockRowDto {
  /** ערוץ חסום: MAILING / WHATSAPP / EMAIL / SMS */
  @IsString() channel!: string;
  @IsOptional() @IsString() reason?: string | null;
}

export class ReplaceBlocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockRowDto)
  items!: BlockRowDto[];
}

export class QuestionnaireRowDto {
  @IsOptional() @IsString() questionnaireCode?: string | null;
  @IsOptional() @IsString() questionnaireName?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
}

export class ReplaceQuestionnairesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireRowDto)
  items!: QuestionnaireRowDto[];
}

export class RelationRowDto {
  @IsOptional() @IsString() relatedCustomerName?: string | null;
  @IsOptional() @IsString() relationType?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
}

export class ReplaceRelationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelationRowDto)
  items!: RelationRowDto[];
}

export class AdditionalDataRowDto {
  @IsOptional() @IsString() numberValue?: string | null;
  @IsOptional() @IsString() dValue?: string | null;
  @IsOptional() @IsString() dateValue?: string | null;
  @IsOptional() @IsString() text1?: string | null;
  @IsOptional() @IsString() text2?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
}

export class ReplaceAdditionalDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalDataRowDto)
  items!: AdditionalDataRowDto[];
}

export class ExternalDataRowDto {
  @IsOptional() @IsString() colA?: string | null;
  @IsOptional() @IsString() colB?: string | null;
  @IsOptional() @IsString() colC?: string | null;
  @IsOptional() @IsString() colD?: string | null;
  @IsOptional() @IsString() colE?: string | null;
  @IsOptional() @IsString() colF?: string | null;
  @IsOptional() @IsString() colG?: string | null;
  @IsOptional() @IsString() colH?: string | null;
  @IsOptional() @IsString() colI?: string | null;
  @IsOptional() @IsString() colJ?: string | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
}

export class ReplaceExternalDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalDataRowDto)
  items!: ExternalDataRowDto[];
}

export class CreateCustomerDocumentDto {
  @IsString() name!: string;
  @IsOptional() @IsString() filePath?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() documentType?: string | null;
  @IsOptional() @IsString() documentDate?: string | null;
  @IsOptional() @IsString() mimeType?: string | null;
  @IsOptional() @IsNumber() sizeBytes?: number | null;
  @IsOptional() @IsString() importLegacyId?: string | null;
  /** תוכן הקובץ כ-base64 (ללא תחילית data:) — לאחסון בקובץ ב-DB */
  @IsOptional() @IsString() dataBase64?: string | null;
}

export class UpdateCustomerDocumentDto {
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() documentType?: string | null;
  @IsOptional() @IsString() documentDate?: string | null;
  @IsOptional() @IsString() mimeType?: string | null;
  @IsOptional() @IsNumber() sizeBytes?: number | null;
}
