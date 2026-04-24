import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ADMIN_ROLES } from '../../auth/admin-auth.types';

export class CreateLocalAdminUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ADMIN_ROLES, { each: true })
  roles!: (typeof ADMIN_ROLES)[number][];
}
