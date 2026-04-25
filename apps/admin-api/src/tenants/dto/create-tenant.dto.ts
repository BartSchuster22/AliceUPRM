import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with dashes',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTenantId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTenantUserId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 160)
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  ownerExternalUserId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  ownerUsername?: string;
}
