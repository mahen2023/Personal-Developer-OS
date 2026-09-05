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
import { AdrsService } from './adrs.service';
import { AdrQueryDto, CreateAdrDto, SupersedeAdrDto, UpdateAdrDto } from './adrs.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('adrs')
@Controller('adrs')
export class AdrsController {
  constructor(private readonly adrs: AdrsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: AdrQueryDto) {
    return this.adrs.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdrDto) {
    return this.adrs.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.adrs.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdrDto,
  ) {
    return this.adrs.update(user.id, id, dto);
  }

  /** Marks this record superseded, updating both ends of the chain. */
  @Post(':id/supersede')
  @HttpCode(200)
  supersede(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupersedeAdrDto,
  ) {
    return this.adrs.supersede(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.adrs.remove(user.id, id);
  }
}
