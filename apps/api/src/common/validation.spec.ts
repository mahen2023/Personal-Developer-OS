import type { ValidationError } from '@nestjs/common';
import { validationFailed } from './validation';

/** The shape class-validator hands the exception factory. */
const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children }) as ValidationError;

const body = (...errors: ValidationError[]) =>
  validationFailed(errors).getResponse() as { message: string; details?: string[] };

describe('validationFailed', () => {
  it('answers a single problem with the problem, and nothing else', () => {
    const result = body(
      error('password', { minLength: 'Your password needs at least 12 characters.' }),
    );

    expect(result.message).toBe('Your password needs at least 12 characters.');
    // No headline above it and no copy of it underneath.
    expect(result.details).toBeUndefined();
  });

  it('names the field when the message does not', () => {
    // Written to read well on its own, which is exactly how it loses the field.
    const result = body(error('apiKey', { minLength: 'Use at least 20 characters.' }));
    expect(result.message).toBe('Api key: Use at least 20 characters.');
  });

  it('leaves a message that already names its field alone', () => {
    const result = body(error('email', { isEmail: 'Enter a valid email address.' }));
    expect(result.message).toBe('Enter a valid email address.');
  });

  it('replaces the raw property in a default message rather than doubling it', () => {
    const result = body(
      error('newPassword', { minLength: 'newPassword must be longer than 12 characters' }),
    );
    // Not "New password: newPassword must be longer…".
    expect(result.message).toBe('New password must be longer than 12 characters');
  });

  it('keeps every problem, with a headline, when there is more than one', () => {
    const result = body(
      error('email', { isEmail: 'Enter a valid email address.' }),
      error('password', { minLength: 'Your password needs at least 12 characters.' }),
    );

    expect(result.message).toBe('Some fields need attention.');
    expect(result.details).toEqual([
      'Enter a valid email address.',
      'Your password needs at least 12 characters.',
    ]);
  });

  it('names a nested field by its full path', () => {
    const result = body(
      error('project', {}, [error('name', { isString: 'name must be a string' })]),
    );
    expect(result.message).toBe('Project name must be a string');
  });
});
