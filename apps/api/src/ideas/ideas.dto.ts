import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IdeaStatus, Priority } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateIdeaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(IdeaStatus)
  status?: IdeaStatus;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateIdeaDto extends CreateIdeaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare title: string;
}

export class IdeaQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(IdeaStatus, { each: true })
  status?: IdeaStatus[];

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
