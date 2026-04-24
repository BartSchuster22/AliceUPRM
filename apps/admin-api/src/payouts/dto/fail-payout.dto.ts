import { IsOptional, IsString, Length } from 'class-validator';

export class FailPayoutDto {
  @IsOptional()
  @IsString()
  @Length(1, 256)
  reason?: string;
}
