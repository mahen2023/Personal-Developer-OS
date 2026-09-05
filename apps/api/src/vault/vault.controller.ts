import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VaultService } from './vault.service';
import {
  CreateVaultItemDto,
  SetupVaultDto,
  UnlockVaultDto,
  UpdateVaultItemDto,
  VaultQueryDto,
  VaultSettingsDto,
} from './vault.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

/**
 * The unlock token travels in a header rather than a cookie: it must never be
 * attached automatically to a request the user did not intend, which is
 * exactly what cookies do.
 */
const UNLOCK_HEADER = 'x-vault-token';

@ApiTags('vault')
@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  /* ── profile ─────────────────────────────────────────────────────────────── */

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.vault.status(user.id);
  }

  /** KDF parameters for a new profile. The salt is generated server-side. */
  @Get('kdf-params')
  kdfParams() {
    return this.vault.freshSalt();
  }

  @Post('setup')
  @HttpCode(200)
  setup(@CurrentUser() user: AuthUser, @Body() dto: SetupVaultDto, @Req() req: Request) {
    return this.vault.setup(user.id, dto, context(req));
  }

  /**
   * Deliberately the tightest limit in the application. Every attempt costs an
   * Argon2id derivation in the browser, so a human never hits this; a script
   * hits it immediately.
   */
  @Post('unlock')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  unlock(@CurrentUser() user: AuthUser, @Body() dto: UnlockVaultDto, @Req() req: Request) {
    return this.vault.unlock(user.id, dto, context(req));
  }

  @Post('lock')
  @HttpCode(204)
  lock(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    return this.vault.lock(user.id, context(req));
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: VaultSettingsDto) {
    return this.vault.updateSettings(user.id, dto.autoLockMinutes, dto.clipboardSeconds);
  }

  /** Security-sensitive events, values never included (§67). */
  @Get('audit')
  audit(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.vault.auditLog(user.id, dto);
  }

  /* ── items ───────────────────────────────────────────────────────────────── */

  /** Metadata only — safe to call while the vault is locked. */
  @Get('items')
  list(@CurrentUser() user: AuthUser, @Query() dto: VaultQueryDto) {
    return this.vault.list(user.id, dto);
  }

  @Post('items')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVaultItemDto,
    @Headers(UNLOCK_HEADER) unlockToken: string | undefined,
    @Req() req: Request,
  ) {
    return this.vault.create(user.id, dto, unlockToken, context(req));
  }

  @Get('items/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vault.get(user.id, id);
  }

  /** The only route that returns ciphertext. Requires an unlocked vault. */
  @Get('items/:id/reveal')
  reveal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(UNLOCK_HEADER) unlockToken: string | undefined,
    @Req() req: Request,
  ) {
    return this.vault.reveal(user.id, id, unlockToken, context(req));
  }

  @Patch('items/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVaultItemDto,
    @Headers(UNLOCK_HEADER) unlockToken: string | undefined,
    @Req() req: Request,
  ) {
    return this.vault.update(user.id, id, dto, unlockToken, context(req));
  }

  @Delete('items/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(UNLOCK_HEADER) unlockToken: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    return this.vault.remove(user.id, id, unlockToken, context(req));
  }
}

function context(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
