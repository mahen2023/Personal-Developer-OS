import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('activity')
@Controller('activities')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() dto: PaginationDto,
    @Query('projectId') projectId?: string,
  ) {
    return this.activity.list(user.id, dto, projectId);
  }
}
