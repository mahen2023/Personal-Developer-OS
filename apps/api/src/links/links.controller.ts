import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EntityType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';
import { LinksService } from './links.service';
import { CreateLinkDto } from './links.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

class EntityQueryDto {
  @IsEnum(EntityType)
  type!: EntityType;

  @IsUUID()
  id!: string;
}

@ApiTags('links')
@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get()
  forEntity(@CurrentUser() user: AuthUser, @Query() query: EntityQueryDto) {
    return this.links.forEntity(user.id, query.type, query.id);
  }

  @Post()
  @HttpCode(204)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkDto): Promise<void> {
    return this.links.link(
      user.id,
      { type: dto.fromType, id: dto.fromId },
      { type: dto.toType, id: dto.toId },
      dto.label,
    );
  }

  @Delete()
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkDto): Promise<void> {
    return this.links.unlink(
      user.id,
      { type: dto.fromType, id: dto.fromId },
      { type: dto.toType, id: dto.toId },
    );
  }
}
