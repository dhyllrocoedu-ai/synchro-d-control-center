import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { join } from 'path';
import { app } from 'electron';
import { mkdirSync, existsSync } from 'fs';
import log from 'electron-log';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let clientInstance: ReturnType<typeof createClient> | null = null;

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
}

// Alias for backward compatibility
export function getRawDatabase(): ReturnType<typeof createClient> {
  return getClient();
}

export function getClient(): ReturnType<typeof createClient> {
  if (!clientInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return clientInstance;
}

export async function initializeDatabase(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  const userDataPath = app.getPath('userData');
  const dbDir = join(userDataPath, 'database');
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  const dbPath = join(dbDir, 'synch-cc.db');
  const isFirstRun = !existsSync(dbPath);
  
// @libsql/client uses file: protocol for local databases
  clientInstance = createClient({ url: `file:${dbPath}` });
  
  // Enable WAL mode and other pragmas (execute individually, not in batch)
  await clientInstance.execute('PRAGMA journal_mode = WAL');
  await clientInstance.execute('PRAGMA foreign_keys = ON');
  await clientInstance.execute('PRAGMA busy_timeout = 5000');
  
  dbInstance = drizzle(clientInstance, { schema });

  if (isFirstRun) {
    await runMigrations();
    await seedInitialData();
    log.info('Database initialized at:', dbPath);
  } else {
    await runMigrations();
    log.info('Database opened at:', dbPath);
  }

  await runIntegrityCheck();
  
  return dbInstance;
}

async function addColumn(table: string, definition: string): Promise<void> {
  if (!clientInstance) return;
  try {
    await clientInstance.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (e) {
    const message = (e as Error)?.message ?? '';
    if (!message.includes('duplicate column name')) {
      log.warn(`Failed to add column ${definition} to ${table}:`, e);
    }
  }
}

async function runMigrations(): Promise<void> {
  if (!clientInstance) throw new Error('Client not initialized');
  
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT CHECK(role IN ('ADMIN', 'MANAGER', 'MEMBER', 'VIEWER')) DEFAULT 'MEMBER',
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('MANAGED', 'MONITORED')) DEFAULT 'MONITORED',
      status TEXT CHECK(status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'PENDING_TRANSFER', 'ERROR')) DEFAULT 'ACTIVE',
      registrar TEXT,
      registrar_domain_id TEXT,
      nameservers TEXT DEFAULT '[]',
      auth_code TEXT UNIQUE,
      expiry_date INTEGER,
      auto_renew INTEGER DEFAULT 1,
      monitoring_enabled INTEGER DEFAULT 1,
      check_interval INTEGER DEFAULT 3600,
      price_per_year REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      assignee_id TEXT REFERENCES users(id),
      subscription_id TEXT,
      chat_room_id TEXT,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      deleted_at INTEGER
    )`,
    
    `CREATE INDEX IF NOT EXISTS domains_status_idx ON domains(status)`,
    `CREATE INDEX IF NOT EXISTS domains_expiry_idx ON domains(expiry_date)`,
    `CREATE INDEX IF NOT EXISTS domains_sync_idx ON domains(last_synced_at)`,
    
    `CREATE TABLE IF NOT EXISTS domain_checks (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('WHOIS', 'DNS', 'SSL', 'EXPIRY', 'REGISTRAR_LOCK')) NOT NULL,
      status TEXT CHECK(status IN ('OK', 'WARNING', 'CRITICAL', 'UNKNOWN')) NOT NULL,
      data TEXT NOT NULL,
      previous_data TEXT,
      checked_at INTEGER DEFAULT (strftime('%s', 'now')),
      next_check_at INTEGER,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER
    )`,
    
    `CREATE INDEX IF NOT EXISTS checks_domain_type_time_idx ON domain_checks(domain_id, type, checked_at)`,
    
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL UNIQUE REFERENCES domains(id),
      plan_id TEXT NOT NULL,
      status TEXT CHECK(status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING')) DEFAULT 'ACTIVE',
      billing_cycle TEXT CHECK(billing_cycle IN ('MONTHLY', 'YEARLY')) DEFAULT 'YEARLY',
      current_period_end INTEGER NOT NULL,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      type TEXT CHECK(type IN ('DOMAIN', 'GENERAL', 'DIRECT', 'GROUP')) DEFAULT 'DOMAIN',
      domain_id TEXT UNIQUE REFERENCES domains(id),
      invite_code TEXT UNIQUE,
      dm_key TEXT UNIQUE,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE INDEX IF NOT EXISTS chat_rooms_invite_code_idx ON chat_rooms(invite_code)`,
    `CREATE INDEX IF NOT EXISTS chat_rooms_dm_key_idx ON chat_rooms(dm_key)`,

    `CREATE TABLE IF NOT EXISTS chat_room_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      role TEXT CHECK(role IN ('ADMIN', 'MEMBER')) DEFAULT 'MEMBER',
      joined_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_read_at INTEGER,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      deleted_at INTEGER,
      updated_at INTEGER,
      UNIQUE(user_id, room_id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT CHECK(type IN ('TEXT', 'SYSTEM', 'TASK_CREATED', 'APPROVAL_REQUESTED', 'DOMAIN_UPDATE', 'NOTE_ADDED')) DEFAULT 'TEXT',
      metadata TEXT,
      user_id TEXT NOT NULL REFERENCES users(id),
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      reply_to_id TEXT REFERENCES messages(id),
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      deleted_at INTEGER
    )`,
    
    `CREATE INDEX IF NOT EXISTS messages_room_time_idx ON messages(room_id, created_at)`,

    `CREATE TABLE IF NOT EXISTS message_deletions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(message_id, user_id)
    )`,

    `CREATE INDEX IF NOT EXISTS message_deletions_unique_idx ON message_deletions(message_id, user_id)`,

    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED')) DEFAULT 'TODO',
      priority TEXT CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
      domain_id TEXT REFERENCES domains(id),
      assignee_id TEXT REFERENCES users(id),
      creator_id TEXT NOT NULL REFERENCES users(id),
      due_date INTEGER,
      completed_at INTEGER,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE INDEX IF NOT EXISTS tasks_domain_status_idx ON tasks(domain_id, status)`,
    `CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON tasks(assignee_id, status)`,
    
    `CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('RENEWAL', 'TRANSFER', 'DNS_CHANGE', 'DELETE', 'CUSTOM')) NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')) DEFAULT 'PENDING',
      domain_id TEXT NOT NULL REFERENCES domains(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      approver_id TEXT REFERENCES users(id),
      metadata TEXT NOT NULL,
      decided_at INTEGER,
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE INDEX IF NOT EXISTS approvals_domain_status_idx ON approvals(domain_id, status)`,
    `CREATE INDEX IF NOT EXISTS approvals_approver_status_idx ON approvals(approver_id, status)`,
    
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE INDEX IF NOT EXISTS notes_domain_time_idx ON notes(domain_id, created_at)`,
    
    `CREATE TABLE IF NOT EXISTS pending_operations (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT CHECK(operation IN ('CREATE', 'UPDATE', 'DELETE')) NOT NULL,
      payload TEXT NOT NULL,
      vector_clock TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_attempt_at INTEGER
    )`,
    
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('DOMAIN_EXPIRY','DOMAIN_CHECK_FAILED','SSL_EXPIRY','DNS_CHANGE','REGISTRAR_LOCK_CHANGE','APPROVAL_REQUESTED','APPROVAL_APPROVED','APPROVAL_REJECTED','TASK_ASSIGNED','TASK_UPDATED','TASK_COMPLETED','MENTION','SYNC_CONFLICT','SYNC_COMPLETED','SYNC_FAILED','WHOIS_CHANGE','REGISTRAR_LOCK_CHANGE','DNS_MISMATCH','CUSTOM')) NOT NULL,
      severity TEXT CHECK(severity IN ('INFO','WARNING','CRITICAL')) DEFAULT 'INFO',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      action_url TEXT,
      read INTEGER DEFAULT 0,
      data TEXT DEFAULT '{}',
      vector_clock TEXT DEFAULT '{}',
      last_synced_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    
    `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id)`,
    `CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read)`,
    
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      timezone TEXT DEFAULT 'UTC',
      date_format TEXT DEFAULT 'MM/DD/YYYY',
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'en',
      notification_preferences TEXT DEFAULT '{"domain_expiry":true,"ssl_expiry":true,"dns_changes":false,"registrar_lock":true,"whois_changes":false,"task_assignments":true,"approval_requests":true,"mentions":true,"sync_conflicts":true,"weekly_digest":false}',
      sync_preferences TEXT DEFAULT '{"auto_sync":true,"sync_on_startup":true,"conflict_resolution":"prompt"}',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`
  ];
  
await clientInstance!.batch(statements);

  // Add columns introduced after the initial schema. These ALTERs run after the
  // CREATE TABLE statements above (so the tables always exist) and are
  // idempotent; on an existing database they fail with "duplicate column name",
  // which we ignore silently so the logs stay clean.
  await addColumn('chat_rooms', 'invite_code TEXT');
  await addColumn('chat_rooms', 'description TEXT');
  await addColumn('chat_rooms', 'dm_key TEXT');
  await addColumn('chat_room_members', 'deleted_at INTEGER');
  await addColumn('chat_room_members', 'updated_at INTEGER');
  await addColumn('messages', 'deleted_at INTEGER');
}

async function seedInitialData() {
  if (!clientInstance) return;
  log.info('No seed data required (registration creates the first user)');
}

async function runIntegrityCheck() {
  if (!clientInstance) return;
  
  try {
    const result = await clientInstance.execute('PRAGMA integrity_check');
    if (result.rows[0]?.integrity_check !== 'ok') {
      log.error('Database integrity check failed:', result.rows[0]?.integrity_check);
    } else {
      log.debug('Database integrity check passed');
    }
  } catch (err) {
    log.error('Integrity check error:', err);
  }
}

export async function backupDatabase(backupPath: string): Promise<void> {
  if (!clientInstance) throw new Error('Database not initialized');
  
  // For libSQL, we can use the backup command
  await clientInstance.execute(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
}

export async function closeDatabase(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close();
    clientInstance = null;
    dbInstance = null;
  }
}

// Re-export schema types for convenience
export * from './schema';