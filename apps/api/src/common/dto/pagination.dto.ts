import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Shared by every list endpoint (§66). Extend it per module to add filters —
 * never re-declare page/limit/sort.
 */
export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  q?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function page<T>(items: T[], total: number, dto: PaginationDto): Page<T> {
  return {
    items,
    total,
    page: dto.page,
    limit: dto.limit,
    pages: Math.max(1, Math.ceil(total / dto.limit)),
  };
}
