import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BootstrapTokenGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string> }>();
    const header = req.headers['authorization'] ?? '';
    const expected = this.config.get<string>('UPRM_ADMIN_BOOTSTRAP_TOKEN');
    if (!expected)
      throw new UnauthorizedException('bootstrap token not configured');

    const presented = header.replace(/^Bearer\s+/i, '').trim();
    if (!presented || presented !== expected) {
      throw new UnauthorizedException('invalid bootstrap token');
    }
    return true;
  }
}
