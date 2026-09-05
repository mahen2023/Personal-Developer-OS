import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { EmbeddingService } from '../ai/embedding.service';

const startedAt = Date.now();

/**
 * `/health` answers "is the process up" and must never touch a dependency —
 * it is what a restart policy watches. `/ready` answers "can it serve traffic"
 * and does check the database. The diagnostics screen (§58) reads /ready.
 */
@ApiTags('system')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) };
  }

  @Public()
  @Get('ready')
  async ready() {
    const [database, redis] = await Promise.all([
      this.prisma.ping().then((ok) => (ok ? 'ok' : 'down')),
      this.jobs.reachable().then((ok) => (ok ? 'ok' : 'down')),
    ]);

    return {
      // Redis being down does not stop the app serving: scans and backups stop
      // happening, which is degraded, not dead. The database going is fatal.
      status: database === 'ok' ? (redis === 'ok' ? 'ready' : 'degraded') : 'down',
      version: process.env.npm_package_version ?? '0.1.0',
      checks: {
        database,
        redis,
        storage: this.config.get<string>('storage.driver'),
        // Two separate facts: whether written answers are on, and what the
        // search index was actually built with.
        ai: this.config.get<boolean>('ai.enabled') ? 'enabled' : 'disabled',
        embeddings: this.embeddings.kind,
      },
    };
  }
}
