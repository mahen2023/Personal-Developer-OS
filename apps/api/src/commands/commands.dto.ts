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
import { CommandPlatform, DangerLevel } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateCommandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  command!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsEnum(CommandPlatform)
  platform?: CommandPlatform;

  // Advisory only — the service raises it when the command looks destructive.
  @IsOptional()
  @IsEnum(DangerLevel)
  dangerLevel?: DangerLevel;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateCommandDto extends CreateCommandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare title: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  declare command: string;
}

export class CommandQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(CommandPlatform)
  platform?: CommandPlatform;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(DangerLevel)
  dangerLevel?: DangerLevel;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
