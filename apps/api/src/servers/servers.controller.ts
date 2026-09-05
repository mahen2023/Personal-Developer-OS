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
import { ServersService } from './servers.service';
import { CreateServerDto, ServerQueryDto, UpdateServerDto } from './servers.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('servers')
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ServerQueryDto) {
    return this.servers.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServerDto) {
    return this.servers.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.servers.get(user.id, id);
  }

  /** Returns the ssh command as text. Nothing is ever connected or executed. */
  @Get(':id/ssh')
  ssh(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.servers.sshCommand(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServerDto,
  ) {
    return this.servers.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.servers.remove(user.id, id);
  }
}
