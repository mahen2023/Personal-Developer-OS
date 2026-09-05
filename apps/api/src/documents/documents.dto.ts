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
import { EntityType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class UploadDocumentDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsEnum(EntityType)
  ownerType?: EntityType;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  // Multipart fields arrive as strings, so tags come in comma-separated.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((tag) => tag.trim()) : value,
  )
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateDocumentDto extends UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalName?: string;
}

export class DocumentQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(EntityType)
  ownerType?: EntityType;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
