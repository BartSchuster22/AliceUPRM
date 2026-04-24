import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
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

class OutboundWebhookEndpointDto {
  @IsString()
  @Length(1, 100)
  id!: string;

  @IsUrl({ require_tld: false }, { message: 'url must be a valid URL' })
  url!: string;

  @IsString()
  @Length(8, 255)
  secret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn(
    [
      'reward.created',
      'reward.approved',
      'refund.reversed',
      'wallet.balance.changed',
    ],
    {
      each: true,
    },
  )
  eventTypes!: Array<
    | 'reward.created'
    | 'reward.approved'
    | 'refund.reversed'
    | 'wallet.balance.changed'
  >;
}

class OutboundWebhookConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutboundWebhookEndpointDto)
  endpoints!: OutboundWebhookEndpointDto[];
}

export class UpdateTenantWebhookConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => StripeWebhookConfigDto)
  stripe?: StripeWebhookConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutboundWebhookConfigDto)
  outbound?: OutboundWebhookConfigDto;
}
