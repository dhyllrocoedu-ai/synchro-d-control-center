import { Injectable, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChatRealtimeService } from '../realtime/chat-realtime.service';
import { encryptContent, decryptContent } from '../../common/message-crypto';

interface VectorClock {
  [nodeId: string]: number;
}

interface SyncPullRequest {
  since: VectorClock;
  entityTypes: string[];
  limit?: number;
}

interface SyncPushRequest {
  operations: SyncOperation[];
  clientClock: VectorClock;
}

interface SyncOperation {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  vectorClock: VectorClock;
}

interface SyncConflict {
  entityType: string;
  entityId: string;
  localVersion: any;
  serverVersion: any;
  resolution?: 'local' | 'server' | 'merge';
}

@Injectable()
export class SyncService {
  constructor(
    @Inject(SUPABASE_CLIENT) private supabase: SupabaseClient,
    private realtime: ChatRealtimeService,
  ) {}

  async pull(data: SyncPullRequest, userId?: string) {
    const { since, entityTypes, limit = 1000 } = data;
    const entities: Record<string, any[]> = {};
    const conflicts: SyncConflict[] = [];

    // Chat entities are scoped to the rooms the user actually belongs to, so a
    // client never downloads messages (especially DMs) from rooms it isn't in.
    const scopedRoomIds = userId ? await this.getUserRoomIds(userId) : null;

    for (const entityType of entityTypes) {
      const result = await this.getEntitiesSince(entityType, since, limit, scopedRoomIds);
      entities[entityType] = result.entities;
      conflicts.push(...result.conflicts);
    }

    const serverClock = await this.getServerVectorClock();

    return { entities, serverClock, conflicts };
  }

