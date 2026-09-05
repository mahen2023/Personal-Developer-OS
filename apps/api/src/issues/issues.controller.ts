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
import { IssuesService } from './issues.service';
import { CreateIssueDto, IssueQueryDto, ResolveIssueDto, UpdateIssueDto } from './issues.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('issues')
@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: IssueQueryDto) {
    return this.issues.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIssueDto) {
    return this.issues.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.issues.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.issues.update(user.id, id, dto);
  }

  /** Closes the issue against a solution, existing or written here and now. */
  @Post(':id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveIssueDto,
  ) {
    return this.issues.resolve(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.issues.remove(user.id, id);
  }
}
