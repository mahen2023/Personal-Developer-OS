import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TagsService } from './tags.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

export class UpdateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tags.list(user.id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.rename(user.id, id, dto.name, dto.color);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tags.remove(user.id, id);
  }
}
