import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateMeetingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsDateString()
  meetingDate!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  participants?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  discussion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  decisions?: string;

  /** Promoted into real tasks on create, not stored as prose. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  actionItems?: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateMeetingDto extends CreateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare title: string;

  @IsOptional()
  @IsDateString()
  declare meetingDate: string;
}

export class ActionItemsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  titles!: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  assignee?: string;
}

export class MeetingQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
