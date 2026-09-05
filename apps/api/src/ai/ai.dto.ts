import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EntityType } from '@prisma/client';

export class AskDto {
  @IsString()
  @MaxLength(1_000)
  question!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class SemanticSearchDto {
  @IsString()
  @MaxLength(2_000)
  q!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(EntityType, { each: true })
  types?: EntityType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number = 10;
}

export class SimilarDto {
  /** Free text — usually an error message pasted straight from a terminal. */
  @IsString()
  @MaxLength(4_000)
  text!: string;

  /** The record being viewed, so it does not match itself. */
  @IsOptional()
  @IsUUID()
  exclude?: string;
}

/** Source names come from the indexer; validated there rather than duplicated. */
export class ReindexDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
