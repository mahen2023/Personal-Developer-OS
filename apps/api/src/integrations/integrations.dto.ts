import { IsBoolean, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class ConnectDto {
  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  /**
   * The token is validated with the provider before it is stored, so there is
   * no format check here — every provider's shape differs and guessing at one
   * would only reject valid tokens.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  token!: string;
}

export class ToggleDto {
  @IsBoolean()
  isEnabled!: boolean;
}
