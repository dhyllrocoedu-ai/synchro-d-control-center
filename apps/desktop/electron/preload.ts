import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const electronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    onNavigate: (callback: (route: string) => void) => {
      const handler = (_event: IpcRendererEvent, route: string) => callback(route);
      ipcRenderer.on('navigate', handler);
      return () => { ipcRenderer.removeListener('navigate', handler); };
    }
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
  },
  dialog: {
    showOpenDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:show-open-dialog', options)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on('window:maximized-changed', handler);
      return () => { ipcRenderer.removeListener('window:maximized-changed', handler); };
    }
  },
  auth: {
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
    register: (data: { email: string; password: string; name: string }) => ipcRenderer.invoke('auth:register', data),
    refresh: (refreshToken: string) => ipcRenderer.invoke('auth:refresh', refreshToken),
    me: () => ipcRenderer.invoke('auth:me'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    forgotPassword: (email: string) => ipcRenderer.invoke('auth:forgot-password', email),
    resetPassword: (data: { token?: string; accessToken?: string; newPassword: string }) => ipcRenderer.invoke('auth:reset-password', data),
    onDeepLink: (callback: (url: string) => void) => {
      const handler = (_event: IpcRendererEvent, url: string) => callback(url);
      ipcRenderer.on('auth:deep-link', handler);
      return () => { ipcRenderer.removeListener('auth:deep-link', handler); };
    },
  },
  domains: {
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('domains:list', filters),
    get: (id: string) => ipcRenderer.invoke('domains:get', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('domains:create', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('domains:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('domains:delete', id),
    checkNow: (id: string) => ipcRenderer.invoke('domains:check-now', id),
    bulkImport: (filePath: string) => ipcRenderer.invoke('domains:bulk-import', filePath),
    export: (filters?: Record<string, unknown>) => ipcRenderer.invoke('domains:export', filters)
  },
  chat: {
    getRooms: () => ipcRenderer.invoke('chat:get-rooms'),
    getMessages: (roomId: string, limit?: number, before?: number) => ipcRenderer.invoke('chat:get-messages', roomId, limit, before),
    sendMessage: (roomId: string, content: string, type?: string, metadata?: Record<string, unknown>) => ipcRenderer.invoke('chat:send-message', roomId, content, type, metadata),
    markAsRead: (roomId: string, messageId: string) => ipcRenderer.invoke('chat:mark-as-read', roomId, messageId),
    createRoom: (name: string, type: string, domainId?: string) => ipcRenderer.invoke('chat:create-room', name, type, domainId),
    updateRoom: (roomId: string, data: { name?: string; description?: string }) => ipcRenderer.invoke('chat:update-room', roomId, data),
    getRoomMembers: (roomId: string) => ipcRenderer.invoke('chat:get-room-members', roomId),
    addMember: (roomId: string, userId: string, role?: 'ADMIN' | 'MEMBER') => ipcRenderer.invoke('chat:add-member', roomId, userId, role),
    removeMember: (roomId: string, userId: string) => ipcRenderer.invoke('chat:remove-member', roomId, userId),
    updateMemberRole: (roomId: string, userId: string, role: 'ADMIN' | 'MEMBER') => ipcRenderer.invoke('chat:update-member-role', roomId, userId, role),
    leaveRoom: (roomId: string) => ipcRenderer.invoke('chat:leave-room', roomId),
    createDirect: (targetUserId: string) => ipcRenderer.invoke('chat:create-direct', targetUserId),
    deleteMessage: (roomId: string, messageId: string, scope: 'me' | 'everyone' = 'me') => ipcRenderer.invoke('chat:delete-message', roomId, messageId, scope),
    deleteConversation: (roomId: string) => ipcRenderer.invoke('chat:delete-conversation', roomId),
    generateInviteCode: (roomId: string) => ipcRenderer.invoke('chat:generate-invite-code', roomId),
    joinByInviteCode: (inviteCode: string) => ipcRenderer.invoke('chat:join-by-code', inviteCode),
    onUpdated: (callback: (payload: unknown) => void) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on('chat:updated', handler);
      return () => { ipcRenderer.removeListener('chat:updated', handler); };
    }
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    changePassword: (data: { currentPassword: string; newPassword: string }) => ipcRenderer.invoke('users:change-password', data),
    generate2FA: () => ipcRenderer.invoke('users:generate-2fa'),
    confirm2FA: (data: { token: string }) => ipcRenderer.invoke('users:confirm-2fa', data),
    disable2FA: (data: { password: string }) => ipcRenderer.invoke('users:disable-2fa', data)
  },
  tasks: {
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('tasks:list', filters),
    get: (id: string) => ipcRenderer.invoke('tasks:get', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
    move: (id: string, columnId: string, index: number) => ipcRenderer.invoke('tasks:move', id, columnId, index)
  },
  approvals: {
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke('approvals:list', filters),
    get: (id: string) => ipcRenderer.invoke('approvals:get', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('approvals:create', data),
    approve: (id: string, comment?: string) => ipcRenderer.invoke('approvals:approve', id, comment),
    reject: (id: string, comment?: string) => ipcRenderer.invoke('approvals:reject', id, comment)
  },
  notes: {
    list: (domainId: string) => ipcRenderer.invoke('notes:list', domainId),
    create: (domainId: string, content: string) => ipcRenderer.invoke('notes:create', domainId, content),
    update: (id: string, content: string) => ipcRenderer.invoke('notes:update', id, content),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id)
  },
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:get-status'),
    triggerSync: () => ipcRenderer.invoke('sync:trigger'),
    start: async () => {
      await ipcRenderer.invoke('sync:start');
      await ipcRenderer.invoke('scheduler:start');
    },
    stop: async () => {
      await ipcRenderer.invoke('sync:stop');
      await ipcRenderer.invoke('scheduler:stop');
    },
    onStatusChange: (callback: (status: any) => void) => {
      const handler = (_event: IpcRendererEvent, status: any) => callback(status);
      ipcRenderer.on('sync:status-changed', handler);
      return () => { ipcRenderer.removeListener('sync:status-changed', handler); };
    }
  },
  notificationsList: {
    list: (filters?: { userId?: string; read?: boolean; limit?: number; offset?: number }) => ipcRenderer.invoke('notifications:list', filters),
    getUnreadCount: () => ipcRenderer.invoke('notifications:unread-count'),
    markRead: (id: string) => ipcRenderer.invoke('notifications:mark-read', id),
    markAllRead: () => ipcRenderer.invoke('notifications:mark-all-read'),
  },
  preferences: {
    get: () => ipcRenderer.invoke('preferences:get'),
    update: (data: Record<string, unknown>) => ipcRenderer.invoke('preferences:update', data),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:update', data)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);