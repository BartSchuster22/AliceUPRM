import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PromoterApplicationLinkDto {
  @IsString()
  @Length(1, 64)
  linkType!: string;

  @IsString()
  @Length(8, 2048)
  url!: string;

  @IsOptional()
  @IsObject()
  proofJson?: Record<string, unknown>;
}

export class CreatePromoterApplicationDto {
  @IsUUID()
  tenantUserId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromoterApplicationLinkDto)
  links?: PromoterApplicationLinkDto[];
}
