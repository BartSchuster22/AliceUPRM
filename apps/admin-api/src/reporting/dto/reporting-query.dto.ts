import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class ReportingQueryDto {
  @IsString()
  tenantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;
}
