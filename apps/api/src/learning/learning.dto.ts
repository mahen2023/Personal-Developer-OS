import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LearningKind, LearningStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateLearningDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  technology?: string;

  @IsOptional()
  @IsEnum(LearningKind)
  kind?: LearningKind;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsEnum(LearningStatus)
  status?: LearningStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

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

export class UpdateLearningDto extends CreateLearningDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare title: string;
}

export class LearningQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(LearningStatus, { each: true })
  status?: LearningStatus[];

  @IsOptional()
  @IsEnum(LearningKind)
  kind?: LearningKind;

  @IsOptional()
  @IsString()
  technology?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
