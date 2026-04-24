import { Body, Controller, Post } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.authenticateWithPassword(
      dto.email,
      dto.password,
    );
    return {
      access_token: result.token,
      token_type: 'Bearer',
      expires_in_seconds: 43200,
      admin: {
        id: result.admin.adminUserId,
        subject: result.admin.subject,
        email: result.admin.email,
        display_name: result.admin.displayName,
        roles: result.admin.roles,
      },
    };
  }
}
