import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { ACCESS_COOKIE } from '../cookies';

/**
 * Applied globally (see AppModule APP_GUARD) so a new controller is protected
 * by default and has to opt out with @Public() — the safe direction to forget.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest<Request>();
    // Bearer for scripts and the CLI; httpOnly cookie for the web app, which
    // never has to hold a token in JavaScript-readable storage.
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (request.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in.');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; sid: string }>(
        token,
        {
          secret: this.config.get<string>('auth.accessSecret'),
        },
      );
      (request as Request & { user: AuthUser }).user = {
        id: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
  }
}
