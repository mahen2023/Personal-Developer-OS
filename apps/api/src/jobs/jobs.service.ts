import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const QUEUE = 'devos';

/** What the worker knows how to do. One name per scheduled or on-demand job. */
export type JobName = 'scan' | 'backup' | 'sync';

export interface JobPayload {
  /** Absent means "every user" — how the nightly run is enqueued. */
  userId?: string;
  /** True when a person pressed a button, which changes what gets logged. */
  manual?: boolean;
}

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUE) private readonly queue: Queue<JobPayload>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Declares the schedule. Safe to run in both processes: BullMQ keys a
   * repeatable job by name plus pattern, so registering it twice produces one
   * schedule, and changing the hour replaces it rather than adding a second.
   */
  async onModuleInit(): Promise<void> {
    const hour = this.config.get<number>('jobs.dailyHour') ?? 7;
    const tz = this.config.get<string>('jobs.timezone') ?? 'UTC';
    const backupDays = this.config.get<number>('backup.everyDays') ?? 1;

    await this.upsertRepeatable('scan', `0 ${hour} * * *`, tz);
    // An hour before the scan, so the scan sees whatever the sync changed.
    await this.upsertRepeatable('sync', `0 ${(hour + 23) % 24} * * *`, tz);

    if (backupDays > 0) {
      // Cron cannot say "every N days" across month boundaries, so anything
      // other than daily runs on the days of the month that divide evenly.
      const days = backupDays === 1 ? '*' : `*/${backupDays}`;
      await this.upsertRepeatable('backup', `30 ${hour} ${days} * *`, tz);
    }

    if (this.config.get<boolean>('jobs.enabled')) {
      this.logger.log(`Scans daily at ${String(hour).padStart(2, '0')}:00 ${tz}`);
    }
  }

  private async upsertRepeatable(name: JobName, pattern: string, tz: string): Promise<void> {
    // Remove a stale schedule for the same job before adding the current one,
    // or changing JOBS_DAILY_HOUR would leave the old time running as well.
    for (const existing of await this.queue.getJobSchedulers()) {
      if (existing.name === name && existing.pattern !== pattern) {
        await this.queue.removeJobScheduler(existing.key);
      }
    }
    await this.queue.upsertJobScheduler(name, { pattern, tz }, { name, data: {} });
  }

  /** Runs a job now, for one user. Backs the "run now" buttons in Settings. */
  async runNow(name: JobName, userId: string): Promise<string> {
    const job = await this.queue.add(name, { userId, manual: true }, { priority: 1 });
    return job.id ?? 'queued';
  }

  /** What the settings screen shows: is anything scheduled, and did it run? */
  async status() {
    const [schedulers, counts, completed, failed, workers] = await Promise.all([
      this.queue.getJobSchedulers(),
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.queue.getJobs(['completed'], 0, 4),
      this.queue.getJobs(['failed'], 0, 4),
      // Asked of Redis, not of this process's own config: a worker running in
      // another container still has to make the screen say "worker running".
      //
      // Only ever used as a yes/no. The number counts named Redis *connections*
      // and a single worker process opens several, so reporting it as a count
      // of workers would be wrong in a way nobody would catch.
      this.queue.getWorkersCount().catch(() => 0),
    ]);

    return {
      // A worker has to be consuming for any of this to happen; say so plainly
      // rather than showing a schedule that nothing will ever execute.
      workerEnabled: workers > 0,
      schedules: schedulers.map((scheduler) => ({
        name: scheduler.name,
        pattern: scheduler.pattern,
        next: scheduler.next ? new Date(scheduler.next).toISOString() : null,
      })),
      counts,
      recent: [...completed, ...failed]
        .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))
        .slice(0, 5)
        .map((job) => ({
          name: job.name,
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          failed: Boolean(job.failedReason),
          // The reason, not the stack: the stack belongs in the worker's log.
          detail: job.failedReason ?? summarise(job.returnvalue),
        })),
    };
  }

  /** True when Redis is reachable. Used by /ready and the diagnostics page. */
  async reachable(): Promise<boolean> {
    try {
      // Resolves once the connection is usable and rejects if it is not, which
      // is the whole question — no need to reach past it for a raw PING.
      await this.queue.waitUntilReady();
      return true;
    } catch {
      return false;
    }
  }
}

function summarise(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.summary === 'string') return record.summary;
  return '';
}
