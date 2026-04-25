import { IsString, IsEmail, IsOptional, Length } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  externalUserId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  username?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTenantUserId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTenantId?: string;
}
