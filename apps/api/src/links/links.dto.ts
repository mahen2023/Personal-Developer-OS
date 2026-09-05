import { EntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EntityRefDto {
  @IsEnum(EntityType)
  type!: EntityType;

  @IsUUID()
  id!: string;
}

export class CreateLinkDto {
  @IsEnum(EntityType)
  fromType!: EntityType;

  @IsUUID()
  fromId!: string;

  @IsEnum(EntityType)
  toType!: EntityType;

  @IsUUID()
  toId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
