import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Global for the same reason the indexer is: anything in the application may
 * have a reason to raise a notification, and a module graph that records which
 * ones currently do would only need editing every time that changes.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, MailService],
  exports: [NotificationsService, MailService],
})
export class NotificationsModule {}
