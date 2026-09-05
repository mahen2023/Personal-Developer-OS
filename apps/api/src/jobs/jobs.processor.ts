import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BackupService } from './backup.service';
import { ScansService, type ScanReport } from './scans.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { QUEUE, type JobPayload, type JobName } from './jobs.service';

/**
 * The consumer.
 *
 * `autorun: false` matters: the class is registered in both processes, and
 * without it the API would start pulling jobs off the queue the moment it
 * booted — which is exactly what a separate worker exists to prevent. Only
 * the worker calls `run()`, so in the API this object can enqueue and inspect
 * but never processes anything.
 *
 * Pausing after the fact is not equivalent, and was the first thing tried: the
 * API had already claimed a job before the pause landed.
 */
@Processor(QUEUE, { concurrency: 1, autorun: false })
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly scans: ScansService,
    private readonly backups: BackupService,
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onModuleInit(): void {
    // Enqueuing still works in the API, so "run now" reaches the worker by
    // exactly the same path the nightly schedule does.
    if (this.config.get<boolean>('jobs.enabled')) void this.worker.run();
  }

  async process(job: Job<JobPayload>): Promise<{ summary: string }> {
    const started = Date.now();
    const name = job.name as JobName;

    switch (name) {
      case 'scan': {
        const reports = job.data.userId
          ? await this.scans.runFor(job.data.userId)
          : await this.scans.runAll();
        return { summary: this.report(reports, started) };
      }

      case 'sync': {
        const users = job.data.userId ? [job.data.userId] : await this.scans.activeUserIds();
        let updated = 0;
        let created = 0;
        for (const userId of users) {
          for (const result of await this.integrations.syncAll(userId)) {
            updated += result.updated;
            created += result.created;
          }
        }
        const summary = `${updated} updated, ${created} created in ${Date.now() - started}ms`;
        this.logger.log(`Sync: ${summary}`);
        return { summary };
      }

      case 'backup': {
        const result = await this.backups.create(job.data.userId);
        this.logger.log(`Backup ${result.file} (${(result.bytes / 1024).toFixed(0)} KB)`);
        return { summary: `${result.file} · ${(result.bytes / 1024).toFixed(0)} KB` };
      }

      default:
        // A name the worker does not know is a deployment mismatch, not a
        // transient failure — say which name, and let it fail loudly.
        throw new Error(`No handler for job "${String(name)}".`);
    }
  }

  private report(reports: ScanReport[], started: number): string {
    const raised = reports.reduce((sum, report) => sum + report.raised, 0);
    const cleared = reports.reduce((sum, report) => sum + report.cleared, 0);
    const summary = `${raised} raised, ${cleared} cleared in ${Date.now() - started}ms`;
    this.logger.log(`Scan: ${summary}`);
    return summary;
  }
}
