import { IsString, IsUUID, IsOptional, IsISO8601 } from 'class-validator';

export class CreateCodeDto {
  @IsUUID()
  tenantUserId!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
