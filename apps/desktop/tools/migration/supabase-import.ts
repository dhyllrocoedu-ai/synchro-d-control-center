import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../electron/database/schema';

interface MigrationOptions {
  supabaseUrl: string;
  supabaseKey: string;
  dryRun?: boolean;
}

async function migrateFromSupabase(options: MigrationOptions) {
  const { supabaseUrl, supabaseKey, dryRun = false } = options;

  console.log('🔄 Starting Supabase migration...');
  console.log(`Dry run: ${dryRun}`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const tables = [
    'users', 'domains', 'domain_checks', 'subscriptions',
    'chat_rooms', 'chat_room_members', 'messages',
    'tasks', 'approvals', 'notes'
  ];

  const results: Record<string, number> = {};

  for (const table of tables) {
    console.log(`\n📦 Migrating ${table}...`);
    const count = await migrateTable(supabase, table, dryRun);
    results[table] = count;
    console.log(`  ${dryRun ? 'Would migrate' : 'Migrated'} ${count} rows`);
  }

  console.log('\n✅ Migration complete!');
  console.table(results);

  if (!dryRun) {
    console.log('\n🔧 Setting vector clocks...');
    await setVectorClocks();
    console.log('Vector clocks initialized.');
  }
}

async function migrateTable(supabase: any, table: string, dryRun: boolean): Promise<number> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  if (dryRun) return data.length;

  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  for (const row of data) {
    const mapped = mapRow(table, row);
    await db.insert((schema as any)[table]).values(mapped).onConflictDoUpdate({
      target: (schema as any)[table].id,
      set: mapped
    });
  }

  return data.length;
}

function mapRow(table: string, row: any): any {
  const mapped = { ...row };
  
  for (const key of Object.keys(mapped)) {
    if (key.endsWith('_at') && mapped[key]) {
      mapped[key] = new Date(mapped[key]).getTime();
    }
    if (typeof mapped[key] === 'object' && mapped[key] !== null) {
      mapped[key] = JSON.stringify(mapped[key]);
    }
  }

  if (!mapped.vector_clock) mapped.vector_clock = { 'supabase': 1 };
  if (typeof mapped.vector_clock === 'string') mapped.vector_clock = JSON.parse(mapped.vector_clock);

  return mapped;
}

async function setVectorClocks() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  
  const tables = [
    'users', 'domains', 'domain_checks', 'subscriptions',
    'chat_rooms', 'chat_room_members', 'messages', 'tasks', 'approvals', 'notes'
  ];

  for (const table of tables) {
    await db.update((schema as any)[table])
      .set({ vectorClock: { 'supabase': 1 }, lastSyncedAt: Date.now() });
  }
}

const program = new Command();

program
  .name('migrate:supabase')
  .description('Migrate data from Supabase to local SQLite')
  .requiredOption('--supabase-url <url>', 'Supabase project URL')
  .requiredOption('--supabase-key <key>', 'Supabase anon/service key')
  .option('--dry-run', 'Preview migration without writing')
  .action(async (options) => {
    try {
      await migrateFromSupabase(options);
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  });

program.parse();
