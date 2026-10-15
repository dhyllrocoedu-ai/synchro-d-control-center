import { getClient } from '../database';
import { pendingOpsRepo, settingsRepo } from '../database/repositories';
import log from 'electron-log';
import { now } from '../database/repositories';

let syncEngineInstance: SyncEngine | null = null;

export function getSyncEngineInstance(): SyncEngine | null {
  return syncEngineInstance;
}

interface VectorClock {
  [nodeId: string]: number;
}

interface SyncedEntity {
  id: string;
  vectorClock: VectorClock;
  [key: string]: any;
}

interface SyncPullResponse {
  entities: Record<string, SyncedEntity[]>;
  serverClock: VectorClock;
  conflicts: any[];
}

interface SyncPushResponse {
  serverClock: VectorClock;
  applied: string[];
  conflicts: any[];
}

function safeParse(value: unknown): any {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value ?? '{}'));
  } catch {
    return {};
  }
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
}

// Columns that are stored as epoch SECONDS locally but as TIMESTAMPTZ in Supabase.
const TIMESTAMP_FIELDS = new Set([
  'created_at', 'updated_at', 'last_synced_at', 'deleted_at', 'expiry_date',
  'checked_at', 'next_check_at', 'due_date', 'completed_at', 'current_period_end',
  'joined_at', 'last_read_at', 'decided_at',
]);

function secondsToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function isoToSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// Convert a local (camelCase, epoch-seconds) row into a Supabase (snake_case, ISO) payload.
function toServerPayload(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    const serverKey = camelToSnake(key);
    out[serverKey] = TIMESTAMP_FIELDS.has(serverKey) ? secondsToIso(value) : value;
  }
  return out;
}

