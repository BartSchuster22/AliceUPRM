import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class StripeWebhookConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Length(8, 255)
  webhookSecret!: string;

  @IsOptional()
  @IsIn(['test', 'live'])
  mode?: 'test' | 'live';

  @IsOptional()
  @IsString()
  @Length(3, 3)
  defaultCurrency?: string;
}

export class UpdateTenantWebhookConfigDto {
  @ValidateNested()
  @Type(() => StripeWebhookConfigDto)
  stripe!: StripeWebhookConfigDto;
}
