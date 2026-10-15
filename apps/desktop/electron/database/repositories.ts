import { getDatabase } from './index';
import { eq, desc, and, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from './schema';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import log from 'electron-log';

const db = new Proxy({} as ReturnType<typeof getDatabase>, {
  get(_target, prop) {
    const live = getDatabase();
    const value = live[prop as keyof ReturnType<typeof getDatabase>];
    return typeof value === 'function' ? value.bind(live) : value;
  }
});

function generateId(): string {
  return uuidv4();
}

const DM_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

function generateDeterministicRoomId(dmKey: string): string {
  return uuidv5(dmKey, DM_NAMESPACE);
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function incrementVectorClock(clock: Record<string, number>, nodeId: string): Record<string, number> {
  return { ...clock, [nodeId]: (clock[nodeId] || 0) + 1 };
}

// Helper to parse JSON fields from database
function parseJsonFields(row: any, jsonFields: string[]): any {
  const result = { ...row };
  for (const field of jsonFields) {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }
  return result;
}

const JSON_FIELDS = {
  users: ['vectorClock'],
  domains: ['nameservers', 'vectorClock'],
  domainChecks: ['data', 'previousData', 'vectorClock'],
  subscriptions: ['vectorClock'],
  chatRooms: ['vectorClock', 'inviteCode'],
  chatRoomMembers: ['vectorClock'],
  messages: ['metadata', 'vectorClock'],
  tasks: ['vectorClock'],
  approvals: ['metadata', 'vectorClock'],
  notes: ['vectorClock'],
  notifications: ['data', 'vectorClock'],
  user_preferences: ['notificationPreferences', 'syncPreferences', 'vectorClock'],
  pendingOperations: ['payload', 'vectorClock'],
  settings: ['value'],
};

function parseRow(table: keyof typeof JSON_FIELDS, row: any) {
  if (!row) return row;
  return parseJsonFields(row, JSON_FIELDS[table] || []);
}

export const userRepo = {
  async create(data: Omit<schema.NewUser, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.users).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    return parseRow('users', row);
  },
  
  async getByEmail(email: string) {
    const row = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    return parseRow('users', row);
  },
  
  async list() {
    const rows = await db.select().from(schema.users).all();
    return rows.map(r => parseRow('users', r));
  },
  
  async update(id: string, data: Partial<schema.NewUser>, nodeId: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId);
    
    await db.update(schema.users)
      .set({ ...data, vectorClock: newClock, updatedAt: now() })
      .where(eq(schema.users.id, id));
    
    return this.getById(id);
  },

  async upsert(data: {
    id: string;
    email: string;
    name: string;
    role?: string;
    avatarUrl?: string | null;
  }) {
    const timestamp = now();
    await db.insert(schema.users)
      .values({
        id: data.id,
        email: data.email,
        name: data.name,
        role: (data.role as any) ?? 'MEMBER',
        avatarUrl: data.avatarUrl ?? null,
        vectorClock: { [data.id]: 1 },
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email: data.email,
          name: data.name,
          role: (data.role as any) ?? 'MEMBER',
          avatarUrl: data.avatarUrl ?? null,
          updatedAt: timestamp
        }
      });
    return this.getById(data.id);
  }
};

