import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateDomainDto {
  // A hostname, not a URL — https:// here is the most common paste mistake.
  @IsString()
  @Matches(/^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$/, {
    message: 'Enter a hostname such as api.example.com, without https:// or a path.',
  })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  registrar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dnsProvider?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string | null;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateDomainDto extends CreateDomainDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  declare name: string;
}

export class DomainQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @IsString()
  registrar?: string;

  /** Only domains expiring within this many days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiringWithin?: number;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  tags?: string[];
}
