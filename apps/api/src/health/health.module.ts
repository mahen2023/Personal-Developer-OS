import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { HealthController } from './health.controller';

@Module({
  // For the Redis check. AiModule is global, so only this one is imported.
  imports: [JobsModule],
  controllers: [HealthController],
})
export class HealthModule {}
