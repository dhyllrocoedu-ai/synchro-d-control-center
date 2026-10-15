import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface SettingItem {
  key: string;
  value: string;
}

export type Domain = {
  id: string;
  name: string;
  type: 'MANAGED' | 'MONITORED';
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'PENDING_TRANSFER' | 'ERROR' | 'CRITICAL';
  registrar?: string;
  expiryDate?: number;
  autoRenew: boolean;
  monitoringEnabled: boolean;
  pricePerYear: number;
  currency: string;
};

type ChatRoom = {
  id: string;
  name: string | null;
  type: 'DOMAIN' | 'GENERAL' | 'DIRECT' | 'GROUP';
  domainId?: string;
  unread?: number;
  lastMessage?: string;
  time?: string;
};

type Message = {
  id: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'TASK_CREATED' | 'APPROVAL_REQUESTED' | 'DOMAIN_UPDATE' | 'NOTE_ADDED';
  userId: string;
  userName?: string;
  roomId: string;
  createdAt: number | null;
  time?: string;
  metadata?: any;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  domainId?: string;
  assigneeId?: string;
  creatorId: string;
  dueDate?: number;
  domainName?: string;
  assigneeName?: string;
};

export type Approval = {
  id: string;
  type: 'RENEWAL' | 'TRANSFER' | 'DNS_CHANGE' | 'DELETE' | 'CUSTOM';
  title: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  domainId: string;
  domainName?: string;
  requesterId: string;
  requesterName?: string;
  approverId?: string;
  metadata: any;
  decidedAt?: number;
};

type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt?: number;
  pendingCount: number;
  conflictCount: number;
  vectorClock: Record<string, number>;
};

function getAPI() {
  const api = window.electronAPI;
  if (!api) {
    throw new Error('Synchro-D must run inside the desktop app (window.electronAPI not available)');
  }
  return api;
}

function getCurrentUser(): Promise<string | undefined> {
  return getAPI().settings.get().then((s: SettingItem[]) => s.find((x: SettingItem) => x.key === 'currentUser')?.value);
}

export function useDomains(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['domains', filters],
    queryFn: () => getAPI().domains.list(filters),
    staleTime: 30000,
  });
}

export function useDomain(id: string) {
  return useQuery({
    queryKey: ['domain', id],
    queryFn: () => getAPI().domains.get(id),
    enabled: !!id,
  });
}

export function useCreateDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Domain>) => getAPI().domains.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });
}

export function useUpdateDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Domain> }) => getAPI().domains.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getAPI().domains.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  });
}

export function useCheckDomainNow() {
  return useMutation({
    mutationFn: (id: string) => getAPI().domains.checkNow(id),
  });
}

export function useChatRooms() {
  return useQuery({
    queryKey: ['chatRooms'],
    queryFn: () => getAPI().chat.getRooms(),
    staleTime: 30000,
  });
}

export function useMessages(roomId: string, limit = 50) {
  return useQuery({
    queryKey: ['messages', roomId, limit],
    queryFn: () => getAPI().chat.getMessages(roomId, limit),
    enabled: !!roomId,
    staleTime: 10000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, content, type, metadata }: { roomId: string; content: string; type?: string; metadata?: any }) =>
      getAPI().chat.sendMessage(roomId, content, type, metadata),
    onMutate: async (vars) => {
      // The messages query is keyed ['messages', roomId, limit]; match the
      // prefix so we update whichever limit is currently cached.
      const messagesKey = { queryKey: ['messages', vars.roomId] as const };

      // Cancel any outgoing refetches
      await qc.cancelQueries(messagesKey);

      // Snapshot the previous value(s) for rollback
      const previousMessages = qc.getQueriesData<Message[]>(messagesKey);

      // Optimistically insert a temporary message
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        content: vars.content,
        type: (vars.type as Message['type']) || 'TEXT',
        userId: '', // Will be filled by the server response
        roomId: vars.roomId,
        createdAt: Math.floor(Date.now() / 1000),
        metadata: vars.metadata,
      };

      qc.setQueriesData<Message[]>(messagesKey, (old) => {
        const messages = old || [];
        return [...messages, tempMessage].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      });

      return { previousMessages };
    },
    onError: (err, _vars, context) => {
      if (context?.previousMessages) {
        for (const [key, data] of context.previousMessages) {
          qc.setQueryData(key, data);
        }
      }
      toast.error(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
    onSuccess: (serverMessage, vars) => {
      // Replace the temp message with the server response
      qc.setQueriesData<Message[]>({ queryKey: ['messages', vars.roomId] }, (old) => {
        const messages = old || [];
        // Remove any temp messages for this content
        const filtered = messages.filter(m => !m.id.startsWith('temp-') || m.content !== vars.content);
        // Add the real message if not already present
        const exists = filtered.some(m => m.id === serverMessage.id);
        const withReal = exists ? filtered : [...filtered, serverMessage];
        return withReal.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useCreateChatRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, type, domainId }: { name: string; type: string; domainId?: string }) =>
      getAPI().chat.createRoom(name, type, domainId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatRooms'] }),
  });
}

export function useUpdateChatRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: { name?: string; description?: string } }) =>
      getAPI().chat?.updateRoom?.(roomId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
      qc.invalidateQueries({ queryKey: ['chatRooms', vars.roomId] });
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => getAPI().chat?.markAsRead?.(roomId, ''),
    onSuccess: (_, roomId) => qc.invalidateQueries({ queryKey: ['chatRooms'] }),
  });
}

export function useChatRoomMembers(roomId: string) {
  return useQuery({
    queryKey: ['chatRoomMembers', roomId],
    queryFn: () => getAPI().chat?.getRoomMembers?.(roomId),
    enabled: !!roomId && !!getAPI().chat?.getRoomMembers,
    staleTime: 30000,
  });
}

