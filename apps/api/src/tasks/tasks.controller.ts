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
import { TasksService } from './tasks.service';
import { CreateTaskDto, MoveTaskDto, TaskQueryDto, UpdateTaskDto } from './tasks.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: TaskQueryDto) {
    return this.tasks.list(user.id, dto);
  }

  // Three views over the same filter set (§13) — kanban is not the only one.
  @Get('board')
  board(@CurrentUser() user: AuthUser, @Query() dto: TaskQueryDto) {
    return this.tasks.board(user.id, dto);
  }

  @Get('timeline')
  timeline(@CurrentUser() user: AuthUser, @Query() dto: TaskQueryDto) {
    return this.tasks.timeline(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user.id, id, dto);
  }

  @Patch(':id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tasks.remove(user.id, id);
  }
}
