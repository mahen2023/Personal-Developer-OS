import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ServerProvider, ServerStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(ServerProvider)
  provider?: ServerProvider;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  os?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1024)
  cpuCores?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_536)
  ramGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_048_576)
  diskGb?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sshUsername?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  sshPort?: number;

  /** A vault item id. The key itself never travels through this API. */
  @IsOptional()
  @IsUUID()
  sshKeyId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  services?: string[];

  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string | null;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateServerDto extends CreateServerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare name: string;
}

export class ServerQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @IsEnum(ServerProvider)
  provider?: ServerProvider;

  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
