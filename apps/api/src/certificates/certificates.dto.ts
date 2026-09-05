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
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class CreateCertificateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  commonName!: string;

  @IsDateString()
  expiresAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuer?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string | null;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  domainId?: string | null;

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

export class UpdateCertificateDto extends CreateCertificateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  declare commonName: string;

  @IsOptional()
  @IsDateString()
  declare expiresAt: string;
}

/** Both dates optional: issued defaults to now, expiry to 90 days after. */
export class RenewCertificateDto {
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CertificateQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @IsUUID()
  domainId?: string;

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
