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
import { AdrStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateAdrDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  context!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  decision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  alternatives?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  consequences?: string;

  @IsOptional()
  @IsEnum(AdrStatus)
  status?: AdrStatus;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateAdrDto extends CreateAdrDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  declare title: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  declare context: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  declare decision: string;
}

export class SupersedeAdrDto {
  @IsUUID()
  supersededBy!: string;
}

export class AdrQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(AdrStatus, { each: true })
  status?: AdrStatus[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
