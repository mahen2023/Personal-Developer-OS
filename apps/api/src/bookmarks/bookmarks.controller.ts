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
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto, BookmarkQueryDto, UpdateBookmarkDto } from './bookmarks.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('bookmarks')
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: BookmarkQueryDto) {
    return this.bookmarks.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookmarkDto) {
    return this.bookmarks.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookmarks.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookmarkDto,
  ) {
    return this.bookmarks.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bookmarks.remove(user.id, id);
  }
}
