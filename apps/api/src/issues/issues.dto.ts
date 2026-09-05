import { Transform, Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { IssueStatus, Priority } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateIssueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  errorMessage?: string;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateIssueDto extends CreateIssueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  declare title: string;
}

/** The fix, written at the moment it is still accurate. */
export class InlineSolutionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  solution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  problem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  rootCause?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  commands?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

/** Exactly one of these is required; the service rejects neither. */
export class ResolveIssueDto {
  @IsOptional()
  @IsUUID()
  solutionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InlineSolutionDto)
  solution?: InlineSolutionDto;
}

export class IssueQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(IssueStatus, { each: true })
  status?: IssueStatus[];

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  open?: boolean;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
