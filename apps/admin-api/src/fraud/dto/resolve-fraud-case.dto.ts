import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveFraudCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
