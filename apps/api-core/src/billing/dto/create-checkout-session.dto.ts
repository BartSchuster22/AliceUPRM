import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @Length(1, 128)
  externalUserId!: string;

  @IsString()
  @Length(1, 128)
  plan!: string;

  @IsString()
  @Length(1, 255)
  productName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  productDescription?: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsIn(['month', 'year'])
  billingInterval!: 'month' | 'year';

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
