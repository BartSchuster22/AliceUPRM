import { IsString } from 'class-validator';

export class UserDetailQueryDto {
  @IsString()
  tenantId!: string;
}
