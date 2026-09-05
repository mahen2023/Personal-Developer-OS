import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BookmarkCategory } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateBookmarkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsUrl({ require_tld: false }, { message: 'Enter a full URL, including https://' })
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(BookmarkCategory)
  category?: BookmarkCategory;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateBookmarkDto extends CreateBookmarkDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare title: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  declare url: string;
}

export class BookmarkQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(BookmarkCategory)
  category?: BookmarkCategory;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
