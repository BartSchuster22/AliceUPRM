import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { BootstrapTokenGuard } from './bootstrap-token.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    Reflector,
    AdminAuthService,
    AdminJwtGuard,
    RolesGuard,
    BootstrapTokenGuard,
  ],
  exports: [AdminAuthService, AdminJwtGuard, RolesGuard, BootstrapTokenGuard],
})
export class AuthModule {}
