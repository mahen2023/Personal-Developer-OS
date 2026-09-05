import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateSnippetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  code!: string;

  // Free text rather than an enum: a new language should not need a migration.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateSnippetDto extends CreateSnippetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare title: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  declare code: string;
}

export class SnippetQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
