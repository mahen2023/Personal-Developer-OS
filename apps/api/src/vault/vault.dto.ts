import { Type } from 'class-transformer';
import {
  IsBase64,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VaultItemType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

/**
 * Everything crossing this boundary is either non-secret metadata or opaque
 * base64 ciphertext. There is deliberately no `password` field anywhere in
 * this file — if one ever appears, the design has been broken.
 */

export class SetupVaultDto {
  @IsBase64()
  salt!: string;

  /** Proves knowledge of the master password without carrying it. */
  @IsBase64()
  verifier!: string;

  /** The vault data key, encrypted under the master key. */
  @IsBase64()
  wrappedDataKey!: string;

  @IsBase64()
  wrapNonce!: string;

  @Type(() => Number)
  @IsInt()
  @Min(19_456)
  @Max(1_048_576)
  memoryKib!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(10)
  iterations!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  parallelism!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  autoLockMinutes?: number;
}

export class UnlockVaultDto {
  @IsBase64()
  verifier!: string;
}

export class VaultSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  autoLockMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  clipboardSeconds?: number;
}

export class CreateVaultItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  /** AES-256-GCM ciphertext produced in the browser. */
  @IsBase64()
  cipher!: string;

  @IsBase64()
  nonce!: string;

  @IsOptional()
  @IsEnum(VaultItemType)
  type?: VaultItemType;

  // Non-secret metadata, stored in the clear so items stay findable while the
  // vault is locked.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  username?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(8)
  totpDigits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(120)
  totpPeriod?: number;

  /** Days before this secret should be replaced. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  rotateEveryD?: number;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class UpdateVaultItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  /** Present only when the secret itself changed. */
  @IsOptional()
  @IsBase64()
  cipher?: string;

  @IsOptional()
  @IsBase64()
  nonce?: string;

  @IsOptional()
  @IsEnum(VaultItemType)
  type?: VaultItemType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  username?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(8)
  totpDigits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(120)
  totpPeriod?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  rotateEveryD?: number;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class VaultQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(VaultItemType)
  type?: VaultItemType;
}
