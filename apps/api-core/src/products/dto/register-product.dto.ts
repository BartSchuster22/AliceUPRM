import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class RegisterProductDto {
  @IsString()
  @Length(1, 128)
  ref!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  plan?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  productDescription?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  priceDescription?: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsIn(['month', 'year'])
  billingInterval!: 'month' | 'year';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
