import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EntityType } from '@prisma/client';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(EntityType, { each: true })
  types?: EntityType[];

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 40;
}
