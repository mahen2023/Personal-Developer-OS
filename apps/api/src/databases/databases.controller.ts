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
import { DatabasesService } from './databases.service';
import { CreateDatabaseDto, DatabaseQueryDto, UpdateDatabaseDto } from './databases.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('databases')
@Controller('databases')
export class DatabasesController {
  constructor(private readonly databases: DatabasesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: DatabaseQueryDto) {
    return this.databases.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDatabaseDto) {
    return this.databases.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.databases.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDatabaseDto,
  ) {
    return this.databases.update(user.id, id, dto);
  }

  /** Records that a backup happened, so the dashboard stops warning about it. */
  @Post(':id/backed-up')
  @HttpCode(200)
  markBackedUp(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.databases.markBackedUp(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.databases.remove(user.id, id);
  }
}
