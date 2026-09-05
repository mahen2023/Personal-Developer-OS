import { Injectable } from '@nestjs/common';
import { DangerLevel, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { CommandQueryDto, CreateCommandDto, UpdateCommandDto } from './commands.dto';

/**
 * Patterns that make a command destructive regardless of what the author
 * selected. This is a safety net, not a security control — the app never
 * executes anything (§26); the level only decides how loudly the UI warns
 * before the text reaches your clipboard.
 */
const DESTRUCTIVE = [
  /\brm\s+-[rf]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(drop|truncate)\s+(database|table|schema)\b/i,
  /\bdocker\s+system\s+prune\b/i,
  /\bdocker\s+volume\s+rm\b/i,
  /\bkubectl\s+delete\b/i,
  /\bgit\s+push\s+.*--force(?!-with-lease)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bshutdown\b|\breboot\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bterraform\s+destroy\b/i,
];

/** Never lowers what the author chose — it can only raise the warning. */
export function assessDanger(command: string, declared?: DangerLevel): DangerLevel {
  const looksDestructive = DESTRUCTIVE.some((pattern) => pattern.test(command));
  if (looksDestructive) return DangerLevel.DESTRUCTIVE;
  return declared ?? DangerLevel.SAFE;
}

@Injectable()
export class CommandsService extends CrudService<
  CreateCommandDto,
  UpdateCommandDto,
  CommandQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'command',
      entityType: EntityType.COMMAND,
      label: 'command',
      titleField: 'title',
      searchFields: ['title', 'command', 'description', 'category'],
      sortable: ['updatedAt', 'createdAt', 'title', 'category', 'useCount'],
      defaultSort: 'updatedAt',
      filter: (dto: CommandQueryDto) => ({
        ...(dto.platform ? { platform: dto.platform } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.dangerLevel ? { dangerLevel: dto.dangerLevel } : {}),
      }),
      toCreate: (dto) => ({
        title: dto.title.trim(),
        command: dto.command.trim(),
        description: dto.description,
        category: dto.category,
        platform: dto.platform,
        dangerLevel: assessDanger(dto.command, dto.dangerLevel),
      }),
      toUpdate: (dto) => ({
        title: dto.title?.trim(),
        command: dto.command?.trim(),
        description: dto.description,
        category: dto.category,
        platform: dto.platform,
        dangerLevel: dto.command ? assessDanger(dto.command, dto.dangerLevel) : dto.dangerLevel,
      }),
    });
  }

  markUsed(userId: string, id: string) {
    return this.increment(userId, id, 'useCount');
  }

  /** Categories in use, for the filter control. */
  async categories(userId: string): Promise<{ category: string; count: number }[]> {
    const grouped = await this.prisma.command.groupBy({
      by: ['category'],
      where: { userId, category: { not: null } },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });
    return grouped
      .filter((row): row is typeof row & { category: string } => row.category !== null)
      .map((row) => ({ category: row.category, count: row._count.category }));
  }
}