export const domainRepo = {
  async create(data: Omit<schema.NewDomain, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.domains).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get();
    return parseRow('domains', row);
  },
  
  async list(filters?: { status?: string; type?: string; assigneeId?: string }) {
    const conditions = [isNull(schema.domains.deletedAt)];
    if (filters?.status) conditions.push(eq(schema.domains.status, filters.status as any));
    if (filters?.type) conditions.push(eq(schema.domains.type, filters.type as any));
    if (filters?.assigneeId) conditions.push(eq(schema.domains.assigneeId, filters.assigneeId));
    
    const rows = await db.select()
      .from(schema.domains)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.domains.updatedAt))
      .all();
    
    return rows.map(r => parseRow('domains', r));
  },
  
  async getExpiring(days: number = 30) {
    const cutoff = now() + (days * 86400);
    const rows = await db.select()
      .from(schema.domains)
      .where(and(
        gte(schema.domains.expiryDate, now()),
        lte(schema.domains.expiryDate, cutoff)
      ))
      .orderBy(schema.domains.expiryDate)
      .all();
    
    return rows.map(r => parseRow('domains', r));
  },
  
  async getMonitoringEnabled() {
    const rows = await db.select()
      .from(schema.domains)
      .where(and(
        eq(schema.domains.monitoringEnabled, true),
        isNull(schema.domains.deletedAt)
      ))
      .all();
    
    return rows.map(r => parseRow('domains', r));
  },
  
  async update(id: string, data: Partial<schema.NewDomain>, nodeId: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId);
    
    await db.update(schema.domains)
      .set({ ...data, vectorClock: newClock, updatedAt: now() })
      .where(eq(schema.domains.id, id));
    
    return this.getById(id);
  },
  
  async delete(id: string, nodeId: string) {
    const existing = await this.getById(id);
    if (!existing) return false;
    
    const newClock = incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId);
    
    await db.update(schema.domains)
      .set({ deletedAt: now(), vectorClock: newClock, updatedAt: now() })
      .where(eq(schema.domains.id, id));
    
    return true;
  },
  
  async getStats() {
    const total = await db.select({ count: sql`count(*)` })
      .from(schema.domains)
      .where(isNull(schema.domains.deletedAt))
      .get();
    
    const expiring = await this.getExpiring(30);
    const expired = await db.select({ count: sql`count(*)` })
      .from(schema.domains)
      .where(and(
        isNull(schema.domains.deletedAt),
        lte(schema.domains.expiryDate, now())
      ))
      .get();
    
    return {
      total: Number(total?.count ?? 0),
      expiringSoon: expiring.length,
      expired: Number(expired?.count ?? 0)
    };
  }
};

export const domainCheckRepo = {
  async create(data: Omit<schema.NewDomainCheck, 'id' | 'checkedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.domainChecks).values({
      id,
      ...data,
      vectorClock: clock,
      checkedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.domainChecks).where(eq(schema.domainChecks.id, id)).get();
    return parseRow('domainChecks', row);
  },
  
  async getLatestByDomainAndType(domainId: string, type: string) {
    const row = await db.select()
      .from(schema.domainChecks)
      .where(and(eq(schema.domainChecks.domainId, domainId), eq(schema.domainChecks.type, type as any)))
      .orderBy(desc(schema.domainChecks.checkedAt))
      .get();
    return parseRow('domainChecks', row);
  },
  
  async getHistory(domainId: string, type: string, limit: number = 100) {
    const rows = await db.select()
      .from(schema.domainChecks)
      .where(and(eq(schema.domainChecks.domainId, domainId), eq(schema.domainChecks.type, type as any)))
      .orderBy(desc(schema.domainChecks.checkedAt))
      .limit(limit)
      .all();
    return rows.map(r => parseRow('domainChecks', r));
  },
  
  async deleteOld(days: number = 90) {
    const cutoff = now() - (days * 86400);
    await db.delete(schema.domainChecks).where(lte(schema.domainChecks.checkedAt, cutoff));
  },
  
  async getCriticalAlerts(limit: number = 5) {
    const client = require('../index').getClient();
    const result = await client.execute({
      sql: `
        SELECT dc.*, d.name as domain_name
        FROM domain_checks dc
        JOIN domains d ON dc.domain_id = d.id
        WHERE dc.data LIKE '%"alert":true%'
        AND dc.data LIKE '%"severity":"CRITICAL"%'
        ORDER BY dc.checked_at DESC
        LIMIT ?
      `,
      args: [limit]
    });
    return result.rows.map((r: any) => parseRow('domainChecks', r));
  }
};