export function useAddChatMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, userId, role }: { roomId: string; userId: string; role?: 'ADMIN' | 'MEMBER' }) =>
      getAPI().chat?.addMember?.(roomId, userId, role),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chatRoomMembers', vars.roomId] });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useRemoveChatMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, userId }: { roomId: string; userId: string }) =>
      getAPI().chat?.removeMember?.(roomId, userId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chatRoomMembers', vars.roomId] });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useUpdateChatMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, userId, role }: { roomId: string; userId: string; role: 'ADMIN' | 'MEMBER' }) =>
      getAPI().chat?.updateMemberRole?.(roomId, userId, role),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['chatRoomMembers', vars.roomId] });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useLeaveChatRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => getAPI().chat?.leaveRoom?.(roomId),
    onSuccess: (_data, roomId) => {
      qc.invalidateQueries({ queryKey: ['chatRoomMembers', roomId] });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useCreateDirectMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => getAPI().chat?.createDirect?.(targetUserId),
    onSuccess: (room: any) => {
      // Optimistically add the new conversation so it opens immediately.
      if (room?.id) {
        qc.setQueryData(['chatRooms'], (old: any) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((r: any) => r.id === room.id)) return list;
          return [
            { memberCount: 2, lastMessage: null, lastMessageAt: null, unread: 0, ...room },
            ...list,
          ];
        });
      }
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, messageId, scope }: { roomId: string; messageId: string; scope: 'me' | 'everyone' }) =>
      getAPI().chat?.deleteMessage?.(roomId, messageId, scope),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.roomId] });
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => getAPI().chat?.deleteConversation?.(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    },
  });
}

export function useGenerateInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => getAPI().chat?.generateInviteCode?.(roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatRooms'] }),
  });
}

export function useJoinByInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => getAPI().chat?.joinByInviteCode?.(inviteCode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatRooms'] }),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => getAPI().users?.list?.() ?? [],
    staleTime: 60000,
  });
}

export function useTasks(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => getAPI().tasks.list(filters),
    staleTime: 30000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) => getAPI().tasks.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => getAPI().tasks.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getAPI().tasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, columnId }: { id: string; columnId: string }) => getAPI().tasks.move(id, columnId, 0),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useApprovals(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['approvals', filters],
    queryFn: () => getAPI().approvals.list(filters),
    staleTime: 30000,
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Approval>) => getAPI().approvals.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useApproveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => getAPI().approvals.approve(id, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useRejectApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => getAPI().approvals.reject(id, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useNotes(domainId: string) {
  return useQuery({
    queryKey: ['notes', domainId],
    queryFn: () => getAPI().notes.list(domainId),
    enabled: !!domainId,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domainId, content }: { domainId: string; content: string }) => getAPI().notes.create(domainId, content),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notes', vars.domainId] }),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const api = window.electronAPI;
      if (!api?.billing?.subscriptions) return [] as any[];
      try {
        return (await api.billing.subscriptions()) ?? [];
      } catch {
        return [] as any[];
      }
    },
    staleTime: 60000,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const api = window.electronAPI;
      if (!api?.billing?.invoices) return [] as any[];
      try {
        return (await api.billing.invoices()) ?? [];
      } catch {
        return [] as any[];
      }
    },
    staleTime: 60000,
  });
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    conflictCount: 0,
    vectorClock: {},
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.sync) return;

    let mounted = true;
    api.sync.getStatus().then((s: SyncStatus) => mounted && setStatus(s));
    const unsub = api.sync.onStatusChange((s: SyncStatus) => {
      if (mounted) setStatus(s);
    });
    const interval = setInterval(() => {
      api.sync.getStatus().then((s: SyncStatus) => mounted && setStatus(s));
    }, 30000);
    return () => { mounted = false; unsub(); clearInterval(interval); };
  }, []);

  const triggerSync = useMutation({
    mutationFn: () => window.electronAPI?.sync?.triggerSync?.(),
    onSuccess: () => window.electronAPI?.sync?.getStatus?.().then(setStatus),
  });

  return { ...status, triggerSync: triggerSync.mutate };
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => getAPI().settings.get(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => getAPI().settings.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useMonitoringStatus() {
  const [isPaused, setIsPaused] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.monitoring) return;
    api.monitoring.status().then(({ isPaused: paused }: { isPaused: boolean }) => setIsPaused(paused));
  }, []);
  const toggle = useMutation({
    mutationFn: () => window.electronAPI?.monitoring?.pause?.(),
    onSuccess: (data: { isPaused: boolean }) => setIsPaused(data.isPaused),
  });
  return { isPaused, toggle: toggle.mutate };
}

export function useOpenExternal() {
  return useMutation({
    mutationFn: (url: string) => getAPI().shell.openExternal(url),
  });
}

export function useShowOpenDialog() {
  return useMutation({
    mutationFn: (options: Electron.OpenDialogOptions) => getAPI().dialog.showOpenDialog(options),
  });
}

export function useAppVersion() {
  return useQuery({
    queryKey: ['appVersion'],
    queryFn: () => getAPI().app.getVersion(),
    staleTime: Infinity,
  });
}

export function useNotifications(filters?: { limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: () => getAPI().notifications?.list?.(filters) ?? [],
    staleTime: 30000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getAPI().notifications?.markRead?.(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      getAPI().auth?.login?.(email, password),
    onSuccess: (data) => {
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; name: string }) =>
      getAPI().auth?.register?.(data),
    onSuccess: (data) => {
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => getAPI().auth?.me?.(),
    staleTime: 60000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getAPI().auth?.logout?.(),
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => getAPI().auth?.forgotPassword?.(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token?: string; accessToken?: string; newPassword: string }) =>
      getAPI().auth?.resetPassword?.(data),
  });
}