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
import { DomainsService } from './domains.service';
import { CreateDomainDto, DomainQueryDto, UpdateDomainDto } from './domains.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('domains')
@Controller('domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: DomainQueryDto) {
    return this.domains.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDomainDto) {
    return this.domains.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.domains.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDomainDto,
  ) {
    return this.domains.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.domains.remove(user.id, id);
  }
}
