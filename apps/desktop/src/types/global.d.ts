export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    quit: () => Promise<void>;
    onNavigate: (callback: (route: string) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  dialog: {
    showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  };
  auth: {
    login: (email: string, password: string) => Promise<any>;
    register: (data: { email: string; password: string; name: string; inviteCode?: string }) => Promise<any>;
    refresh: (refreshToken: string) => Promise<{ accessToken: string; refreshToken: string }>;
    me: () => Promise<any>;
    logout: () => Promise<{ success: boolean }>;
    forgotPassword: (email: string) => Promise<{ success: boolean }>;
    resetPassword: (data: { token?: string; accessToken?: string; newPassword: string }) => Promise<{ success: boolean }>;
    onDeepLink: (callback: (url: string) => void) => () => void;
  };
  domains: {
    list: (filters?: Record<string, unknown>) => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (data: Record<string, unknown>) => Promise<any>;
    update: (id: string, data: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    checkNow: (id: string) => Promise<any>;
    bulkImport: (filePath: string) => Promise<any>;
    export: (filters?: Record<string, unknown>) => Promise<string>;
  };
  chat: {
    getRooms: () => Promise<any[]>;
    getMessages: (roomId: string, limit?: number, before?: number) => Promise<any[]>;
    sendMessage: (roomId: string, content: string, type?: string, metadata?: Record<string, unknown>) => Promise<any>;
    markAsRead: (roomId: string, messageId: string) => Promise<void>;
    createRoom: (name: string, type: string, domainId?: string) => Promise<any>;
    updateRoom: (roomId: string, data: { name?: string; description?: string }) => Promise<any>;
    getRoomMembers: (roomId: string) => Promise<any[]>;
    addMember: (roomId: string, userId: string, role?: 'ADMIN' | 'MEMBER') => Promise<any>;
    removeMember: (roomId: string, userId: string) => Promise<any>;
    updateMemberRole: (roomId: string, userId: string, role: 'ADMIN' | 'MEMBER') => Promise<any>;
    leaveRoom: (roomId: string) => Promise<any>;
    createDirect: (targetUserId: string) => Promise<any>;
    deleteMessage: (roomId: string, messageId: string, scope?: 'me' | 'everyone') => Promise<any>;
    deleteConversation: (roomId: string) => Promise<any>;
    generateInviteCode: (roomId: string) => Promise<any>;
    joinByInviteCode: (inviteCode: string) => Promise<any>;
    onUpdated?: (callback: (payload: unknown) => void) => () => void;
  };
  users: {
    list: () => Promise<any[]>;
    changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean }>;
    generate2FA: () => Promise<{ qrCode: string; secret: string }>;
    confirm2FA: (data: { token: string }) => Promise<{ verified: boolean; backupCodes?: string[] }>;
    disable2FA: (data: { password: string }) => Promise<{ success: boolean }>;
  };
  tasks: {
    list: (filters?: Record<string, unknown>) => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (data: Record<string, unknown>) => Promise<any>;
    update: (id: string, data: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    move: (id: string, columnId: string, index: number) => Promise<any>;
  };
  approvals: {
    list: (filters?: Record<string, unknown>) => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (data: Record<string, unknown>) => Promise<any>;
    approve: (id: string, comment?: string) => Promise<any>;
    reject: (id: string, comment?: string) => Promise<any>;
  };
  notes: {
    list: (domainId: string) => Promise<any[]>;
    create: (domainId: string, content: string) => Promise<any>;
  };
  billing?: {
    subscriptions: () => Promise<any[]>;
    invoices: () => Promise<any[]>;
  };
  sync: {
    getStatus: () => Promise<any>;
    onStatusChange: (callback: (status: any) => void) => () => void;
    triggerSync: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  };
  monitoring: {
    status: () => Promise<{ isPaused: boolean }>;
    pause: () => Promise<{ isPaused: boolean }>;
  };
  notifications: {
    list: (filters?: { limit?: number; unreadOnly?: boolean }) => Promise<any[]>;
    markRead: (id: string) => Promise<void>;
  };
  notificationsList: {
    list: (filters?: { userId?: string; read?: boolean; limit?: number; offset?: number }) => Promise<any[]>;
    getUnreadCount: () => Promise<number>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
  };
  preferences: {
    get: () => Promise<any>;
    update: (data: Record<string, unknown>) => Promise<void>;
  };
  settings: {
    get: () => Promise<any[]>;
    update: (data: Record<string, unknown>) => Promise<void>;
  };
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
