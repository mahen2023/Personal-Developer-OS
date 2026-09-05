import { BadRequestException, type ValidationError } from '@nestjs/common';

/**
 * Turns class-validator's output into sentences a person can act on.
 *
 * Two things go wrong without this. Default messages are raw — "name must be
 * longer than or equal to 1 characters" — and custom messages are written to
 * read well but drop the field, so a registration form with three inputs
 * answers "Use at least 12 characters." and leaves you guessing which one.
 *
 * Every message here names its field.
 */
export function validationFailed(errors: ValidationError[]): BadRequestException {
  const details = flatten(errors);

  // One problem does not need a headline as well as a description: saying
  // "some fields need attention" above a single sentence is padding, and
  // repeating that sentence underneath it is worse.
  return new BadRequestException(
    details.length === 1
      ? { message: details[0] }
      : { message: 'Some fields need attention.', details },
  );
}

function flatten(errors: ValidationError[], parent = ''): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;

    for (const constraint of Object.values(error.constraints ?? {})) {
      messages.push(withField(constraint, error.property, label(path)));
    }
    // Nested DTOs, so a bad field inside an object is still named in full.
    if (error.children?.length) messages.push(...flatten(error.children, path));
  }

  return messages;
}

/**
 * Ensures the field is named exactly once. Default messages already open with
 * the raw property, so that prefix is swapped for the readable label rather
 * than having a second one bolted on the front.
 */
function withField(message: string, property: string, label: string): string {
  if (message.startsWith(property)) {
    return capitalise(`${label}${message.slice(property.length)}`);
  }
  if (message.toLowerCase().includes(label.toLowerCase())) return message;
  return `${label}: ${message}`;
}

/** `newPassword` → `New password`, `project.name` → `Project name`. */
function label(path: string): string {
  return capitalise(
    path
      .replace(/\./g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .toLowerCase(),
  );
}

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
