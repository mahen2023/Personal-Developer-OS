import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { found } from '../../common/query';
import type { ModelProfileDto } from '../dto/chat.dto';

/**
 * Saved model settings (§23).
 *
 * A profile is a name for a combination someone arrived at by experiment —
 * "deepseek at 0.2 in troubleshooting mode" — so it can be chosen again without
 * remembering the numbers. Nothing validates that the model still exists:
 * models come and go on a local machine, and a profile pointing at one that was
 * deleted should say so at the point of use, not vanish from the list.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.aiModelProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: ModelProfileDto) {
    if (dto.isDefault) await this.clearDefault(userId);
    return this.prisma.aiModelProfile.create({ data: { userId, ...normalise(dto) } });
  }

  async update(userId: string, id: string, dto: ModelProfileDto) {
    found(
      await this.prisma.aiModelProfile.findFirst({ where: { id, userId }, select: { id: true } }),
      'profile',
    );
    if (dto.isDefault) await this.clearDefault(userId);
    return this.prisma.aiModelProfile.update({ where: { id }, data: normalise(dto) });
  }

  async remove(userId: string, id: string): Promise<void> {
    found(
      await this.prisma.aiModelProfile.findFirst({ where: { id, userId }, select: { id: true } }),
      'profile',
    );
    await this.prisma.aiModelProfile.delete({ where: { id } });
  }

  /** Exactly one default, enforced here rather than by a partial unique index. */
  private async clearDefault(userId: string): Promise<void> {
    await this.prisma.aiModelProfile.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
}

function normalise(dto: ModelProfileDto) {
  return {
    name: dto.name.trim(),
    model: dto.model.trim(),
    mode: dto.mode,
    temperature: dto.temperature ?? null,
    topP: dto.topP ?? null,
    topK: dto.topK ?? null,
    contextLength: dto.contextLength ?? null,
    systemPrompt: dto.systemPrompt?.trim() || null,
    isDefault: dto.isDefault ?? false,
  };
}
