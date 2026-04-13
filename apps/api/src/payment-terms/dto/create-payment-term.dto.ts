import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePaymentTermDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;
}
