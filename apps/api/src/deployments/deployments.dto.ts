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
  MaxLength,
  Min,
} from 'class-validator';
import { DeploymentStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateDeploymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitSha?: string;

  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deployedBy?: string;

  @IsOptional()
  @IsDateString()
  deployedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  repositoryId?: string | null;

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

export class UpdateDeploymentDto extends CreateDeploymentDto {}

/** Closes out an in-progress deployment in one call. */
export class FinishDeploymentDto {
  @IsEnum(DeploymentStatus)
  status!: DeploymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;
}

export class DeploymentQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(DeploymentStatus, { each: true })
  status?: DeploymentStatus[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
