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
}
