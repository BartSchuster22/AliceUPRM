import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class OpenSettlementCycleDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;
}