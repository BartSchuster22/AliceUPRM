import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UserDetailQueryDto {
  @IsString()
  tenantId!: string;
}
