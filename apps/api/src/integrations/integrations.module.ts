import { Global, Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

/**
 * Phase 8. Every integration is optional and the application is complete
 * without any of them — nothing here is a dependency of anything else, which
 * is why this module is last in the graph and exports only its service.
 */
@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
