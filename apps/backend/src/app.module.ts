import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './modules/auth/auth.module';
import { DomainsModule } from './modules/domains/domains.module';
import { SyncModule } from './modules/sync/sync.module';
import { ChatModule } from './modules/chat/chat.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { BillingModule } from './modules/billing/billing.module';
import { MigrationModule } from './modules/migration/migration.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthController } from './health/health.controller';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env')
    }),
    SupabaseModule,
    AuthModule,
    DomainsModule,
    SyncModule,
    ChatModule,
    TasksModule,
    NotesModule,
    ApprovalsModule,
    BillingModule,
    MigrationModule,
    NotificationsModule,
    RealtimeModule
  ],
  controllers: [HealthController]
})
export class AppModule {}