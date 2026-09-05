import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EnvironmentType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateEnvironmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsEnum(EnvironmentType)
  type?: EnvironmentType;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateEnvironmentDto extends CreateEnvironmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  declare name: string;
}

export class UpsertVariableDto {
  // Shell-safe names only, so an exported .env is actually sourceable.
  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'Use letters, digits and underscores, starting with a letter or underscore.',
  })
  @MaxLength(120)
  key!: string;

  /** A literal, for non-secrets. Mutually exclusive with vaultItemId. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  value?: string;

  /** A pointer into the vault, for secrets. */
  @IsOptional()
  @IsUUID()
  vaultItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class EnvironmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(EnvironmentType)
  type?: EnvironmentType;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
