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
import { IdeasService } from './ideas.service';
import { CreateIdeaDto, IdeaQueryDto, UpdateIdeaDto } from './ideas.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('ideas')
@Controller('ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: IdeaQueryDto) {
    return this.ideas.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIdeaDto) {
    return this.ideas.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ideas.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIdeaDto,
  ) {
    return this.ideas.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.ideas.remove(user.id, id);
  }
}
