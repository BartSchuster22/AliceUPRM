import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @Length(1, 128)
  externalUserId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  productRef?: string;

  @ValidateIf((o) => !o.productRef)
  @IsString()
  @Length(1, 128)
  plan?: string;

  @ValidateIf((o) => !o.productRef)
  @IsString()
  @Length(1, 255)
  productName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  productDescription?: string;

  @ValidateIf((o) => !o.productRef)
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @ValidateIf((o) => !o.productRef)
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ValidateIf((o) => !o.productRef)
  @IsIn(['month', 'year'])
  billingInterval?: 'month' | 'year';

  @IsString()
  @Length(8, 2048)
  successUrl!: string;

  @IsString()
  @Length(8, 2048)
  cancelUrl!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  referralCodeUsed?: string;
}
