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
import { SnippetsService } from './snippets.service';
import { CreateSnippetDto, SnippetQueryDto, UpdateSnippetDto } from './snippets.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('snippets')
@Controller('snippets')
export class SnippetsController {
  constructor(private readonly snippets: SnippetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: SnippetQueryDto) {
    return this.snippets.list(user.id, dto);
  }

  /** Languages actually in use, so the filter needs no fixed list. */
  @Get('languages')
  languages(@CurrentUser() user: AuthUser) {
    return this.snippets.languages(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSnippetDto) {
    return this.snippets.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.snippets.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSnippetDto,
  ) {
    return this.snippets.update(user.id, id, dto);
  }

  /** Counts a copy — the signal that this one is worth keeping near the top. */
  @Post(':id/used')
  @HttpCode(200)
  markUsed(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.snippets.markUsed(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.snippets.remove(user.id, id);
  }
}
