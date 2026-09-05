import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationKind } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

export class NotificationQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}

export class NotificationPreferencesDto {
  /** Only ever used for WARNING and above; INFO stays in the app. */
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  /** Whether the browser may raise a desktop notification for unread items. */
  @IsOptional()
  @IsBoolean()
  browser?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationKind, { each: true })
  muted?: NotificationKind[];
}
