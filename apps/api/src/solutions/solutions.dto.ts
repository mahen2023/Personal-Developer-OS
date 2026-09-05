import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateSolutionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  problem!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  solution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
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
  links?: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateSolutionDto extends CreateSolutionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  declare title: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  declare problem: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  declare solution: string;
}

export class SolutionQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}

/** Body for "have I solved this before?" — usually a pasted error message. */
export class SimilarSolutionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(8_000)
  text!: string;
}
