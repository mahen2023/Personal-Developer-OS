import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { EXPORTABLE, ExportService } from './export.service';
import { JobsService } from './jobs.service';
import { ScansService } from './scans.service';
import { MailService } from '../notifications/mail.service';
import { ExportDto, RestoreDto, RunJobDto } from './jobs.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import type { UploadedFile as MulterFile } from '../documents/documents.service';

@ApiTags('automation')
@Controller('automation')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly scans: ScansService,
    private readonly backups: BackupService,
    private readonly exports: ExportService,
    private readonly mail: MailService,
  ) {}

  /** Everything the automation settings screen needs, in one call. */
  @Get('status')
  async status() {
    return {
      ...(await this.jobs.status()),
      redis: await this.jobs.reachable(),
      email: this.mail.configured,
      backups: await this.backups.list(),
      exportable: EXPORTABLE,
    };
  }

  @Post('mail/test')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  verifyMail() {
    return this.mail.verify();
  }

  /**
   * Runs a scan immediately, in this process.
   *
   * Deliberately not enqueued: pressing "run now" and being told "queued" when
   * no worker is running would be a lie, and the scans take milliseconds on a
   * personal dataset. The queue is for the schedule, not for the button.
   */
  @Post('scan')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  scan(@CurrentUser() user: AuthUser) {
    return this.scans.runFor(user.id);
  }

  @Post('run')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async run(@CurrentUser() user: AuthUser, @Body() dto: RunJobDto) {
    return { id: await this.jobs.runNow(dto.job, user.id) };
  }

  /* ── backups ────────────────────────────────────────────────────────────── */

  @Post('backup')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  backup(@CurrentUser() user: AuthUser) {
    return this.backups.create(user.id);
  }

  @Get('backup/download')
  async download(
    @CurrentUser() _user: AuthUser,
    @Query('file') file: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    if (!file) throw new BadRequestException('Name the backup to download.');
    const body = await this.backups.read(file);
    response.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${file}"`,
    });
    return body;
  }

  /**
   * Restores from an uploaded file. `replace` wipes first and is never the
   * default — the DTO requires the word to be sent explicitly.
   */
  @Post('restore')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  restore(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: RestoreDto,
  ) {
    if (!file) throw new BadRequestException('Attach a backup file.');
    return this.backups.restore(user.id, file.buffer, { replace: dto.mode === 'replace' });
  }

  /* ── export ─────────────────────────────────────────────────────────────── */

  @Get('export')
  // Cache-Control matters here: a browser caching an export of your notes on
  // disk is not what anyone means by "download".
  @Header('Cache-Control', 'no-store')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() dto: ExportDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.exports.export(user.id, dto.what ?? [], dto.format ?? 'json');
    response.set({
      'Content-Type': `${result.contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    return result.body;
  }
}
