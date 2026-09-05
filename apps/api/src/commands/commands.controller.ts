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
import { CommandsService } from './commands.service';
import { CreateCommandDto, CommandQueryDto, UpdateCommandDto } from './commands.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('commands')
@Controller('commands')
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: CommandQueryDto) {
    return this.commands.list(user.id, dto);
  }

  /** Categories actually in use, so the filter needs no fixed list. */
  @Get('categories')
  categories(@CurrentUser() user: AuthUser) {
    return this.commands.categories(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommandDto) {
    return this.commands.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.commands.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommandDto,
  ) {
    return this.commands.update(user.id, id, dto);
  }

  /** Counts a copy — the signal that this one is worth keeping near the top. */
  @Post(':id/used')
  @HttpCode(200)
  markUsed(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.commands.markUsed(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.commands.remove(user.id, id);
  }
}
