import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

// Length beats composition rules for entropy, so the floor is 12 characters
// with no character-class requirement. The frontend shows a strength meter
// instead of a checklist.

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter a name to sign in under.' })
  @MaxLength(80, { message: 'That name is too long — 80 characters at most.' })
  name!: string;

  // Messages name their own field, so they read the same in a list of three as
  // they do alone. See common/validation.ts.
  @IsString()
  @MinLength(12, { message: 'Your password needs at least 12 characters.' })
  @MaxLength(200, { message: 'That password is too long — 200 characters at most.' })
  password!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'Your new password needs at least 12 characters.' })
  @MaxLength(200, { message: 'That password is too long — 200 characters at most.' })
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_]+\/[A-Za-z_+-]+$|^UTC$/, {
    message: 'Use an IANA timezone such as Asia/Jakarta.',
  })
  timezone!: string;
}
