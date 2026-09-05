import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { BackupService } from './backup.service';
import { JobsController } from './jobs.controller';
import { JobsService, QUEUE } from './jobs.service';
import { JobsProcessor } from './jobs.processor';
import { ExportService } from './export.service';
import { ScansService } from './scans.service';

/**
 * Phase 7 — the part of the application that runs without you (§45, §46).
 *
 * Redis-backed rather than an in-process timer, for one reason that matters:
 * repeatable jobs are owned by the queue, not by the process. The API and the
 * worker both register the same schedule and it still fires once. A `setInterval`
 * in each would fire twice, and would silently stop firing whenever the API
 * restarted at the wrong moment.
 *
 * Only the worker consumes. The API can enqueue — a "run now" button — but
 * never processes, so a long scan can never make a request wait.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          // Keep enough history to answer "did last night's scan run?", and no
          // more — this is a queue, not an audit log.
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE }),
    NotificationsModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor, ScansService, BackupService, ExportService],
  exports: [JobsService, ScansService, BackupService, ExportService],
})
export class JobsModule {}