export const chatRepo = {
  async getRooms() {
    const rows = await db.select().from(schema.chatRooms).all();
    return rows.map(r => parseRow('chatRooms', r));
  },

  async getRoomsWithMeta(userId: string) {
    const rows = await db.select().from(schema.chatRooms).all();
    const rooms = rows.map(r => parseRow('chatRooms', r));
    const roomIds = rooms.map(r => r.id);

    if (!roomIds.length) return [];

    const memberRows = await db.select()
      .from(schema.chatRoomMembers)
      .where(inArray(schema.chatRoomMembers.roomId, roomIds))
      .all();

    const memberCount: Record<string, number> = {};
    const lastRead: Record<string, number> = {};
    const myRoomIds = new Set<string>();

    for (const m of memberRows) {
      if ((m as any).deletedAt) continue;
      memberCount[m.roomId] = (memberCount[m.roomId] || 0) + 1;
      if (m.userId === userId) {
        lastRead[m.roomId] = m.lastReadAt ?? 0;
        myRoomIds.add(m.roomId);
      }
    }

    // Only surface rooms the current user is an active member of.
    const visibleRooms = rooms.filter(r => myRoomIds.has(r.id));
    const visibleRoomIds = visibleRooms.map(r => r.id);

    if (!visibleRoomIds.length) return [];

    const messageRows = await db.select()
      .from(schema.messages)
      .where(inArray(schema.messages.roomId, visibleRoomIds))
      .orderBy(desc(schema.messages.createdAt))
      .all();

    const lastMessage: Record<string, { content: string; createdAt: number | null }> = {};
    const unread: Record<string, number> = {};

    for (const msg of messageRows) {
      if (msg.deletedAt) continue;
      if (!lastMessage[msg.roomId]) {
        lastMessage[msg.roomId] = { content: msg.content, createdAt: msg.createdAt };
      }
      if (msg.userId !== userId && (msg.createdAt ?? 0) > (lastRead[msg.roomId] ?? 0)) {
        unread[msg.roomId] = (unread[msg.roomId] || 0) + 1;
      }
    }

    return visibleRooms.map(room => ({
      ...room,
      memberCount: memberCount[room.id] || 0,
      lastMessage: lastMessage[room.id]?.content ?? null,
      lastMessageAt: lastMessage[room.id]?.createdAt ?? null,
      unread: unread[room.id] || 0,
    }));
  },

  async getRoom(id: string) {
    const row = await db.select().from(schema.chatRooms).where(eq(schema.chatRooms.id, id)).get();
    return parseRow('chatRooms', row);
  },
  
  async getRoomByDomain(domainId: string) {
    const row = await db.select().from(schema.chatRooms).where(eq(schema.chatRooms.domainId, domainId)).get();
    return parseRow('chatRooms', row);
  },
  
  async createRoom(data: Omit<schema.NewChatRoom, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>, creatorId?: string) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.chatRooms).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    if (creatorId) {
      await db.insert(schema.chatRoomMembers).values({
        id: generateId(),
        roomId: id,
        userId: creatorId,
        role: 'ADMIN',
        joinedAt: timestamp,
        vectorClock: clock,
        lastSyncedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    
    return this.getRoom(id);
  },

  async updateRoom(roomId: string, data: { name?: string; description?: string }, nodeId: string) {
    const existing = await this.getRoom(roomId);
    if (!existing) return null;

    const clock = incrementVectorClock((existing.vectorClock as Record<string, number>) || {}, nodeId);
    const timestamp = now();

    await db.update(schema.chatRooms)
      .set({ ...data, vectorClock: clock, updatedAt: timestamp })
      .where(eq(schema.chatRooms.id, roomId));

    return this.getRoom(roomId);
  },
  
  async getMessages(roomId: string, limit: number = 50, before?: number, userId?: string) {
    const conditions = [
      eq(schema.messages.roomId, roomId),
      isNull(schema.messages.deletedAt),
    ];
    if (before) conditions.push(lte(schema.messages.createdAt, before));

    const rows = await db.select()
      .from(schema.messages)
      .where(and(...conditions))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .all();

    let messages = rows.map(r => parseRow('messages', r));

    if (userId && messages.length) {
      const deletions = await db.select()
        .from(schema.messageDeletions)
        .where(and(
          eq(schema.messageDeletions.userId, userId),
          inArray(schema.messageDeletions.messageId, messages.map(m => m.id))
        ))
        .all();

      if (deletions.length) {
        const hidden = new Set(deletions.map(d => d.messageId));
        messages = messages.filter(m => !hidden.has(m.id));
      }
    }

    // Fetched newest-first (for the latest `limit`); return oldest-first for display.
    return messages.reverse();
  },

  async deleteMessage(messageId: string, userId: string, scope: 'me' | 'everyone', nodeId: string) {
    const existing = await this.getMessage(messageId);
    if (!existing) return null;

    const timestamp = now();

    if (scope === 'everyone') {
      const clock = incrementVectorClock((existing.vectorClock as Record<string, number>) || {}, nodeId);
      await db.update(schema.messages)
        .set({ deletedAt: timestamp, vectorClock: clock, updatedAt: timestamp })
        .where(eq(schema.messages.id, messageId));
      return this.getMessage(messageId);
    }

    // "Delete for me" — hide only for this user.
    const existingDeletion = await db.select()
      .from(schema.messageDeletions)
      .where(and(
        eq(schema.messageDeletions.messageId, messageId),
        eq(schema.messageDeletions.userId, userId)
      ))
      .get();

    if (existingDeletion) return existingDeletion;

    const deletion = {
      id: generateId(),
      messageId,
      userId,
      vectorClock: { [`${messageId}:${userId}`]: 1 },
      lastSyncedAt: timestamp,
      createdAt: timestamp,
    };
    await db.insert(schema.messageDeletions).values(deletion);

    return deletion;
  },
  
  async createMessage(data: Omit<schema.NewMessage, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.messages).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getMessage(id);
  },
  
  async getMessage(id: string) {
    const row = await db.select().from(schema.messages).where(eq(schema.messages.id, id)).get();
    return parseRow('messages', row);
  },
  
  async markAsRead(userId: string, roomId: string, messageId: string) {
    await db.update(schema.chatRoomMembers)
      .set({ lastReadAt: now() })
      .where(and(eq(schema.chatRoomMembers.userId, userId), eq(schema.chatRoomMembers.roomId, roomId)));
  },

  async getRoomMembers(roomId: string) {
    const rows = await db.select()
      .from(schema.chatRoomMembers)
      .where(eq(schema.chatRoomMembers.roomId, roomId))
      .all();
    return rows.filter(r => !(r as any).deletedAt).map(r => parseRow('chatRoomMembers', r));
  },

  async addMember(roomId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const existing = await db.select()
      .from(schema.chatRoomMembers)
      .where(and(eq(schema.chatRoomMembers.roomId, roomId), eq(schema.chatRoomMembers.userId, userId)))
      .get();

    const timestamp = now();

    if (existing) {
      const clock = incrementVectorClock((existing.vectorClock as Record<string, number>) || {}, existing.id);
      await db.update(schema.chatRoomMembers)
        .set({ role, deletedAt: null, vectorClock: clock, lastSyncedAt: timestamp, updatedAt: timestamp })
        .where(eq(schema.chatRoomMembers.id, existing.id));
      return this.getMember(existing.id);
    }

    const id = generateId();
    const clock = { [id]: 1 };
    
    await db.insert(schema.chatRoomMembers).values({
      id,
      roomId,
      userId,
      role,
      joinedAt: timestamp,
      vectorClock: clock,
      lastSyncedAt: timestamp,
      updatedAt: timestamp,
    });
    
    return this.getMember(id);
  },

  async getMember(id: string) {
    const row = await db.select().from(schema.chatRoomMembers).where(eq(schema.chatRoomMembers.id, id)).get();
    return parseRow('chatRoomMembers', row);
  },

  async removeMember(roomId: string, userId: string) {
    const member = await db.select()
      .from(schema.chatRoomMembers)
      .where(and(eq(schema.chatRoomMembers.roomId, roomId), eq(schema.chatRoomMembers.userId, userId)))
      .get();
    if (!member) return null;

    const timestamp = now();
    const clock = incrementVectorClock((member.vectorClock as Record<string, number>) || {}, member.id);
    await db.update(schema.chatRoomMembers)
      .set({ deletedAt: timestamp, vectorClock: clock, lastSyncedAt: timestamp, updatedAt: timestamp })
      .where(eq(schema.chatRoomMembers.id, member.id));

    return this.getMember(member.id);
  },

  async updateMemberRole(roomId: string, userId: string, role: 'ADMIN' | 'MEMBER') {
    const member = await db.select()
      .from(schema.chatRoomMembers)
      .where(and(eq(schema.chatRoomMembers.roomId, roomId), eq(schema.chatRoomMembers.userId, userId)))
      .get();
    if (!member) return null;

    const timestamp = now();
    const clock = incrementVectorClock((member.vectorClock as Record<string, number>) || {}, member.id);
    await db.update(schema.chatRoomMembers)
      .set({ role, vectorClock: clock, lastSyncedAt: timestamp, updatedAt: timestamp })
      .where(eq(schema.chatRoomMembers.id, member.id));

    return this.getMember(member.id);
  },

  async leaveRoom(roomId: string, userId: string) {
    return this.removeMember(roomId, userId);
  },

  async createOrGetDirectMessage(userId: string, targetUserId: string) {
    const dmKey = [userId, targetUserId].sort().join(':');
    const roomId = generateDeterministicRoomId(dmKey);

    const existingRoom = await db.select()
      .from(schema.chatRooms)
      .where(and(
        eq(schema.chatRooms.type, 'DIRECT'),
        eq(schema.chatRooms.dmKey, dmKey)
      ))
      .get();

    if (existingRoom) {
      // Re-open the conversation if the current user had previously deleted it.
      const myMember = await db.select()
        .from(schema.chatRoomMembers)
        .where(and(
          eq(schema.chatRoomMembers.roomId, existingRoom.id),
          eq(schema.chatRoomMembers.userId, userId)
        ))
        .get();
      if (myMember && (myMember as any).deletedAt) {
        await db.update(schema.chatRoomMembers)
          .set({ deletedAt: null, updatedAt: now() })
          .where(eq(schema.chatRoomMembers.id, myMember.id));
      }
      return this.getRoom(existingRoom.id);
    }

    // Create new DM room
    const timestamp = now();
    const clock = { [roomId]: 1 };

    await db.insert(schema.chatRooms).values({
      id: roomId,
      type: 'DIRECT',
      dmKey: dmKey,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Add both users as members
    await db.insert(schema.chatRoomMembers).values([
      { id: generateId(), roomId, userId, role: 'ADMIN', joinedAt: timestamp, vectorClock: clock, lastSyncedAt: timestamp, updatedAt: timestamp },
      { id: generateId(), roomId, userId: targetUserId, role: 'ADMIN', joinedAt: timestamp, vectorClock: clock, lastSyncedAt: timestamp, updatedAt: timestamp },
    ]);

    return this.getRoom(roomId);
  }
};

export const taskRepo = {
  async create(data: Omit<schema.NewTask, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.tasks).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    return parseRow('tasks', row);
  },
  
  async list(filters?: { domainId?: string; assigneeId?: string; status?: string }) {
    const conditions = [];
    if (filters?.domainId) conditions.push(eq(schema.tasks.domainId, filters.domainId));
    if (filters?.assigneeId) conditions.push(eq(schema.tasks.assigneeId, filters.assigneeId));
    if (filters?.status) conditions.push(eq(schema.tasks.status, filters.status as any));
    
    const rows = await db.select()
      .from(schema.tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.tasks.updatedAt))
      .all();
    return rows.map(r => parseRow('tasks', r));
  },
  
  async update(id: string, data: Partial<schema.NewTask>, nodeId: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId);
    
    await db.update(schema.tasks)
      .set({ ...data, vectorClock: newClock, updatedAt: now() })
      .where(eq(schema.tasks.id, id));
    
    return this.getById(id);
  },
  
  async delete(id: string) {
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  }
};

