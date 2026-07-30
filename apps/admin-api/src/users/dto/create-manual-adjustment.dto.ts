import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateManualAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @Matches(/^-?\d+$/)
  amountMinor!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsString()
  @IsNotEmpty()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
