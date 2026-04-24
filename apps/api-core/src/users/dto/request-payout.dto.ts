import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class RequestPayoutDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @Length(2, 64)
  payoutMethod!: string;

  @IsObject()
  destination!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  destinationCurrency?: string;
}
