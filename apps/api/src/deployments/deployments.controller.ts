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
import { DeploymentsService } from './deployments.service';
import {
  CreateDeploymentDto,
  DeploymentQueryDto,
  FinishDeploymentDto,
  UpdateDeploymentDto,
} from './deployments.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('deployments')
@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: DeploymentQueryDto) {
    return this.deployments.list(user.id, dto);
  }

  /** The release history, grouped by day, with a success rate. */
  @Get('timeline')
  timeline(@CurrentUser() user: AuthUser, @Query() dto: DeploymentQueryDto) {
    return this.deployments.timeline(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeploymentDto) {
    return this.deployments.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deployments.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeploymentDto,
  ) {
    return this.deployments.update(user.id, id, dto);
  }

  /** Closes out an in-progress deployment and computes its duration. */
  @Post(':id/finish')
  @HttpCode(200)
  finish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishDeploymentDto,
  ) {
    return this.deployments.finish(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.deployments.remove(user.id, id);
  }
}
