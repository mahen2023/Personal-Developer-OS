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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  DocumentsService,
  disposition,
  type UploadedFile as FileUpload,
} from './documents.service';
import { DocumentQueryDto, UpdateDocumentDto, UploadDocumentDto } from './documents.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: DocumentQueryDto) {
    return this.documents.list(user.id, dto);
  }

  @Get('allowed-types')
  allowedTypes() {
    return { mimeTypes: DocumentsService.allowedMimeTypes() };
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  // Memory storage: the file is checksummed and handed to FileStorage, which
  // decides where it actually lives. Nothing touches disk before validation.
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: FileUpload | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(user.id, file, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(user.id, id);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ): Promise<void> {
    const file = await this.documents.download(user.id, id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      // Only the preview asks for `inline`, and only types that cannot execute
      // on this origin get it — see `disposition`.
      'Content-Disposition': `${disposition(file.mimeType, inline === '1')}; filename="${encodeURIComponent(file.filename)}"`,
    });
    file.stream.pipe(res);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.documents.remove(user.id, id);
  }
}
