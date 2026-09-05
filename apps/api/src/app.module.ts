import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { configuration } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { ActivityModule } from './activity/activity.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StorageModule } from './storage/storage.module';
import { TagsModule } from './tags/tags.module';
import { LinksModule } from './links/links.module';
import { ProjectsModule } from './projects/projects.module';
import { NotesModule } from './notes/notes.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { SearchModule } from './search/search.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { SolutionsModule } from './solutions/solutions.module';
import { IssuesModule } from './issues/issues.module';
import { SnippetsModule } from './snippets/snippets.module';
import { CommandsModule } from './commands/commands.module';
import { AdrsModule } from './adrs/adrs.module';
import { MeetingsModule } from './meetings/meetings.module';
import { IdeasModule } from './ideas/ideas.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { LearningModule } from './learning/learning.module';
import { ServersModule } from './servers/servers.module';
import { DatabasesModule } from './databases/databases.module';
import { EnvironmentsModule } from './environments/environments.module';
import { DomainsModule } from './domains/domains.module';
import { CertificatesModule } from './certificates/certificates.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { VaultModule } from './vault/vault.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { FriendlyThrottlerGuard } from './common/guards/throttler.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
      // One .env at the repo root serves api, worker and compose. In docker the
      // file is absent and the values arrive as real environment variables.
      envFilePath: ['../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    // The floor for everything, not the real protection: the endpoints worth
    // attacking (login, unlock, connecting an integration) carry their own much
    // tighter @Throttle. This only has to stop a runaway loop, and 120/min was
    // low enough that ordinary fast keyboard navigation — three or four calls
    // per screen — could reach it and make a panel silently fail to load.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 400 }]),
    // Global because JwtAuthGuard is an APP_GUARD and is instantiated here,
    // outside AuthModule. Secrets are passed per call, never registered.
    JwtModule.register({ global: true }),
    PrismaModule,
    StorageModule,
    ActivityModule,
    TagsModule,
    LinksModule,
    UsersModule,
    AuthModule,

    // Phase 2 — core knowledge
    ProjectsModule,
    NotesModule,
    TasksModule,
    DocumentsModule,
    SearchModule,

    // Phase 3 — developer system
    RepositoriesModule,
    SolutionsModule,
    IssuesModule,
    SnippetsModule,
    CommandsModule,
    AdrsModule,
    MeetingsModule,
    IdeasModule,
    BookmarksModule,
    LearningModule,

    // Phase 4 — infrastructure
    EnvironmentsModule,
    ServersModule,
    DatabasesModule,
    DomainsModule,
    CertificatesModule,
    DeploymentsModule,

    // Phase 5 — the vault
    VaultModule,

    // Phase 6 — retrieval over what you have written
    AiModule,

    // Phase 7 — the parts that run without you
    NotificationsModule,
    JobsModule,

    // Phase 8 — optional connections to the outside world
    IntegrationsModule,

    DashboardModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit before authentication so an unauthenticated
    // flood is rejected without touching Argon2.
    { provide: APP_GUARD, useClass: FriendlyThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