export const approvalRepo = {
  async create(data: Omit<schema.NewApproval, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.approvals).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.approvals).where(eq(schema.approvals.id, id)).get();
    return parseRow('approvals', row);
  },
  
  async list(filters?: { domainId?: string; approverId?: string; status?: string }) {
    const conditions = [];
    if (filters?.domainId) conditions.push(eq(schema.approvals.domainId, filters.domainId));
    if (filters?.approverId) conditions.push(eq(schema.approvals.approverId, filters.approverId));
    if (filters?.status) conditions.push(eq(schema.approvals.status, filters.status as any));
    
    const rows = await db.select()
      .from(schema.approvals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.approvals.createdAt))
      .all();
    return rows.map(r => parseRow('approvals', r));
  },
  
  async approve(id: string, approverId: string, comment?: string, nodeId?: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = nodeId 
      ? incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId)
      : existing.vectorClock;
    
    await db.update(schema.approvals)
      .set({ 
        status: 'APPROVED', 
        approverId, 
        decidedAt: now(),
        metadata: { ...(existing.metadata as Record<string, unknown>), approvalComment: comment },
        vectorClock: newClock,
        updatedAt: now()
      })
      .where(eq(schema.approvals.id, id));
    
    return this.getById(id);
  },
  
  async reject(id: string, approverId: string, comment?: string, nodeId?: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = nodeId
      ? incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId)
      : existing.vectorClock;
    
    await db.update(schema.approvals)
      .set({ 
        status: 'REJECTED', 
        approverId, 
        decidedAt: now(),
        metadata: { ...(existing.metadata as Record<string, unknown>), rejectionComment: comment },
        vectorClock: newClock,
        updatedAt: now()
      })
      .where(eq(schema.approvals.id, id));
    
    return this.getById(id);
  }
};

