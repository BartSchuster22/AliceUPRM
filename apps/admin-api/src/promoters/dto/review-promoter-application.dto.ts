import { IsOptional, IsString, Length } from 'class-validator';

export class ReviewPromoterApplicationDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;
}
