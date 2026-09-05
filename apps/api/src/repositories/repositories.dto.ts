import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RepoProvider } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateRepositoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  // `require_tld: false` so an internal Gitea or a self-hosted host works.
  @IsUrl({ require_tld: false }, { message: 'Enter the repository URL, including https://' })
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsEnum(RepoProvider)
  provider?: RepoProvider;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  localPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateRepositoryDto extends CreateRepositoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  declare name: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  declare url: string;
}

export class RepositoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(RepoProvider)
  provider?: RepoProvider;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
