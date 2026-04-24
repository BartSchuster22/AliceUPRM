import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { ADMIN_ROLES } from '../../auth/admin-auth.types';

export class UpsertAdminUserDto {
  @IsString()
  subject!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ADMIN_ROLES, { each: true })
  roles!: (typeof ADMIN_ROLES)[number][];
}
