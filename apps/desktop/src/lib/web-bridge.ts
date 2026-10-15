import { io, type Socket } from 'socket.io-client';
import type { ElectronAPI } from '@/types/global';

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:3001') + '/api';

const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

const TOKEN_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function transform(value: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => transform(v, keyFn));
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[keyFn(k)] = transform(v, keyFn);
    }
    return out;
  }
  return value;
}

const toSnake = (value: unknown) => transform(value, camelToSnake);
const toCamel = (value: unknown) => transform(value, snakeToCamel);

function withQuery(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function persistCurrent(user: any): void {
  if (!user) return;
  const store = readLocal<Record<string, unknown>>('settings', {});
  if (user.id) store.currentUser = user.id;
  writeLocal('settings', store);
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.accessToken) {
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      if (data?.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  allowRetry = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('accessToken');
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(toSnake(body)) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the Synchro-D server. Is the backend running?');
  }

  if (res.status === 401 && allowRetry && (await tryRefresh())) {
    return request<T>(method, path, body, false);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const raw = data?.message ?? data?.error ?? `Request failed (${res.status})`;
    const message = Array.isArray(raw) ? raw.join(', ') : String(raw);
    throw new Error(message);
  }

  return toCamel(data) as T;
}

function downloadFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type ChatUpdatedCallback = (payload: unknown) => void;
const chatUpdatedListeners = new Set<ChatUpdatedCallback>();
let realtimeSocket: Socket | null = null;

function ensureRealtimeSocket(): Socket {
  if (realtimeSocket) {
    if (!realtimeSocket.connected && localStorage.getItem('accessToken')) {
      realtimeSocket.connect();
    }
    return realtimeSocket;
  }

  realtimeSocket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: (cb: (data: Record<string, unknown>) => void) =>
      cb({ token: localStorage.getItem('accessToken') ?? '' }),
  });

  realtimeSocket.on('chat:changed', (payload: unknown) => {
    for (const cb of chatUpdatedListeners) {
      try {
        cb(payload);
      } catch {
        /* ignore listener errors */
      }
    }
  });

  return realtimeSocket;
}