export const noteRepo = {
  async create(data: Omit<schema.NewNote, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const timestamp = now();
    const clock = { [id]: 1 };
    
    await db.insert(schema.notes).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.notes).where(eq(schema.notes.id, id)).get();
    return parseRow('notes', row);
  },
  
  async listByDomain(domainId: string) {
    const rows = await db.select()
      .from(schema.notes)
      .where(eq(schema.notes.domainId, domainId))
      .orderBy(desc(schema.notes.createdAt))
      .all();
    return rows.map(r => parseRow('notes', r));
  },
  
  async update(id: string, content: string, nodeId: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const newClock = incrementVectorClock(existing.vectorClock as Record<string, number>, nodeId);
    
    await db.update(schema.notes)
      .set({ content, vectorClock: newClock, updatedAt: now() })
      .where(eq(schema.notes.id, id));
    
    return this.getById(id);
  },
  
  async delete(id: string) {
    await db.delete(schema.notes).where(eq(schema.notes.id, id));
  }
};

export const pendingOpsRepo = {
  async add(data: Omit<schema.NewPendingOperation, 'id' | 'createdAt'>) {
    const id = generateId();
    await db.insert(schema.pendingOperations).values({
      id,
      ...data,
      createdAt: now()
    });
    return this.getById(id);
  },
  
  async getById(id: string) {
    const row = await db.select().from(schema.pendingOperations).where(eq(schema.pendingOperations.id, id)).get();
    return parseRow('pendingOperations', row);
  },
  
  async getAll() {
    const rows = await db.select().from(schema.pendingOperations).orderBy(schema.pendingOperations.createdAt).all();
    return rows.map(r => parseRow('pendingOperations', r));
  },
  
  async updateRetry(id: string, retryCount: number) {
    await db.update(schema.pendingOperations)
      .set({ retryCount, lastAttemptAt: now() })
      .where(eq(schema.pendingOperations.id, id));
  },
  
  async remove(id: string) {
    await db.delete(schema.pendingOperations).where(eq(schema.pendingOperations.id, id));
  }
};

