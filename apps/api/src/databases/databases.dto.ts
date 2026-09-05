import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DatabaseType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateDatabaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(DatabaseType)
  type?: DatabaseType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  databaseName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  username?: string;

  /** A vault item id. Passwords are never stored on this row (§17). */
  @IsOptional()
  @IsUUID()
  credentialId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeMb?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  backupSchedule?: string;

  @IsOptional()
  @IsDateString()
  lastBackupAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string | null;

  @IsOptional()
  @IsUUID()
  serverId?: string | null;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateDatabaseDto extends CreateDatabaseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare name: string;
}

export class DatabaseQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsEnum(DatabaseType)
  type?: DatabaseType;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
