import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListWebhookDeliveriesQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'delivering', 'retrying', 'delivered', 'dead_letter'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'reward.created',
    'reward.approved',
    'refund.reversed',
    'wallet.balance.changed',
  ])
  eventType?: string;
}
