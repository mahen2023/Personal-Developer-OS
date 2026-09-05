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
import { LearningService } from './learning.service';
import { CreateLearningDto, LearningQueryDto, UpdateLearningDto } from './learning.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('learning')
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: LearningQueryDto) {
    return this.learning.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLearningDto) {
    return this.learning.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLearningDto,
  ) {
    return this.learning.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.learning.remove(user.id, id);
  }
}
