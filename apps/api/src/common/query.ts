import { NotFoundException } from '@nestjs/common';
import { PaginationDto } from './dto/pagination.dto';

/**
 * Shared query building. These are functions rather than a generic base class
 * on purpose: every service keeps its own fully-typed Prisma calls, and only
 * the genuinely identical parts — search, paging, ownership — are shared.
 */

/** Case-insensitive OR-contains across the given columns, for `?q=`. */
export function search(term: string | undefined, fields: string[]): Record<string, unknown> {
  const trimmed = term?.trim();
  if (!trimmed) return {};
  return {
    OR: fields.map((field) => ({ [field]: { contains: trimmed, mode: 'insensitive' } })),
  };
}

/** Narrows a list to one project when `?projectId=` is present. */
export function scopeToProject(projectId: string | undefined): Record<string, unknown> {
  return projectId ? { projectId } : {};
}

/**
 * skip / take / orderBy from the pagination DTO. `allowed` guards the sort
 * column — an unchecked `?sort=` is a way to probe the schema and to make
 * Prisma throw on every request.
 */
export function pageArgs(
  dto: PaginationDto,
  allowed: readonly string[],
  fallback: string,
  /**
   * Direction used when the caller did not ask for a sort. Newest-first suits
   * most lists, but not all: a certificate list answers "what breaks next", so
   * it wants the soonest expiry at the top.
   */
  fallbackOrder: 'asc' | 'desc' = 'desc',
): { skip: number; take: number; orderBy: Record<string, 'asc' | 'desc'> } {
  const column = dto.sort && allowed.includes(dto.sort) ? dto.sort : fallback;
  const direction = dto.sort ? dto.order : fallbackOrder;
  return { skip: dto.skip, take: dto.limit, orderBy: { [column]: direction } };
}

/** The project stub every list row carries, so the UI can show its origin. */
export const PROJECT_REF = {
  select: { id: true, name: true, slug: true, color: true, status: true },
} as const;

export function found<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundException(`That ${label} does not exist, or is not yours.`);
  }
  return value;
}

/**
 * Turns `["  Docker ", "docker", ""]` into `["docker"]`. Used wherever the UI
 * sends a free-text list (tech stack, participants, commands).
 */
export function cleanList(values: string[] | undefined, limit = 40): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
    if (seen.size >= limit) break;
  }
  return [...seen];
}
