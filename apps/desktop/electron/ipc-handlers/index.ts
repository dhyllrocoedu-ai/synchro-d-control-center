import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { WindowManager } from '../window-manager';
import { SyncEngine } from '../sync-engine';
import { realtimeClient } from '../realtime';
import { BackgroundScheduler } from '../background-workers/scheduler';
import { domainRepo, userRepo, chatRepo, taskRepo, approvalRepo, noteRepo, pendingOpsRepo, settingsRepo, domainCheckRepo, notificationRepo, userPreferencesRepo } from '../database/repositories';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { now, generateId } from '../database/repositories';

const nodeId = `ipc-${Date.now()}`;

export function setupIpcHandlers(
  windowManager: WindowManager,
  syncEngine: SyncEngine,
  backgroundScheduler: BackgroundScheduler
) {
  ipcMain.handle('domains:list', async (_, filters) => {
    return domainRepo.list(filters);
  });
  
  ipcMain.handle('domains:get', async (_, id: string) => {
    return domainRepo.getById(id);
  });
  
  ipcMain.handle('domains:create', async (_, data: any) => {
    const domain = await domainRepo.create({
      ...data,
      nameservers: data.nameservers || [],
      checkInterval: data.checkInterval || 3600,
      pricePerYear: data.pricePerYear || 0,
      currency: data.currency || 'USD'
    });
    
    if (domain) {
      await pendingOpsRepo.add({
        entityType: 'domains',
        entityId: domain.id,
        operation: 'CREATE',
        payload: domain,
        vectorClock: { [nodeId]: 1 }
      });
      
      if (domain.chatRoomId) {
        const room = await chatRepo.getRoom(domain.chatRoomId);
        if (!room) {
          const newRoom = await chatRepo.createRoom({
            type: 'DOMAIN',
            domainId: domain.id
          });
          await domainRepo.update(domain.id, { chatRoomId: newRoom.id }, nodeId);
        }
      }
    }
    
    return domain;
  });
  
  ipcMain.handle('domains:update', async (_, id: string, data: any) => {
    const domain = await domainRepo.update(id, data, nodeId);
    
    if (domain) {
      await pendingOpsRepo.add({
        entityType: 'domains',
        entityId: id,
        operation: 'UPDATE',
        payload: domain,
        vectorClock: domain.vectorClock as any
      });
    }
    
    return domain;
  });
  
  ipcMain.handle('domains:delete', async (_, id: string) => {
    const result = await domainRepo.delete(id, nodeId);
    
    if (result) {
      await pendingOpsRepo.add({
        entityType: 'domains',
        entityId: id,
        operation: 'DELETE',
        payload: { id },
        vectorClock: { [nodeId]: 1 }
      });
    }
    
    return result;
  });
  
  ipcMain.handle('domains:check-now', async (_, id: string) => {
    const domain = await domainRepo.getById(id);
    if (!domain) throw new Error('Domain not found');
    
    const client = require('../database').getClient();
    const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = now();
    const nextCheck = timestamp + (domain.checkInterval || 3600);
    
    await client.execute({
      sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, 'WHOIS', 'UNKNOWN', '{}', ?, ?, '{}')`,
      args: [checkId, id, timestamp, nextCheck]
    });
    
    await client.execute({
      sql: `UPDATE domains SET next_check_at = ? WHERE id = ?`,
      args: [nextCheck, id]
    });
    
    const scheduler = require('../background-workers/scheduler');
    scheduler.backgroundScheduler.executeWhoisCheck(domain, checkId);
    
    return { success: true, checkId };
  });
  
  ipcMain.handle('domains:bulk-import', async (_, filePath: string) => {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const results = { success: 0, failed: 0, errors: [] as string[] };
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => row[h] = values[idx] || '');
        
        await domainRepo.create({
          name: row.name || row.domain,
          type: (row.type || 'MONITORED') as 'MANAGED' | 'MONITORED',
          registrar: row.registrar,
          expiryDate: row.expiry_date ? new Date(row.expiry_date).getTime() / 1000 : undefined,
          pricePerYear: parseFloat(row.price_per_year || row.price || '0')
        });
        
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Line ${i + 1}: ${err}`);
      }
    }
    
    return results;
  });
  
  ipcMain.handle('domains:export', async (_, filters) => {
    const domains = await domainRepo.list(filters);
    const headers = ['name', 'type', 'status', 'registrar', 'expiry_date', 'price_per_year', 'currency', 'auto_renew'];
    const rows = domains.map(d => [
      d.name, d.type, d.status, d.registrar || '',
      d.expiryDate ? new Date(d.expiryDate * 1000).toISOString().split('T')[0] : '',
      d.pricePerYear, d.currency, d.autoRenew ? 'true' : 'false'
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  });
  
  ipcMain.handle('chat:get-rooms', async () => {
    const currentUser = await settingsRepo.get('currentUser');
    return chatRepo.getRoomsWithMeta((currentUser as string) || '');
  });
  
  ipcMain.handle('chat:get-messages', async (_, roomId: string, limit: number = 50, before?: number) => {
    const currentUser = await settingsRepo.get('currentUser');
    return chatRepo.getMessages(roomId, limit, before, (currentUser as string) || undefined);
  });
  
  ipcMain.handle('chat:send-message', async (_, roomId: string, content: string, type: string = 'TEXT', metadata?: any) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    const message = await chatRepo.createMessage({
      content,
      type: type as any,
      metadata,
      userId: settings as string,
      roomId
    });
    
    if (message) {
      await pendingOpsRepo.add({
        entityType: 'messages',
        entityId: message.id,
        operation: 'CREATE',
        payload: message,
        vectorClock: message.vectorClock as any
      });
      void syncEngine.sync();
    }
    
    return message;
  });
  
  ipcMain.handle('chat:mark-as-read', async (_, roomId: string, messageId: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) return;
    await chatRepo.markAsRead(settings as string, roomId, messageId);
  });
  
  ipcMain.handle('chat:create-room', async (_, name: string, type: string, domainId?: string) => {
    const currentUser = await settingsRepo.get('currentUser');
    if (!currentUser) throw new Error('Not authenticated');

    const room = await chatRepo.createRoom(
      { name, type: type as any, domainId },
      currentUser as string
    );

    if (room) {
      await pendingOpsRepo.add({
        entityType: 'chat_rooms',
        entityId: room.id,
        operation: 'CREATE',
        payload: room,
        vectorClock: room.vectorClock as any,
      });

      const members = await chatRepo.getRoomMembers(room.id);
      for (const member of members) {
        await pendingOpsRepo.add({
          entityType: 'chat_room_members',
          entityId: member.id,
          operation: 'CREATE',
          payload: member,
          vectorClock: member.vectorClock as any,
        });
      }

      void syncEngine.sync();
    }

    return room;
  });

  ipcMain.handle('chat:update-room', async (_, roomId: string, data: { name?: string; description?: string }) => {
    const room = await chatRepo.updateRoom(roomId, data, nodeId);

    if (room) {
      await pendingOpsRepo.add({
        entityType: 'chat_rooms',
        entityId: room.id,
        operation: 'UPDATE',
        payload: room,
        vectorClock: room.vectorClock as any,
      });
      void syncEngine.sync();
    }

    return room;
  });

  ipcMain.handle('chat:get-room-members', async (_, roomId: string) => {
    return chatRepo.getRoomMembers(roomId);
  });

  ipcMain.handle('chat:add-member', async (_, roomId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    const member = await chatRepo.addMember(roomId, userId, role);

    if (member) {
      await pendingOpsRepo.add({
        entityType: 'chat_room_members',
        entityId: member.id,
        operation: 'CREATE',
        payload: member,
        vectorClock: member.vectorClock as any,
      });
      void syncEngine.sync();
    }

    return member;
  });

  ipcMain.handle('chat:remove-member', async (_, roomId: string, userId: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    const member = await chatRepo.removeMember(roomId, userId);

    if (member) {
      await pendingOpsRepo.add({
        entityType: 'chat_room_members',
        entityId: member.id,
        operation: 'DELETE',
        payload: member,
        vectorClock: member.vectorClock as any,
      });
      void syncEngine.sync();
    }

    return member;
  });

  ipcMain.handle('chat:update-member-role', async (_, roomId: string, userId: string, role: 'ADMIN' | 'MEMBER') => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    const member = await chatRepo.updateMemberRole(roomId, userId, role);

    if (member) {
      await pendingOpsRepo.add({
        entityType: 'chat_room_members',
        entityId: member.id,
        operation: 'UPDATE',
        payload: member,
        vectorClock: member.vectorClock as any,
      });
      void syncEngine.sync();
    }

    return member;
  });

  ipcMain.handle('chat:leave-room', async (_, roomId: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    const member = await chatRepo.leaveRoom(roomId, settings as string);

    if (member) {
      await pendingOpsRepo.add({
        entityType: 'chat_room_members',
        entityId: member.id,
        operation: 'DELETE',
        payload: member,
        vectorClock: member.vectorClock as any,
      });
      void syncEngine.sync();
    }

    return member;
  });

  ipcMain.handle('chat:create-direct', async (_, targetUserId: string) => {
    const userSettings = await settingsRepo.get('currentUser');
    if (!userSettings) throw new Error('Not authenticated');

    const room = await chatRepo.createOrGetDirectMessage(userSettings as string, targetUserId);

    if (room) {
      await pendingOpsRepo.add({
        entityType: 'chat_rooms',
        entityId: room.id,
        operation: 'CREATE',
        payload: room,
        vectorClock: room.vectorClock as any,
      });

      const members = await chatRepo.getRoomMembers(room.id);
      for (const member of members) {
        await pendingOpsRepo.add({
          entityType: 'chat_room_members',
          entityId: member.id,
          operation: 'CREATE',
          payload: member,
          vectorClock: member.vectorClock as any,
        });
      }

      void syncEngine.sync();
    }

    return room;
  });

  ipcMain.handle('chat:delete-message', async (_, roomId: string, messageId: string, scope: 'me' | 'everyone' = 'me') => {
    const currentUser = await settingsRepo.get('currentUser');
    if (!currentUser) throw new Error('Not authenticated');

    const result = await chatRepo.deleteMessage(messageId, currentUser as string, scope, nodeId);

    if (scope === 'everyone' && result?.id) {
      await pendingOpsRepo.add({
        entityType: 'messages',
        entityId: messageId,
        operation: 'UPDATE',
        payload: result,
        vectorClock: result.vectorClock as any,
      });
    } else if (scope === 'me' && result?.id) {
      await pendingOpsRepo.add({
        entityType: 'message_deletions',
        entityId: result.id,
        operation: 'CREATE',
        payload: result,
        vectorClock: result.vectorClock as any,
      });
    }

    void syncEngine.sync();
    return result;
  });

  ipcMain.handle('chat:delete-conversation', async (_, roomId: string) => {
    const currentUser = await settingsRepo.get('currentUser');
    if (!currentUser) throw new Error('Not authenticated');

    const member = await chatRepo.leaveRoom(roomId, currentUser as string);

    if (member?.id) {
      await pendingOpsRepo.add({
        entityType: 'chat_room_members',
        entityId: member.id,
        operation: 'DELETE',
        payload: member,
        vectorClock: member.vectorClock as any,
      });
    }

    void syncEngine.sync();
    return { success: true };
  });

  ipcMain.handle('users:list', async () => {
    return userRepo.list();
  });
  
  ipcMain.handle('tasks:list', async (_, filters) => {
    return taskRepo.list(filters);
  });
  
  ipcMain.handle('tasks:get', async (_, id: string) => {
    return taskRepo.getById(id);
  });
  
  ipcMain.handle('tasks:create', async (_, data: any) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    const task = await taskRepo.create({
      ...data,
      creatorId: settings as string
    });
    
    if (task) {
      await pendingOpsRepo.add({
        entityType: 'tasks',
        entityId: task.id,
        operation: 'CREATE',
        payload: task,
        vectorClock: task.vectorClock as any
      });
    }
    
    return task;
  });
  
  ipcMain.handle('tasks:update', async (_, id: string, data: any) => {
    const task = await taskRepo.update(id, data, nodeId);
    
    if (task) {
      await pendingOpsRepo.add({
        entityType: 'tasks',
        entityId: id,
        operation: 'UPDATE',
        payload: task,
        vectorClock: task.vectorClock as any
      });
    }
    
    return task;
  });
  
  ipcMain.handle('tasks:delete', async (_, id: string) => {
    await taskRepo.delete(id);
    return { success: true };
  });
  
  ipcMain.handle('tasks:move', async (_, id: string, columnId: string, index: number) => {
    const task = await taskRepo.update(id, { status: columnId as 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED' }, nodeId);
    return task;
  });
  
  ipcMain.handle('approvals:list', async (_, filters) => {
    return approvalRepo.list(filters);
  });
  
  ipcMain.handle('approvals:get', async (_, id: string) => {
    return approvalRepo.getById(id);
  });
  
  ipcMain.handle('approvals:create', async (_, data: any) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    const approval = await approvalRepo.create({
      ...data,
      requesterId: settings as string
    });
    
    if (approval) {
      await pendingOpsRepo.add({
        entityType: 'approvals',
        entityId: approval.id,
        operation: 'CREATE',
        payload: approval,
        vectorClock: approval.vectorClock as any
      });
    }
    
    return approval;
  });
  
  ipcMain.handle('approvals:approve', async (_, id: string, comment?: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    return approvalRepo.approve(id, settings as string, comment, nodeId);
  });
  
  ipcMain.handle('approvals:reject', async (_, id: string, comment?: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    return approvalRepo.reject(id, settings as string, comment, nodeId);
  });
  
  ipcMain.handle('notes:list', async (_, domainId: string) => {
    return noteRepo.listByDomain(domainId);
  });
  
  ipcMain.handle('notes:create', async (_, domainId: string, content: string) => {
    const settings = await settingsRepo.get('currentUser');
    if (!settings) throw new Error('Not authenticated');
    
    const note = await noteRepo.create({ domainId, content, userId: settings as string });
    
    if (note) {
      await pendingOpsRepo.add({
        entityType: 'notes',
        entityId: note.id,
        operation: 'CREATE',
        payload: note,
        vectorClock: note.vectorClock as any
      });
    }
    
    return note;
  });
  
  ipcMain.handle('notes:update', async (_, id: string, content: string) => {
    return noteRepo.update(id, content, nodeId);
  });
  
  ipcMain.handle('notes:delete', async (_, id: string) => {
    await noteRepo.delete(id);
    return { success: true };
  });
  
  ipcMain.handle('sync:get-status', async () => {
    const pendingCount = (await pendingOpsRepo.getAll()).length;
    const lastSyncedAt = await settingsRepo.get('lastSyncedAt');
    const vectorClock = await settingsRepo.get('vectorClock');
    
    return {
      isOnline: true,
      isSyncing: false,
      lastSyncedAt: lastSyncedAt as number,
      pendingCount,
      conflictCount: 0,
      vectorClock: vectorClock as Record<string, number>
    };
  });
  
  ipcMain.handle('sync:trigger', async () => {
    return syncEngine.sync();
  });

  ipcMain.handle('sync:start', async () => {
    syncEngine.start();
    return { success: true };
  });

  ipcMain.handle('sync:stop', async () => {
    syncEngine.stop();
    return { success: true };
  });

  ipcMain.handle('scheduler:start', async () => {
    backgroundScheduler.start();
    return { success: true };
  });

  ipcMain.handle('scheduler:stop', async () => {
    backgroundScheduler.stop();
    return { success: true };
  });
  
  ipcMain.handle('settings:get', async () => {
    return settingsRepo.getAll();
  });
  
  ipcMain.handle('settings:update', async (_, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      await settingsRepo.set(key, value);
    }
    return { success: true };
  });

  // Notifications handlers
  ipcMain.handle('notifications:list', async (_, filters: { userId?: string; read?: boolean; limit?: number; offset?: number } = {}) => {
    const userId = filters.userId || (await settingsRepo.get('currentUser'));
    if (!userId) return [];
    return notificationRepo.list({ ...filters, userId });
  });

  ipcMain.handle('notifications:unread-count', async () => {
    const userId = await settingsRepo.get('currentUser');
    if (!userId) return 0;
    return notificationRepo.getUnreadCount(userId);
  });

  ipcMain.handle('notifications:mark-read', async (_, id: string) => {
    return notificationRepo.markRead(id);
  });

  ipcMain.handle('notifications:mark-all-read', async () => {
    const userId = await settingsRepo.get('currentUser');
    if (!userId) return [];
    return notificationRepo.markAllRead(userId);
  });

  // User Preferences handlers
  ipcMain.handle('preferences:get', async () => {
    const userId = await settingsRepo.get('currentUser');
    if (!userId) return null;
    return userPreferencesRepo.get(userId);
  });

  ipcMain.handle('preferences:update', async (_, data: any) => {
    const userId = await settingsRepo.get('currentUser');
    if (!userId) return null;
    return userPreferencesRepo.upsert({ userId, ...data });
  });

  ipcMain.handle('alerts:critical', async () => {
    const client = require('../database').getClient();
    const result = await client.execute({
      sql: `
        SELECT dc.*, d.name as domain_name
        FROM domain_checks dc
        JOIN domains d ON dc.domain_id = d.id
        WHERE dc.data LIKE '%"alert":true%'
        AND dc.data LIKE '%"severity":"CRITICAL"%'
        ORDER BY dc.checked_at DESC
        LIMIT 10
      `,
      args: []
    });
    return result.rows;
  });
  
  ipcMain.handle('monitoring:pause', async () => {
    return backgroundScheduler.togglePause();
  });
  
  ipcMain.handle('monitoring:status', async () => {
    return { isPaused: backgroundScheduler.getIsPaused() };
  });
  
  ipcMain.handle('shell:open-external', async (_, url: string) => {
    return shell.openExternal(url);
  });
  
  ipcMain.handle('dialog:show-open-dialog', async (_, options: any) => {
    const win = windowManager.getMainWindow();
    if (!win) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(win, options);
  });

  ipcMain.on('navigate', (_, { route }: { route: string }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('navigate', route);
    }
  });

  ipcMain.on('sync:trigger', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('sync:trigger');
    }
  });

  // Auth handlers - proxy to backend API
  const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:3001';

  async function callBackend(endpoint: string, options: RequestInit = {}) {
    return callBackendWithRetry(`${BACKEND_URL}/api/auth${endpoint}`, options);
  }

  // Wrapper that retries on network errors (ECONNREFUSED) with user-friendly message
  async function callBackendWithRetry(url: string, options: RequestInit = {}, maxRetries = 3) {
    const baseDelay = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        
        const data = await response.json() as { message?: string };
        if (!response.ok) {
          throw new Error(data.message || 'Auth failed');
        }
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const isNetworkError = error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed') ||
          error.message.includes('network') ||
          error.message.includes('ENOTFOUND');
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          log.warn(`Backend unreachable (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        // User-friendly error message
        if (isNetworkError) {
          throw new Error('Backend server is not responding. Please wait a moment and try again.');
        }
        throw error;
      }
    }
    throw new Error('Backend server is not responding. Please wait a moment and try again.');
  }

  async function callApi(path: string, options: RequestInit = {}) {
    const token = await settingsRepo.get('accessToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  async function persistSession(result: any) {
    const { user, accessToken, refreshToken } = result || {};

    if (user?.id) {
      await userRepo.upsert({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      });
      await settingsRepo.set('currentUser', user.id);
    }

    if (accessToken) {
      await settingsRepo.set('accessToken', accessToken);
      syncEngine.setAuthToken(accessToken);
      realtimeClient.setToken(accessToken);
    }
    if (refreshToken) {
      await settingsRepo.set('refreshToken', refreshToken);
    }
  }

  ipcMain.handle('auth:login', async (_, email: string, password: string) => {
    const result = await callBackend('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await persistSession(result);
    return result;
  });

  ipcMain.handle('auth:register', async (_, data: { email: string; password: string; name: string }) => {
    const result = await callBackend('/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    await persistSession(result);
    return result;
  });

  ipcMain.handle('auth:forgot-password', async (_, email: string) => {
    return callBackend('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  });

  ipcMain.handle('auth:reset-password', async (_, data: { token?: string; accessToken?: string; newPassword: string }) => {
    return callBackend('/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });

  ipcMain.handle('chat:generate-invite-code', async (_, roomId: string) => {
    return callBackend('/chat/rooms/' + roomId + '/invite-code', {
      method: 'POST',
    });
  });

  ipcMain.handle('chat:join-by-code', async (_, inviteCode: string) => {
    return callBackend('/chat/rooms/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  });

  ipcMain.handle('auth:refresh', async (_, refreshToken: string) => {
    const result = await callBackend('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }) as { accessToken: string; refreshToken: string };

    if (result?.accessToken) {
      await settingsRepo.set('accessToken', result.accessToken);
      syncEngine.setAuthToken(result.accessToken);
      realtimeClient.setToken(result.accessToken);
    }
    if (result?.refreshToken) {
      await settingsRepo.set('refreshToken', result.refreshToken);
    }

    return result;
  });

  ipcMain.handle('auth:me', async () => {
    const userId = await settingsRepo.get('currentUser');
    if (!userId) throw new Error('Not authenticated');
    const user = await userRepo.getById(userId as string);
    if (!user) throw new Error('Not authenticated');
    return user;
  });

  ipcMain.handle('auth:logout', async () => {
    await settingsRepo.set('currentUser', '');
    await settingsRepo.set('accessToken', '');
    await settingsRepo.set('refreshToken', '');
    syncEngine.setAuthToken('');
    realtimeClient.setToken(null);
    return { success: true };
  });

  ipcMain.handle('users:change-password', async (_, data: { currentPassword: string; newPassword: string }) => {
    return callApi('/api/users/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });

  ipcMain.handle('users:generate-2fa', async () => {
    return callApi('/api/users/2fa/generate', { method: 'POST' });
  });

  ipcMain.handle('users:confirm-2fa', async (_, data: { token: string }) => {
    return callApi('/api/users/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });

  ipcMain.handle('users:disable-2fa', async (_, data: { password: string }) => {
    return callApi('/api/users/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });
}