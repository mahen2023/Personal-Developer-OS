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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import {
  ActionItemsDto,
  CreateMeetingDto,
  MeetingQueryDto,
  UpdateMeetingDto,
} from './meetings.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('meetings')
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: MeetingQueryDto) {
    return this.meetings.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetings.update(user.id, id, dto);
  }

  /** Turns action items into real tasks, linked back to this meeting. */
  @Post(':id/action-items')
  @HttpCode(200)
  addActionItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActionItemsDto,
  ) {
    return this.meetings.addActionItems(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.meetings.remove(user.id, id);
  }
}
