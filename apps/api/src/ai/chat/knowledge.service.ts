import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../activity/activity.service';
import { TagsService } from '../../tags/tags.service';
import { IndexerService } from '../indexer.service';
import { found } from '../../common/query';
import { pathFor } from '../../search/search.service';
import { deriveTitle } from './prompt';
import type { SaveAsDto } from '../dto/chat.dto';

/**
 * Turning an answer into a record (§14).
 *
 * The point of the console is that what it produces stops being a chat log the
 * moment it is worth keeping. Copy and paste loses the model, the question and
 * the sources; this keeps all three, in the record, where they can be found
 * again by the same search that found the sources in the first place.
 *
 * A saved record is indexed like any other, so tomorrow's question can retrieve
 * today's answer — which is also why the provenance footer matters. Without it,
 * a model's guess would come back later wearing the same clothes as something
 * the developer actually verified.
 */

export type SaveTarget = 'note' | 'solution' | 'adr' | 'task' | 'document';

const TARGETS: SaveTarget[] = ['note', 'solution', 'adr', 'task', 'document'];

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly indexer: IndexerService,
  ) {}

  async save(userId: string, messageId: string, dto: SaveAsDto) {
    const target = dto.target.toLowerCase() as SaveTarget;
    if (!TARGETS.includes(target)) {
      throw new BadRequestException(
        `Cannot save as "${dto.target}". Choose ${TARGETS.join(', ')}.`,
      );
    }

    const message = found(
      await this.prisma.aiMessage.findFirst({
        where: { id: messageId, conversation: { userId } },
        include: { conversation: { select: { id: true, title: true, projectId: true } } },
      }),
      'message',
    );

    // The question this answered, which is what makes the saved record
    // findable later — nobody searches for the answer they already have.
    const question = await this.prisma.aiMessage.findFirst({
      where: {
        conversationId: message.conversationId,
        role: 'USER',
        createdAt: { lt: message.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });

    const projectId = dto.projectId === undefined ? message.conversation.projectId : dto.projectId;
    const title = dto.title?.trim() || deriveTitle(question?.content ?? message.conversation.title);
    const body = `${message.content}\n\n${provenance(message.model, question?.content, message.sources)}`;

    const created = await this.create(userId, target, { title, body, projectId, message });
    await this.tags.setFor(userId, created.entityType, created.id, dto.tags);
    void this.indexer.touch(userId, created.indexAs, created.id);

    await this.activity.record({
      userId,
      projectId,
      action: `ai.saved.${target}`,
      entityType: created.entityType,
      entityId: created.id,
      summary: `Saved an answer from ${message.model ?? 'the assistant'} as ${target} "${title}"`,
    });

    return {
      id: created.id,
      entityType: created.entityType,
      href: pathFor(created.entityType, created.id),
      title,
    };
  }

  private async create(
    userId: string,
    target: SaveTarget,
    input: {
      title: string;
      body: string;
      projectId: string | null;
      message: { content: string; model: string | null };
    },
  ): Promise<{ id: string; entityType: EntityType; indexAs: 'note' | 'solution' | 'adr' }> {
    if (target === 'note') {
      const row = await this.prisma.note.create({
        data: { userId, projectId: input.projectId, title: input.title, content: input.body },
      });
      return { id: row.id, entityType: EntityType.NOTE, indexAs: 'note' };
    }

    if (target === 'solution') {
      const row = await this.prisma.solution.create({
        data: {
          userId,
          projectId: input.projectId,
          title: input.title,
          // A solution needs a problem and a fix as separate columns. Only the
          // developer knows which half of an answer is which, so the whole
          // answer goes in `solution` and `problem` carries the question —
          // splitting it by guesswork would file it wrongly and quietly.
          problem: input.title,
          solution: input.body,
        },
      });
      return { id: row.id, entityType: EntityType.SOLUTION, indexAs: 'solution' };
    }

    if (target === 'adr') {
      // The number comes from the user's counter, never from max(number) — a
      // deleted ADR must not free its number (see schema).
      const { adrSequence } = await this.prisma.user.update({
        where: { id: userId },
        data: { adrSequence: { increment: 1 } },
        select: { adrSequence: true },
      });
      const row = await this.prisma.adr.create({
        data: {
          userId,
          projectId: input.projectId,
          number: adrSequence,
          title: input.title,
          context: 'Drafted from a Developer Intelligence conversation. Review before accepting.',
          decision: input.body,
        },
      });
      return { id: row.id, entityType: EntityType.ADR, indexAs: 'adr' };
    }

    if (target === 'task') {
      const row = await this.prisma.task.create({
        data: {
          userId,
          projectId: input.projectId,
          title: input.title,
          description: input.body,
        },
      });
      // Tasks are not indexed — a one-line title is answered better by the task
      // list than by retrieval. Reported as a note so the caller still gets a
      // usable link.
      return { id: row.id, entityType: EntityType.TASK, indexAs: 'note' };
    }

    // `document` means a Markdown document in the notes sense: there is no file
    // to store, so it is a note typed as documentation rather than a fake upload.
    const row = await this.prisma.note.create({
      data: {
        userId,
        projectId: input.projectId,
        title: input.title,
        content: input.body,
        type: 'DOCUMENTATION',
      },
    });
    return { id: row.id, entityType: EntityType.NOTE, indexAs: 'note' };
  }
}

/**
 * Where this text came from, appended to every saved record.
 *
 * Not decoration. Six months later the only thing that distinguishes a verified
 * fix from a model's plausible suggestion is a line saying which it was (§61).
 */
function provenance(model: string | null, question: string | undefined, sources: unknown): string {
  const cited = Array.isArray(sources) ? (sources as { title?: string; href?: string }[]) : [];
  const lines = [
    '---',
    `_Generated by ${model ?? 'a local model'} in the Developer Intelligence console. Not verified._`,
  ];
  if (question) lines.push(`_Question: ${question.replace(/\s+/g, ' ').slice(0, 300)}_`);
  if (cited.length > 0) {
    lines.push('', 'Sources it drew on:');
    for (const source of cited) {
      lines.push(`- [${source.title ?? 'record'}](${source.href ?? '/'})`);
    }
  }
  return lines.join('\n');
}
