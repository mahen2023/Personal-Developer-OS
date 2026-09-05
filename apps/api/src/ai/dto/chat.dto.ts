import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AiMode, EntityType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Nothing in this file carries a secret, and nothing accepts one. The console
 * sends questions, model names and record references; a credential reaches the
 * model through none of them (§42).
 */

/** `TYPE:uuid`, e.g. `SOLUTION:0f8d…`. Validated as a shape, resolved later. */
const ENTITY_REF = /^[A-Z_]{3,20}:[0-9a-fA-F-]{36}$/;

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsEnum(AiMode)
  mode?: AiMode;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(EntityType, { each: true })
  sources?: EntityType[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(ENTITY_REF, { each: true, message: 'Each attachment must be TYPE:id.' })
  attached?: string[];
}

export class UpdateConversationDto extends CreateConversationDto {
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ConversationQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** `all`, `pinned`, `archived` or `recent` (§11). */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  filter?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  message!: string;

  /** Switches the conversation's model for this turn and every one after (§4). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsEnum(AiMode)
  mode?: AiMode;

  /** Drops the last exchange and asks again (§13). */
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @IsOptional()
  @IsUUID()
  profileId?: string;
}

export class ModelProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @IsOptional()
  @IsEnum(AiMode)
  mode?: AiMode;

  // Ranges are Ollama's, not invented here: a control that offers a value the
  // engine rejects is worse than no control (§24).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  topK?: number;

  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(1_048_576)
  contextLength?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  systemPrompt?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(300)
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chatModel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  embeddingModel?: string | null;

  @IsOptional()
  @IsEnum(AiMode)
  defaultMode?: AiMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @IsOptional()
  @IsBoolean()
  privateMode?: boolean;

  @IsOptional()
  @IsBoolean()
  retainMessages?: boolean;
}

export class PullModelDto {
  /** Ollama's own naming: `family:tag`, optionally namespaced. */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[\w.\-/]+(:[\w.\-]+)?$/, { message: 'Model must look like `llama3.1:8b`.' })
  model!: string;
}

export class SaveAsDto {
  /** Which record type the answer becomes (§14). */
  @IsString()
  @MaxLength(20)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class TestConnectionDto {
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(300)
  baseUrl?: string;
}

export class MessagePageDto {
  /** Older messages are fetched on demand rather than all at once (§58). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID()
  before?: string;
}
