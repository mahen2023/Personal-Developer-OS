import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, type RequestContext } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { UsersService } from '../users/users.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../common/cookies';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  // Registration is the cheapest endpoint to abuse on a self-hosted box.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.register(dto.email, dto.name, dto.password, context(req));
    setAuthCookies(res, tokens, this.cookieConfig());
    return { user: tokens.user, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(dto.email, dto.password, context(req));
    setAuthCookies(res, tokens, this.cookieConfig());
    const user = await this.users.findByEmail(dto.email);
    return { user, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token =
      req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string })?.refreshToken;
    if (!token) throw new UnauthorizedException('Not signed in.');
    const tokens = await this.auth.refresh(token, context(req));
    setAuthCookies(res, tokens, this.cookieConfig());
    return { expiresIn: tokens.expiresIn };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], user.id, context(req));
    clearAuthCookies(res, this.cookieConfig());
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, context(req));
    clearAuthCookies(res, this.cookieConfig());
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.revokeSession(user.id, id, context(req));
  }

  @Post('change-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, context(req));
    clearAuthCookies(res, this.cookieConfig());
  }

  private cookieConfig() {
    return {
      secure: this.config.get<boolean>('auth.cookieSecure') ?? false,
      domain: this.config.get<string>('auth.cookieDomain') ?? 'localhost',
      accessTtl: this.config.get<string>('auth.accessTtl') ?? '15m',
      refreshTtl: this.config.get<string>('auth.refreshTtl') ?? '30d',
    };
  }
}

function context(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
