import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NoteType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @IsOptional()
  @IsEnum(NoteType)
  type?: NoteType;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateNoteDto extends CreateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare title: string;
}

export class NoteQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(NoteType, { each: true })
  type?: NoteType[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  pinned?: boolean;
}
