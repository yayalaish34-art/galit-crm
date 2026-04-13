import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class OrdersFilterDto {
  @IsOptional() @IsString() @MaxLength(255) customer?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional() @IsString() @MaxLength(191) status?: string;
}

export class CreateCustomerOrderDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerName?: string | null;
  @IsOptional() @IsDateString() orderDate?: string | null;
  @IsOptional() @IsDateString() followupDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) status?: string | null;
  @IsOptional() @IsString() @MaxLength(191) salesRepresentativeName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) executorName?: string | null;
  @IsOptional() @IsString() @MaxLength(191) linkedEntityId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) parentOrderId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) priceList?: string | null;
  @IsOptional() @IsString() @MaxLength(191) currencyOrReadyStatus?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() exchangeRate?: number | null;
  @IsOptional() @IsString() @MaxLength(191) quoteReference?: string | null;
  @IsOptional() @IsString() @MaxLength(255) addressSummary?: string | null;
  @IsOptional() @IsString() @MaxLength(191) phoneSummary?: string | null;
  @IsOptional() @IsString() @MaxLength(191) faxSummary?: string | null;
  @IsOptional() @IsString() @MaxLength(191) customerTypeSummary?: string | null;
  @IsOptional() @IsString() @MaxLength(191) accountingNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(191) companyRegNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(255) supplyAddressUntil?: string | null;
  @IsOptional() @IsString() @MaxLength(191) supplyPhone?: string | null;
  @IsOptional() @IsDateString() supplyDate?: string | null;
  @IsOptional() @IsDateString() firstDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() internalNotes?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber() extraCost?: number | null;
  @IsOptional() @IsString() @MaxLength(191) orderSource?: string | null;
  @IsOptional() @IsString() @MaxLength(191) lastUpdatedBy?: string | null;
  @IsOptional() @Type(() => Boolean) @IsBoolean() confirmationSent?: boolean | null;
  @IsOptional() @IsDateString() lastUpdatedAtLegacy?: string | null;
  @IsOptional() @IsString() @MaxLength(32) lastUpdatedTime?: string | null;

  @IsOptional() @IsString() @MaxLength(191) billingSettings?: string | null;
  @IsOptional() @IsDateString() nextBillingDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) billingStatus?: string | null;
  @IsOptional() @IsDateString() billingFromDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) recurringChargesCount?: string | null;
  @IsOptional() @IsString() @MaxLength(191) billingEndMode?: string | null;
  @IsOptional() @IsString() @MaxLength(191) billingAfterValue?: string | null;

  @IsOptional() @IsString() @MaxLength(191) accountingReceiptNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(191) accountingInvoiceNumber?: string | null;
  @IsOptional() @IsDateString() accountingTransferDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) accountingStatus?: string | null;
  @IsOptional() @IsDateString() nextAccountingTransferDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) accountingCategory?: string | null;
  @IsOptional() @IsString() accountingReferenceText?: string | null;
}

export class UpdateCustomerOrderDto extends CreateCustomerOrderDto {}

export class CreateOrderItemDto {
  @IsOptional() @Type(() => Number) @IsNumber() rowOrder?: number | null;
  @IsOptional() @IsString() @MaxLength(191) productCode?: string | null;
  @IsOptional() @IsString() @MaxLength(191) sku?: string | null;
  @IsOptional() @IsString() productDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(191) distributionChannel?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() price?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() discountPercent?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() total?: number | null;
}

export class UpdateOrderItemDto extends CreateOrderItemDto {}

export class CreateOrderDocumentDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() rowOrder?: number | null;
  @IsOptional() @IsString() documentDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(191) documentType?: string | null;
  @IsOptional() @IsString() @MaxLength(191) fileName?: string | null;
  @IsOptional() @IsString() filePath?: string | null;
  @IsOptional() @IsDateString() documentDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) uploadedBy?: string | null;
}

export class UpdateOrderDocumentDto extends CreateOrderDocumentDto {}

export class CreateOrderChargeTransactionDto {
  @IsOptional() @IsString() @MaxLength(191) importLegacyId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() rowOrder?: number | null;
  @IsOptional() @IsString() @MaxLength(191) periodNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(191) approvalNumber?: string | null;
  @IsOptional() @IsDateString() chargeDate?: string | null;
  @IsOptional() @IsString() @MaxLength(191) billingMethod?: string | null;
  @IsOptional() @IsString() @MaxLength(191) transactionType?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() chargeAmount?: number | null;
}

export class UpdateOrderChargeTransactionDto extends CreateOrderChargeTransactionDto {}
