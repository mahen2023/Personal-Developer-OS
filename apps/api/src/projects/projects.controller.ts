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
import { ProjectsService } from './projects.service';
import { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './projects.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ProjectQueryDto) {
    return this.projects.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  // `:key` is a slug or an id — the UI uses slugs, integrations use ids.
  @Get(':key')
  get(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.projects.get(user.id, key);
  }

  @Get(':key/workspace')
  workspace(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.projects.workspace(user.id, key);
  }

  @Get(':key/graph')
  graph(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.projects.graph(user.id, key);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.projects.remove(user.id, id);
  }
}