export const notificationRepo = {
  async list(filters: { userId?: string; read?: boolean; limit?: number; offset?: number } = {}) {
    const conditions = [];
    if (filters.userId) conditions.push(eq(schema.notifications.userId, filters.userId));
    if (filters.read !== undefined) conditions.push(eq(schema.notifications.read, filters.read));
    
    const query = db.select().from(schema.notifications);
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }
    query.orderBy(desc(schema.notifications.createdAt));
    if (filters.limit) query.limit(filters.limit);
    if (filters.offset) query.offset(filters.offset);
    
    const rows = await query.all();
    return rows.map(r => parseRow('notifications', r));
  },

  async getById(id: string) {
    const result = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id)).get();
    return result ? parseRow('notifications', result) : null;
  },

  async create(data: Omit<schema.NewNotification, 'id' | 'createdAt' | 'updatedAt' | 'vectorClock'>) {
    const id = generateId();
    const clock = { [generateId().substring(0, 8)]: 1 };
    const result = await db.insert(schema.notifications).values({
      id,
      ...data,
      vectorClock: clock,
      createdAt: now(),
      updatedAt: now(),
    }).returning().get();
    return parseRow('notifications', result);
  },

  async update(id: string, data: Partial<schema.Notification>) {
    const clock = incrementVectorClock({}, 'desktop');
    const result = await db.update(schema.notifications)
      .set({ ...data, updatedAt: now(), vectorClock: clock })
      .where(eq(schema.notifications.id, id))
      .returning().get();
    return result ? parseRow('notifications', result) : null;
  },

  async markRead(id: string) {
    const result = await db.update(schema.notifications)
      .set({ read: true, updatedAt: now() })
      .where(eq(schema.notifications.id, id))
      .returning().get();
    return result ? parseRow('notifications', result) : null;
  },

  async markAllRead(userId: string) {
    const result = await db.update(schema.notifications)
      .set({ read: true, updatedAt: now() })
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)))
      .returning().all();
    return result.map(r => parseRow('notifications', r));
  },

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql`count(*)` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)))
      .get();
    return Number(result?.count || 0);
  },

  async deleteOld(days: number) {
    const cutoff = now() - days * 86400;
    await db.delete(schema.notifications).where(lte(schema.notifications.createdAt, cutoff));
  },
};

export const userPreferencesRepo = {
  async get(userId: string) {
    const result = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, userId)).get();
    return result ? parseRow('user_preferences', result) : null;
  },

  async upsert(data: Omit<schema.NewUserPreferences, 'userId'> & { userId: string }) {
    const result = await db.insert(schema.userPreferences)
      .values({ ...data, updatedAt: now() })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: { ...data, updatedAt: now() }
      })
      .returning().get();
    return parseRow('user_preferences', result);
  },
};

export const settingsRepo = {
  async get(key: string) {
    const result = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    const parsed = parseRow('settings', result);
    return parsed?.value;
  },
  
  async set(key: string, value: unknown) {
    await db.insert(schema.settings)
      .values({ key, value: value as any, updatedAt: now() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: value as any, updatedAt: now() }
      });
  },
  
  async getAll() {
    const rows = await db.select().from(schema.settings).all();
    return rows.map(r => parseRow('settings', r));
  }
};

// Re-export the helper functions
export { generateId, now, incrementVectorClock };