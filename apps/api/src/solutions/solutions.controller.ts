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
import { SolutionsService } from './solutions.service';
import {
  CreateSolutionDto,
  SimilarSolutionDto,
  SolutionQueryDto,
  UpdateSolutionDto,
} from './solutions.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('solutions')
@Controller('solutions')
export class SolutionsController {
  constructor(private readonly solutions: SolutionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: SolutionQueryDto) {
    return this.solutions.list(user.id, dto);
  }

  /** POST rather than GET: the query is a pasted error message, not a URL. */
  @Post('similar')
  @HttpCode(200)
  similar(@CurrentUser() user: AuthUser, @Body() dto: SimilarSolutionDto) {
    return this.solutions.similar(user.id, dto.text);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSolutionDto) {
    return this.solutions.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.solutions.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSolutionDto,
  ) {
    return this.solutions.update(user.id, id, dto);
  }

  @Post(':id/used')
  @HttpCode(200)
  markUsed(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.solutions.markUsed(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.solutions.remove(user.id, id);
  }
}
