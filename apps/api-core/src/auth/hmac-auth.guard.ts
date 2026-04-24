import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantService, TenantAuthError } from '@uprm/tenants';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly svc = new TenantService();

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      method: string;
      url: string;
      headers: Record<string, string>;
      rawBody?: Buffer;
      body?: unknown;
      [k: string]: unknown;
    }>();

    const header = req.headers['authorization'] ?? '';
    if (!header)
      throw new UnauthorizedException('missing Authorization header');

    const bodyString =
      req.rawBody instanceof Buffer
        ? req.rawBody.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : req.body
            ? JSON.stringify(req.body)
            : '';

    try {
      const verified = await this.svc.verifySignedRequest({
        method: req.method,
        path: req.url,
        body: bodyString,
        header,
      });
      (req as any).uprm = verified;
      return true;
    } catch (e) {
      if (e instanceof TenantAuthError) {
        throw new UnauthorizedException({ code: e.code, message: e.message });
      }
      throw e;
    }
  }
}
