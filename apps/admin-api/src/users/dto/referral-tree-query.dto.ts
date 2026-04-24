import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReferralTreeQueryDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  depth?: number;
}
