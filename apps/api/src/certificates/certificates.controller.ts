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
import { CertificatesService } from './certificates.service';
import {
  CertificateQueryDto,
  CreateCertificateDto,
  RenewCertificateDto,
  UpdateCertificateDto,
} from './certificates.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: CertificateQueryDto) {
    return this.certificates.list(user.id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCertificateDto) {
    return this.certificates.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.certificates.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateDto,
  ) {
    return this.certificates.update(user.id, id, dto);
  }

  /**
   * Records a renewal you performed elsewhere. This app never issues or
   * installs certificates — certbot does that; this remembers the dates.
   */
  @Post(':id/renew')
  @HttpCode(200)
  renew(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewCertificateDto,
  ) {
    return this.certificates.renew(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.certificates.remove(user.id, id);
  }
}
