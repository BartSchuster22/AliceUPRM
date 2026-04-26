import { IsOptional, IsString, Length } from 'class-validator';

export class ManualCreatePromoterDto {
  @IsString()
  @Length(1, 64)
  tenantId!: string;

  @IsString()
  @Length(1, 64)
  tenantUserId!: string;

  @IsString()
  @Length(1, 64)
  promoterStatus!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;
}
