import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EnvironmentsService } from './environments.service';
import {
  CreateEnvironmentDto,
  EnvironmentQueryDto,
  UpdateEnvironmentDto,
  UpsertVariableDto,
} from './environments.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('environments')
@Controller('environments')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: EnvironmentQueryDto) {
    return this.environments.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEnvironmentDto) {
    return this.environments.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.environments.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnvironmentDto,
  ) {
    return this.environments.update(user.id, id, dto);
  }

  @Put(':id/variables')
  @HttpCode(200)
  upsertVariable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertVariableDto,
  ) {
    return this.environments.upsertVariable(user.id, id, dto);
  }

  @Delete(':id/variables/:variableId')
  removeVariable(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variableId', ParseUUIDPipe) variableId: string,
  ) {
    return this.environments.removeVariable(user.id, id, variableId);
  }

  /** A .env skeleton with secrets left as vault references, never values. */
  @Get(':id/template')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  template(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.environments.exportTemplate(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.environments.remove(user.id, id);
  }
}
