import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import type { AdminRequestLike } from './admin-auth.types';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequestLike>();
    request.admin = await this.auth.authenticateAuthorizationHeader(
      request.headers.authorization,
    );
    return true;
  }
}