  private async getUserRoomIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) return [];
    return [...new Set((data ?? []).map((r: any) => r.room_id))];
  }

  async push(data: SyncPushRequest) {
    const { operations, clientClock } = data;
    const applied: string[] = [];
    const conflicts: SyncConflict[] = [];

    for (const op of operations) {
      try {
        await this.applyOperation(op);
        applied.push(op.id);
      } catch (error) {
        conflicts.push({
          entityType: op.entityType,
          entityId: op.entityId,
          localVersion: op.payload,
          serverVersion: await this.getEntity(op.entityType, op.entityId)
        });
      }
    }

    const serverClock = this.mergeClocks(clientClock, await this.getServerVectorClock());

    return { serverClock, applied, conflicts };
  }

  private async getEntitiesSince(
    entityType: string,
    since: VectorClock,
    limit: number,
    scopedRoomIds?: string[] | null,
  ) {
    const tableMap: Record<string, string> = {
      'domains': 'domains',
      'tasks': 'tasks',
      'messages': 'messages',
      'approvals': 'approvals',
      'notes': 'notes',
      'chat_rooms': 'chat_rooms',
      'chat_room_members': 'chat_room_members',
      'users': 'users',
      'notifications': 'notifications',
      'user_preferences': 'user_preferences',
      'message_deletions': 'message_deletions'
    };

    const table = tableMap[entityType];
    if (!table) return { entities: [], conflicts: [] };

    // Column used to scope chat tables to the user's rooms. `null` means the
    // table is not room-scoped (workspace-global data).
    const chatScopeColumn: Record<string, string | null> = {
      'chat_rooms': 'id',
      'chat_room_members': 'room_id',
      'messages': 'room_id',
      'message_deletions': 'room_id',
    };

    const scopeColumn = chatScopeColumn[table];
    if (scopeColumn && scopedRoomIds) {
      // User belongs to no rooms yet → nothing scoped to return.
      if (scopedRoomIds.length === 0) return { entities: [], conflicts: [] };
    }

    // Only filter soft-deleted rows for tables where deleted rows should never
    // be pulled. Chat deletes must propagate, so messages/chat_room_members are
    // included in the pull even when soft-deleted.
    const tablesWithDeletedAt = new Set(['domains']);

    const sinceDate = this.vectorClockToDate(since);

    let query = this.supabase
      .from(table)
      .select('*')
      .gt('updated_at', sinceDate.toISOString());

    if (scopeColumn && scopedRoomIds) {
      query = query.in(scopeColumn, scopedRoomIds);
    }

    if (tablesWithDeletedAt.has(table)) {
      query = query.is('deleted_at', null);
    }

    const { data: entities, error } = await query
      .limit(limit)
      .order('updated_at', { ascending: true });

    if (error) throw new Error(error.message);

    const rows = entities ?? [];
    // Decrypt message content so clients receive plaintext (they store locally).
    const normalized = entityType === 'messages'
      ? rows.map((row: any) => ({ ...row, content: decryptContent(row.content) }))
      : rows;

    return { entities: normalized, conflicts: [] };
  }

  private async getEntity(entityType: string, entityId: string) {
    const tableMap: Record<string, string> = {
      'domains': 'domains',
      'tasks': 'tasks',
      'messages': 'messages',
      'approvals': 'approvals',
      'notes': 'notes',
      'chat_rooms': 'chat_rooms',
      'chat_room_members': 'chat_room_members',
      'users': 'users',
      'notifications': 'notifications',
      'user_preferences': 'user_preferences',
      'message_deletions': 'message_deletions'
    };

    const table = tableMap[entityType];
    if (!table) return null;

    const { data, error } = await this.supabase
      .from(table)
      .select('*')
      .eq('id', entityId)
      .single();

    if (error) return null;
    if (entityType === 'messages' && data) {
      return { ...data, content: decryptContent(data.content) };
    }
    return data;
  }

  private async applyOperation(op: SyncOperation) {
    const tableMap: Record<string, string> = {
      'domains': 'domains',
      'tasks': 'tasks',
      'messages': 'messages',
      'approvals': 'approvals',
      'notes': 'notes',
      'chat_rooms': 'chat_rooms',
      'chat_room_members': 'chat_room_members',
      'users': 'users',
      'notifications': 'notifications',
      'user_preferences': 'user_preferences',
      'message_deletions': 'message_deletions'
    };

    const table = tableMap[op.entityType];
    if (!table) throw new Error(`Unknown entity type: ${op.entityType}`);

    // Encrypt message content before it reaches the database so both the table
    // row and the change log never hold plaintext.
    const dbPayload = this.encryptPayload(op.entityType, op.payload);

    switch (op.operation) {
      case 'CREATE':
        const { error: createError } = await this.supabase
          .from(table)
          .upsert(dbPayload, { onConflict: 'id' });
        if (createError) throw new Error(createError.message);
        break;
      case 'UPDATE':
        const { error: updateError } = await this.supabase
          .from(table)
          .update(dbPayload)
          .eq('id', op.entityId);
        if (updateError) throw new Error(updateError.message);
        break;
      case 'DELETE':
        const { error: deleteError } = await this.supabase
          .from(table)
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', op.entityId);
        if (deleteError) throw new Error(deleteError.message);
        break;
    }

    await this.recordEntityChange({ ...op, payload: dbPayload });

    // Notify connected clients (web + desktop) so they refresh chat state.
    // The preview is built from the original plaintext payload.
    const chatEntities = new Set(['messages', 'chat_rooms', 'chat_room_members', 'message_deletions']);
    if (chatEntities.has(op.entityType)) {
      this.realtime.emitChange({
        entityType: op.entityType,
        roomId: op.payload?.room_id || (op.entityType === 'chat_rooms' ? op.entityId : undefined),
        actorId: op.payload?.user_id,
        preview: op.entityType === 'messages' && typeof op.payload?.content === 'string'
          ? op.payload.content.slice(0, 140)
          : undefined,
      });
    }
  }

  private encryptPayload(entityType: string, payload: any) {
    if (entityType === 'messages' && payload && typeof payload.content === 'string') {
      return { ...payload, content: encryptContent(payload.content) };
    }
    return payload;
  }

  private async recordEntityChange(op: SyncOperation) {
    await this.supabase
      .from('entity_changes')
      .insert({
        entity_type: op.entityType,
        entity_id: op.entityId,
        operation: op.operation,
        payload: op.payload,
        vector_clock: op.vectorClock
      });
  }

  private async getServerVectorClock(): Promise<VectorClock> {
    const { data: latestChange, error } = await this.supabase
      .from('entity_changes')
      .select('vector_clock')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !latestChange) return {};
    return latestChange.vector_clock as VectorClock;
  }

  private mergeClocks(clock1: VectorClock, clock2: VectorClock): VectorClock {
    const allKeys = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
    const merged: VectorClock = {};
    for (const key of allKeys) {
      merged[key] = Math.max(clock1[key] || 0, clock2[key] || 0);
    }
    return merged;
  }

  private vectorClockToDate(clock: VectorClock): Date {
    const maxValue = Math.max(...Object.values(clock), 0);
    return new Date(maxValue * 1000);
  }
}