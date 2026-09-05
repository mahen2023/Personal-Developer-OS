import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The stock guard throws `ThrottlerException: Too Many Requests`, which reaches
 * the user verbatim. Every other error in this app is a sentence (§57), and a
 * rate limit is the one an ordinary person is most likely to see — usually
 * after mistyping their own password.
 */
@Injectable()
export class FriendlyThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      'Too many attempts in a short time. Wait a minute and try again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
