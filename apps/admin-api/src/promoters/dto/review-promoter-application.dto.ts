import { IsOptional, IsString, Length } from 'class-validator';

export class ReviewPromoterApplicationDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  promoterStatus?: string;
}
