import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './config/configuration';

/**
 * Background process for the BullMQ consumers and the nightly scans (§45, §46).
 *
 * It shares AppModule so jobs reuse the same services as the API, but runs
 * without an HTTP listener — a scan over every certificate never competes with
 * a request. `WORKER=true` is what makes this process consume: the API creates
 * the same queue objects, and would otherwise pick jobs up itself.
 */
async function bootstrapWorker(): Promise<void> {
  process.env.WORKER = 'true';
  validateEnv();

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  // Nothing flushes the buffer here: an HTTP app flushes when it starts
  // listening, and this one never does. Without this the worker runs silently,
  // which is the worst possible property for a background process.
  app.flushLogs();

  // Lets BullMQ finish the job in flight before the process exits, instead of
  // leaving it stalled until the visibility timeout expires.
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started — consuming the devos queue');
}

void bootstrapWorker();
