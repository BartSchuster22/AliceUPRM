import { IsObject, IsOptional } from 'class-validator';

export class UpdateTenantConfigDto {
  @IsOptional()
  @IsObject()
  rewardConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  promoterConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  fraudConfig?: Record<string, unknown>;
}
