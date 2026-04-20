import { IsString, IsUUID, Length } from 'class-validator';

export class ApplyCodeDto {
  @IsUUID()
  referredTenantUserId!: string;

  @IsString()
  @Length(1, 32)
  code!: string;
}