function createWebAPI(): ElectronAPI {
  return {
    app: {
      getVersion: async () => 'web',
      quit: async () => {
        /* no-op */
      },
      onNavigate: () => () => {},
    },
    shell: {
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    window: {
      minimize: async () => {},
      maximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      onMaximizedChange: () => () => {},
    },
    auth: {
      login: async (email: string, password: string) => {
        const result = await request('POST', '/auth/login', { email, password });
        if (result?.accessToken) localStorage.setItem('accessToken', result.accessToken);
        if (result?.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);
        persistCurrent(result?.user);
        if (result?.accessToken) ensureRealtimeSocket();
        return result;
      },
      register: async (data) => {
        const result = await request('POST', '/auth/register', data);
        if (result?.accessToken) localStorage.setItem('accessToken', result.accessToken);
        if (result?.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);
        persistCurrent(result?.user);
        if (result?.accessToken) ensureRealtimeSocket();
        return result;
      },
      refresh: async (refreshToken: string) => {
        const result = await request('POST', '/auth/refresh', { refreshToken });
        if (result?.accessToken) localStorage.setItem('accessToken', result.accessToken);
        if (result?.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);
        return result;
      },
      me: async () => {
        const user = await request('GET', '/auth/me');
        persistCurrent(user);
        return user;
      },
      logout: async () => {
        clearTokens();
        return { success: true };
      },
      forgotPassword: async (email: string) => request('POST', '/auth/forgot-password', { email }),
      resetPassword: async (data) => request('POST', '/auth/reset-password', data),
      onDeepLink: () => () => {},
    },
    domains: {
      list: (filters) => request('GET', withQuery('/domains', filters)),
      get: (id) => request('GET', `/domains/${id}`),
      create: (data) => request('POST', '/domains', data),
      update: (id, data) => request('PATCH', `/domains/${id}`, data),
      delete: async (id) => {
        await request('DELETE', `/domains/${id}`);
      },
      checkNow: (id) => request('POST', `/domains/${id}/check`),
      bulkImport: async () => {
        throw new Error('Bulk import is only available in the desktop app.');
      },
      export: async (filters) => {
        const list = await request('GET', withQuery('/domains', filters));
        const json = JSON.stringify(list ?? [], null, 2);
        downloadFile('synchro-d-domains.json', json);
        return json;
      },
    },
    chat: {
      getRooms: () => request('GET', '/chat/rooms'),
      getMessages: async (roomId, limit, before) => {
        const params: Record<string, unknown> = {};
        if (limit) params.limit = limit;
        if (before) params.before = new Date(before * 1000).toISOString();
        const data = await request('GET', withQuery(`/chat/rooms/${roomId}/messages`, params));
        // Normalize ISO timestamps to epoch seconds for consistency with desktop
        if (Array.isArray(data)) {
          return data.map((msg: any) => ({
            ...msg,
            createdAt: msg.createdAt ? Math.floor(new Date(msg.createdAt).getTime() / 1000) : null,
            updatedAt: msg.updatedAt ? Math.floor(new Date(msg.updatedAt).getTime() / 1000) : null,
            replyToId: msg.replyToId,
          }));
        }
        return data;
      },
      sendMessage: async (roomId, content, type, metadata) => {
        const data = await request('POST', `/chat/rooms/${roomId}/messages`, { content, type, metadata });
        // Normalize ISO timestamps to epoch seconds
        if (data) {
          return {
            ...data,
            createdAt: data.createdAt ? Math.floor(new Date(data.createdAt).getTime() / 1000) : null,
            updatedAt: data.updatedAt ? Math.floor(new Date(data.updatedAt).getTime() / 1000) : null,
          };
        }
        return data;
      },
      markAsRead: async (roomId, messageId) => {
        await request('POST', `/chat/rooms/${roomId}/read`, { messageId });
      },
      createRoom: (name, type, domainId) => request('POST', '/chat/rooms', { name, type, domainId }),
      updateRoom: (roomId, data) => request('PATCH', `/chat/rooms/${roomId}`, data),
      getRoomMembers: (roomId) => request('GET', `/chat/rooms/${roomId}/members`),
      addMember: (roomId, userId, role) =>
        request('POST', `/chat/rooms/${roomId}/members`, { userId, role }),
      removeMember: (roomId, userId) => request('DELETE', `/chat/rooms/${roomId}/members/${userId}`),
      updateMemberRole: (roomId, userId, role) =>
        request('PUT', `/chat/rooms/${roomId}/members/${userId}/role`, { role }),
      leaveRoom: (roomId) => request('POST', `/chat/rooms/${roomId}/leave`),
      createDirect: (targetUserId) => request('POST', '/chat/rooms/direct', { targetUserId }),
      deleteMessage: (roomId, messageId, scope = 'me') =>
        request('DELETE', withQuery(`/chat/rooms/${roomId}/messages/${messageId}`, { scope })),
      deleteConversation: (roomId) => request('DELETE', `/chat/rooms/${roomId}`),
      generateInviteCode: (roomId) => request('POST', `/chat/rooms/${roomId}/invite-code`),
      joinByInviteCode: (inviteCode) => request('POST', `/chat/rooms/join-by-code`, { inviteCode }),
      onUpdated: (callback) => {
        chatUpdatedListeners.add(callback);
        ensureRealtimeSocket();
        return () => {
          chatUpdatedListeners.delete(callback);
        };
      },
    },
    users: {
      list: () => request('GET', '/users'),
      changePassword: (data) => request('POST', '/users/change-password', data),
      generate2FA: () => request('POST', '/users/2fa/generate'),
      confirm2FA: (data) => request('POST', '/users/2fa/confirm', data),
      disable2FA: (data) => request('POST', '/users/2fa/disable', data),
    },
    tasks: {
      list: (filters) => request('GET', withQuery('/tasks', filters)),
      get: (id) => request('GET', `/tasks/${id}`),
      create: (data) => request('POST', '/tasks', data),
      update: (id, data) => request('PATCH', `/tasks/${id}`, data),
      delete: async (id) => {
        await request('DELETE', `/tasks/${id}`);
      },
      move: (id, columnId, index) => request('PATCH', `/tasks/${id}`, { columnId, orderIndex: index }),
    },
    approvals: {
      list: (filters) => request('GET', withQuery('/approvals', filters)),
      get: (id) => request('GET', `/approvals/${id}`),
      create: (data) => request('POST', '/approvals', data),
      approve: (id, comment) => request('POST', `/approvals/${id}/approve`, { comment }),
      reject: (id, comment) => request('POST', `/approvals/${id}/reject`, { comment }),
    },
    notes: {
      list: (domainId: string) => request('GET', `/notes?domainId=${encodeURIComponent(domainId)}`),
      create: (domainId: string, content: string) => request('POST', '/notes', { domainId, content }),
    },
    billing: {
      subscriptions: () => request('GET', '/billing/subscriptions'),
      invoices: () => request('GET', '/billing/invoices'),
    },
    sync: {
      getStatus: async () => {
        try {
          const status = await request('GET', '/sync/status');
          return {
            isOnline: navigator.onLine,
            isSyncing: false,
            lastSyncedAt: Math.floor(Date.now() / 1000),
            pendingCount: status?.hasChanges ? 1 : 0,
            conflictCount: 0,
            vectorClock: status?.serverClock ?? {},
          };
        } catch {
          return {
            isOnline: false,
            isSyncing: false,
            pendingCount: 0,
            conflictCount: 0,
            vectorClock: {},
          };
        }
      },
      onStatusChange: () => () => {},
      triggerSync: async () => {},
      start: async () => {},
      stop: async () => {},
    },
    monitoring: {
      status: async () => ({ isPaused: false }),
      pause: async () => ({ isPaused: false }),
    },
    notifications: {
      list: async (filters) => {
        const params: Record<string, unknown> = { limit: filters?.limit };
        if (filters?.unreadOnly) params.read = 'false';
        const result = await request('GET', withQuery('/notifications', params));
        return result?.data ?? result ?? [];
      },
      markRead: async (id) => {
        await request('PATCH', `/notifications/${id}/read`);
      },
    },
    notificationsList: {
      list: async (filters) => {
        const result = await request('GET', withQuery('/notifications', filters));
        return result?.data ?? result ?? [];
      },
      getUnreadCount: async () => {
        const result = await request('GET', '/notifications/unread-count');
        return result?.count ?? 0;
      },
      markRead: async (id) => {
        await request('PATCH', `/notifications/${id}/read`);
      },
      markAllRead: async () => {
        await request('PATCH', '/notifications/read-all');
      },
    },
    preferences: {
      get: async () => readLocal<Record<string, unknown>>('preferences', {}),
      update: async (data) => {
        writeLocal('preferences', { ...readLocal<Record<string, unknown>>('preferences', {}), ...data });
      },
    },
    settings: {
      get: async () => {
        const store = readLocal<Record<string, unknown>>('settings', {});
        return Object.entries(store).map(([key, value]) => ({ key, value }));
      },
      update: async (data) => {
        writeLocal('settings', { ...readLocal<Record<string, unknown>>('settings', {}), ...data });
      },
    },
    on: () => {},
    off: () => {},
  };
}

export function installWebBridge(): void {
  if (typeof window === 'undefined') return;
  if (window.electronAPI) return;
  window.electronAPI = createWebAPI();
  // eslint-disable-next-line no-console
  console.info(
    '[Synchro-D] Web mode active — desktop-only features (local DB, sync engine, native dialogs) are emulated.',
  );
}