export class SyncEngine {
  private nodeId: string;
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private baseUrl: string;
  private authToken: string | null = null;
  private tokenRefresher?: () => Promise<boolean>;
  private columnCache: Record<string, Set<string>> = {};

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.nodeId = `desktop-${require('os').hostname()}-${Date.now()}`;
    this.baseUrl = baseUrl;
  }
  
  setAuthToken(token: string) {
    this.authToken = token;
  }

  setTokenRefresher(refresher: () => Promise<boolean>) {
    this.tokenRefresher = refresher;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // POST JSON with the current bearer token; on 401 refresh once and retry.
  private async request(path: string, body: unknown): Promise<Response> {
    const doFetch = () => fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify(body)
    });

    const maxRetries = 3;
    const baseDelay = 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let response = await doFetch();
        if (response.status === 401 && this.tokenRefresher) {
          const refreshed = await this.tokenRefresher();
          if (refreshed) {
            response = await doFetch();
          }
        }
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isNetworkError = lastError.message.includes('ECONNREFUSED') ||
          lastError.message.includes('fetch failed') ||
          lastError.message.includes('network') ||
          lastError.message.includes('ENOTFOUND');
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          log.warn(`Network error on ${path} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);
          await new Promise(r => setTimeout(r, delay));
          // Wait for backend to be healthy before retrying
          try {
            await this.waitForHealth();
          } catch {
            log.warn('Backend health check failed before retry');
          }
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async waitForHealth(): Promise<void> {
    const healthUrl = `${this.baseUrl}/api/health`;
    const maxAttempts = 5;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(healthUrl, { method: 'GET' });
        if (res.ok) return;
      } catch {
        // ignore
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.syncInterval = setInterval(() => this.sync(), 30000);
    this.sync();
    
    log.info('Sync engine started');
  }
  
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    log.info('Sync engine stopped');
  }
  
  async sync(): Promise<boolean> {
    if (!this.authToken) {
      log.debug('No auth token, skipping sync');
      return false;
    }
    
    try {
      await this.pull();
      await this.push();
      await settingsRepo.set('lastSyncedAt', now());
      log.debug('Sync completed successfully');
      return true;
    } catch (err) {
      log.error('Sync failed:', err);
      return false;
    }
  }
  
  // Pull a subset of entity types. Used for low-latency chat refreshes so the
  // UI updates immediately instead of waiting for the full multi-entity sync.
  // NOTE: this deliberately does NOT advance the local vector clock — advancing
  // it from a partial pull would skip non-chat changes. The full sync() that
  // follows in the background reconciles everything and advances the clock.
  private async pullEntities(entityTypes: string[], advanceClock: boolean) {
    const since = await this.getLocalVectorClock();
    const response = await this.request('/api/sync/pull', { since, entityTypes });

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.statusText}`);
    }

    const result = await response.json() as SyncPullResponse;

    for (const [entityType, entities] of Object.entries(result.entities)) {
      await this.applyEntities(entityType, entities);
    }

    if (result.conflicts?.length) {
      await this.handleConflicts(result.conflicts);
    }

    if (advanceClock) {
      await this.setLocalVectorClock(result.serverClock);
    }
  }

  private async pull() {
    const entityTypes = ['domains', 'tasks', 'messages', 'approvals', 'notes', 'chat_rooms', 'chat_room_members', 'message_deletions', 'users', 'notifications', 'user_preferences'];
    await this.pullEntities(entityTypes, true);
  }

  // Fast path for realtime chat changes: fetch only chat-related entities.
  async pullChat(): Promise<boolean> {
    if (!this.authToken) return false;
    try {
      await this.pullEntities(['messages', 'chat_rooms', 'chat_room_members', 'message_deletions'], false);
      return true;
    } catch (err) {
      log.error('Chat pull failed:', err);
      return false;
    }
  }
  
  private async push() {
    const pendingOps = await pendingOpsRepo.getAll();
    if (pendingOps.length === 0) return;
    
    const clientClock = await this.getLocalVectorClock();
    
    const operations = pendingOps.map(op => ({
      id: op.id,
      entityType: op.entityType,
      entityId: op.entityId,
      operation: op.operation,
      payload: toServerPayload((op.payload as Record<string, any>) || {}),
      vectorClock: op.vectorClock
    }));
    
    const response = await this.request('/api/sync/push', { operations, clientClock });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.statusText}`);
    }
    
    const result = await response.json() as SyncPushResponse;
    
    for (const opId of result.applied) {
      await pendingOpsRepo.remove(opId);
    }
    
    if (result.conflicts?.length) {
      await this.handleConflicts(result.conflicts);
    }
    
    await this.setLocalVectorClock(result.serverClock);
  }
  
  private async getLocalVectorClock(): Promise<VectorClock> {
    const clock = await settingsRepo.get('vectorClock');
    return (clock as VectorClock) || {};
  }
  
  private async setLocalVectorClock(clock: VectorClock) {
    await settingsRepo.set('vectorClock', clock);
  }
  
  private async applyEntities(entityType: string, entities: SyncedEntity[]) {
    const tableMap: Record<string, string> = {
      'domains': 'domains',
      'tasks': 'tasks',
      'messages': 'messages',
      'approvals': 'approvals',
      'notes': 'notes',
      'chat_rooms': 'chat_rooms',
      'chat_room_members': 'chat_room_members',
      'message_deletions': 'message_deletions',
      'users': 'users',
      'notifications': 'notifications',
      'user_preferences': 'user_preferences'
    };

    const table = tableMap[entityType];
    if (!table) return;

    for (const raw of entities) {
      const entity: SyncedEntity = { ...(raw as any) };

      // Supabase returns ISO timestamps; store epoch SECONDS locally.
      for (const key of Object.keys(entity)) {
        if (TIMESTAMP_FIELDS.has(key)) {
          entity[key] = isoToSeconds(entity[key]);
        }
      }

      const remoteClock = safeParse(entity.vector_clock) as VectorClock;
      entity.vectorClock = remoteClock;

      const local = await this.getLocalEntity(table, entity.id);

      if (!local) {
        await this.insertEntity(table, entity);
      } else {
        // Soft-deletes always win so deletions propagate across devices even
        // when the vector clock is unchanged.
        const remoteDeleted = (entity as any).deleted_at != null;
        const localDeleted = (local as any).deleted_at != null;
        if (remoteDeleted && !localDeleted) {
          await this.updateEntity(table, entity);
          continue;
        }
        const comparison = this.compareClocks(local.vectorClock || {}, remoteClock);
        if (comparison === 'before' || comparison === 'concurrent') {
          await this.updateEntity(table, entity);
        }
      }
    }
  }

  private async getLocalColumns(table: string): Promise<Set<string>> {
    if (!this.columnCache[table]) {
      const result = await getClient().execute(`PRAGMA table_info(${table})`);
      this.columnCache[table] = new Set(result.rows.map((r: any) => String(r.name)));
    }
    return this.columnCache[table];
  }
  
  private async getLocalEntity(table: string, id: string): Promise<SyncedEntity | null> {
    const client = getClient();
    const result = await client.execute({
      sql: `SELECT * FROM ${table} WHERE id = ?`,
      args: [id]
    });
    
    if (!result.rows.length) return null;
    
    const row = result.rows[0] as any;
    return {
      ...row,
      id: row.id,
      vectorClock: JSON.parse(row.vector_clock as string || '{}'),
      data: row.data ? JSON.parse(row.data as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined
    } as SyncedEntity;
  }
  
  private async insertEntity(table: string, entity: SyncedEntity) {
    const client = getClient();
    const allowed = await this.getLocalColumns(table);
    const columns = Object.keys(entity).filter(k => k !== 'id' && allowed.has(k));
    const placeholders = columns.map(() => '?').join(', ');
    
    await client.execute({
      sql: `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES (?, ${placeholders})`,
      args: [entity.id, ...columns.map(c => {
        const val = entity[c];
        return val !== null && typeof val === 'object' ? JSON.stringify(val) : val;
      })]
    });
  }
  
  private async updateEntity(table: string, entity: SyncedEntity) {
    const client = getClient();
    const allowed = await this.getLocalColumns(table);
    const columns = Object.keys(entity).filter(k => k !== 'id' && allowed.has(k));
    const setClause = columns.map(c => `${c} = ?`).join(', ');
    
    await client.execute({
      sql: `UPDATE ${table} SET ${setClause} WHERE id = ?`,
      args: [...columns.map(c => {
        const val = entity[c];
        return val !== null && typeof val === 'object' ? JSON.stringify(val) : val;
      }), entity.id]
    });
  }
  
  private compareClocks(local: VectorClock, remote: VectorClock): 'before' | 'after' | 'concurrent' | 'equal' {
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    let localGreater = false;
    let remoteGreater = false;
    
    for (const key of allKeys) {
      const l = local[key] || 0;
      const r = remote[key] || 0;
      if (l > r) localGreater = true;
      if (r > l) remoteGreater = true;
    }
    
    if (localGreater && !remoteGreater) return 'after';
    if (remoteGreater && !localGreater) return 'before';
    if (!localGreater && !remoteGreater) return 'equal';
    return 'concurrent';
  }
  
  private async handleConflicts(conflicts: any[]) {
    for (const conflict of conflicts) {
      log.warn(`Conflict detected for ${conflict.entityType}:${conflict.entityId}`, conflict);
    }
  }
}

export const syncEngine = new SyncEngine();