import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationKind } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { NotificationPreferencesDto, NotificationQueryDto } from './notifications.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: NotificationQueryDto) {
    return this.notifications.list(user.id, dto);
  }

  /** Every kind that exists, so the settings screen has nothing hard-coded. */
  @Get('preferences')
  async preferences(@CurrentUser() user: AuthUser) {
    return {
      ...(await this.notifications.preferencesFor(user.id)),
      kinds: Object.values(NotificationKind),
    };
  }

  @Patch('preferences')
  async setPreferences(@CurrentUser() user: AuthUser, @Body() dto: NotificationPreferencesDto) {
    const current = await this.notifications.preferencesFor(user.id);
    await this.users.updateSettings(user.id, { notifications: { ...current, ...dto } });
    return this.notifications.preferencesFor(user.id);
  }

  @Patch('read')
  async markAllRead(@CurrentUser() user: AuthUser) {
    return { read: await this.notifications.markAllRead(user.id) };
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Delete(':id')
  dismiss(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.dismiss(user.id, id);
  }
}
