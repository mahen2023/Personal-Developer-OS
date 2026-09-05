import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

/** Keys whose values must never reach a log line or an error response. */
const SENSITIVE_KEYS =
  /^(password|newPassword|currentPassword|masterPassword|secret|token|refreshToken|accessToken|apiKey|privateKey|totpSecret|cipher|nonce|wrappedDataKey|verifier|authorization|cookie)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

/**
 * Turns every uncaught error into the shape the frontend renders (§57).
 *
 * A 5xx gets a short id matching a server log line, because the user cannot
 * act on it and the only useful thing they can do is quote the reference. A
 * 4xx does not: those messages are written to say exactly what to change, and
 * printing "error 257BE5" under "use at least 12 characters" turns a typo into
 * something that looks like a system fault. The id is still logged either way,
 * so a warn line can be traced without putting it on screen.
 *
 * The stack and the original message stay server-side unless the exception was
 * an explicit HttpException, which by definition is already user-facing.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const errorId = randomBytes(3).toString('hex').toUpperCase();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Something went wrong. Try again.';
    let details: unknown;

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const record = body as {
          message?: string | string[];
          details?: string[];
          error?: string;
        };
        // Validation failures arrive pre-formatted from validationFailed():
        // one field problem becomes the message, several become the details.
        if (Array.isArray(record.details)) details = record.details;
        if (Array.isArray(record.message)) {
          // Anything throwing BadRequestException with a bare array, rather
          // than going through the pipe.
          message = record.message.length === 1 ? record.message[0] : 'Some fields need attention.';
          details = record.message.length > 1 ? record.message : undefined;
        } else {
          message = record.message ?? record.error ?? message;
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${errorId} ${request.method} ${request.url} — ${
          exception instanceof Error ? exception.message : 'unknown error'
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${errorId} ${request.method} ${request.url} — ${status} ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      details,
      // Only when there is something to report. See the note above.
      ...(status >= 500 ? { errorId } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
