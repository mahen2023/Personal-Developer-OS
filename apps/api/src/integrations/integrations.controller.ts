import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IntegrationProvider } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { ConnectDto, ToggleDto } from './integrations.dto';
import { ParseEnumPipe } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.integrations.list(user.id);
  }

  /**
   * Connecting calls the provider, so it is rate limited harder than an
   * ordinary write: a loop here would look like credential stuffing from the
   * provider's side and get the account flagged.
   */
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectDto) {
    return this.integrations.connect(user.id, dto.provider, dto.token);
  }

  @Post(':provider/test')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider,
  ) {
    return this.integrations.test(user.id, provider);
  }

  @Post(':provider/sync')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sync(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider,
  ) {
    return this.integrations.sync(user.id, provider);
  }

  @Patch(':provider')
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider,
    @Body() dto: ToggleDto,
  ) {
    return this.integrations.setEnabled(user.id, provider, dto.isEnabled);
  }

  @Delete(':provider')
  disconnect(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ParseEnumPipe(IntegrationProvider)) provider: IntegrationProvider,
  ) {
    return this.integrations.disconnect(user.id, provider);
  }
}
