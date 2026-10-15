import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  MessageSquare, Send, Loader2, Plus, Hash, User, Search, ChevronLeft, MoreHorizontal,
  Users, Settings, X, UserPlus, MessageCircle, Key, Copy, RefreshCw, Globe,
  Shield, ShieldCheck, Trash2,
} from 'lucide-react';
import {
  useChatRooms, useMessages, useSendMessage, useCreateChatRoom, useCreateDirectMessage,
  useUsers, useGenerateInviteCode, useJoinByInviteCode, useChatRoomMembers,
  useAddChatMember, useRemoveChatMember, useUpdateChatMemberRole, useLeaveChatRoom,
  useUpdateChatRoom, useMarkChatRead, useDeleteMessage, useDeleteConversation,
} from '@/hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { SkeletonChatList } from '@/components/ui/skeleton';

type RoomType = 'DOMAIN' | 'GENERAL' | 'DIRECT' | 'GROUP';

interface ChatRoom {
  id: string;
  name: string | null;
  description?: string | null;
  type: RoomType;
  domainId?: string;
  inviteCode?: string | null;
  unread?: number;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
  memberCount?: number;
}

interface Message {
  id: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'TASK_CREATED' | 'APPROVAL_REQUESTED' | 'DOMAIN_UPDATE' | 'NOTE_ADDED';
  userId: string;
  roomId: string;
  createdAt: number | null;
  metadata?: any;
  replyToId?: string | null;
}

interface OrgUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

const AVATAR_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500',
];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name?: string | null, fallback?: string | null) {
  if (name) return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  return '?';
}

function toDate(sec?: number | null) {
  return new Date((sec ?? 0) * 1000);
}

function formatTime(sec?: number | null) {
  if (!sec) return '';
  return toDate(sec).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(sec: number) {
  const date = toDate(sec);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatRelative(sec?: number | null) {
  if (!sec) return '';
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return toDate(sec).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function Chat() {
  const { user } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoomDetail, setShowRoomDetail] = useState(false);
  const [showMobileRoomList, setShowMobileRoomList] = useState(true);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('GENERAL');
  const [newRoomDomainId, setNewRoomDomainId] = useState('');

  const [showCreateDirect, setShowCreateDirect] = useState(false);
  const [dmUserSearch, setDmUserSearch] = useState('');

  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');

  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: rooms = [], isLoading: roomsLoading } = useChatRooms();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedRoom || '');
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: members = [] } = useChatRoomMembers(selectedRoom || '');

  const navigate = useNavigate();
  const sendMessage = useSendMessage();
  const createRoom = useCreateChatRoom();
  const createDirect = useCreateDirectMessage();
  const generateInviteCode = useGenerateInviteCode();
  const joinByInviteCode = useJoinByInviteCode();
  const addMember = useAddChatMember();
  const removeMember = useRemoveChatMember();
  const updateMemberRole = useUpdateChatMemberRole();
  const leaveRoom = useLeaveChatRoom();
  const updateRoom = useUpdateChatRoom();
  const markRead = useMarkChatRead();
  const deleteMessage = useDeleteMessage();
  const deleteConversation = useDeleteConversation();

  const queryClient = useQueryClient();

  // Refresh chat data whenever the server reports a change (web + desktop).
  useEffect(() => {
    const unsubscribe = window.electronAPI?.chat?.onUpdated?.(() => {
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['chatRoomMembers'] });
    });
    return () => unsubscribe?.();
  }, [queryClient]);

  const usersById = useMemo(() => {
    const map: Record<string, OrgUser> = {};
    for (const u of users as OrgUser[]) map[u.id] = u;
    return map;
  }, [users]);

  const resolveName = (userId: string) => usersById[userId]?.name || 'Unknown user';

  const currentRoom = (rooms as ChatRoom[]).find(r => r.id === selectedRoom);

  const roomDisplayName = (room: ChatRoom) => {
    if (room.name) return room.name;
    if (room.type === 'DIRECT') {
      const other = (members as any[]).find(m => m.userId !== user?.id);
      if (room.id === selectedRoom && other) return resolveName(other.userId);
      return 'Direct Message';
    }
    return room.type;
  };

  useEffect(() => {
    if (!selectedRoom && (rooms as ChatRoom[]).length > 0) {
      setSelectedRoom((rooms as ChatRoom[])[0].id);
    }
  }, [rooms, selectedRoom]);

  // Scroll to bottom when messages change or room changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedRoom]);

  // Mark room as read when opened
  useEffect(() => {
    if (selectedRoom) markRead.mutate(selectedRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom]);

  // Keep the open room marked as read while the user is actively viewing it.
  // When a new message arrives (messages changes) and the window is focused,
  // clear the unread badge again after a short debounce.
  useEffect(() => {
    if (!selectedRoom) return;
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    if ((messages as Message[]).length === 0) return;
    const timer = setTimeout(() => markRead.mutate(selectedRoom), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom, messages]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedRoom) return;
    const content = messageInput.trim();
    setMessageInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await sendMessage.mutateAsync({ roomId: selectedRoom, content });
    } catch (error) {
      setMessageInput(content);
      toast.error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomType === 'DIRECT') {
      setShowCreateRoom(false);
      setShowCreateDirect(true);
      return;
    }
    try {
      const domainId = newRoomType === 'DOMAIN' && newRoomDomainId ? newRoomDomainId : undefined;
      const room = await createRoom.mutateAsync({ name: newRoomName, type: newRoomType, domainId });
      toast.success('Room created');
      setShowCreateRoom(false);
      setNewRoomName('');
      setNewRoomType('GENERAL');
      setNewRoomDomainId('');
      if (room?.id) setSelectedRoom(room.id);
    } catch (error) {
      toast.error(`Failed to create room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCreateDirect = async (userId: string) => {
    try {
      // First, check if a DM with this user already exists in our room list
      const existingDm = (rooms as ChatRoom[]).find(r => {
        if (r.type !== 'DIRECT') return false;
        const otherMember = (members as any[]).find(m => m.roomId === r.id && m.userId !== user?.id);
        return otherMember?.userId === userId;
      });

      if (existingDm) {
        setShowCreateDirect(false);
        setDmUserSearch('');
        setSearchQuery('');
        setSelectedRoom(existingDm.id);
        return;
      }

      const room = await createDirect.mutateAsync(userId);
      toast.success('Direct message created');
      setShowCreateDirect(false);
      setDmUserSearch('');
      setSearchQuery('');
      if (room?.id) setSelectedRoom(room.id);
    } catch (error) {
      toast.error(`Failed to create direct message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleGenerateInviteCode = async (roomId: string) => {
    try {
      await generateInviteCode.mutateAsync(roomId);
      toast.success('Invite code generated');
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      await joinByInviteCode.mutateAsync(joinCodeInput.trim());
      toast.success('Joined group chat');
      setShowJoinByCode(false);
      setJoinCodeInput('');
    } catch (error) {
      toast.error(`Failed to join group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedRoom) return;
    try {
      await addMember.mutateAsync({ roomId: selectedRoom, userId });
      toast.success('Member added');
    } catch (error) {
      toast.error(`Failed to add member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedRoom) return;
    try {
      await removeMember.mutateAsync({ roomId: selectedRoom, userId });
      toast.success('Member removed');
    } catch (error) {
      toast.error(`Failed to remove member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleToggleRole = async (userId: string, role: 'ADMIN' | 'MEMBER') => {
    if (!selectedRoom) return;
    try {
      await updateMemberRole.mutateAsync({ roomId: selectedRoom, userId, role });
    } catch (error) {
      toast.error(`Failed to update role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    if (!window.confirm('Leave this room? You will no longer see its messages.')) return;
    try {
      await leaveRoom.mutateAsync(selectedRoom);
      toast.success('Left room');
      setSelectedRoom(null);
      setShowRoomDetail(false);
    } catch (error) {
      toast.error(`Failed to leave room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteMessage = async (scope: 'me' | 'everyone') => {
    if (!selectedRoom || !messageToDelete) return;
    try {
      await deleteMessage.mutateAsync({ roomId: selectedRoom, messageId: messageToDelete.id, scope });
      toast.success(scope === 'everyone' ? 'Message deleted for everyone' : 'Message deleted');
      setMessageToDelete(null);
    } catch (error) {
      toast.error(`Failed to delete message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedRoom) return;
    if (!window.confirm('Delete this conversation? It will be removed from your chat list.')) return;
    try {
      await deleteConversation.mutateAsync(selectedRoom);
      toast.success('Conversation deleted');
      setSelectedRoom(null);
      setShowRoomDetail(false);
    } catch (error) {
      toast.error(`Failed to delete conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const openRoomSettings = () => {
    if (!currentRoom) return;
    setSettingsName(currentRoom.name || '');
    setSettingsDescription(currentRoom.description || '');
    setShowRoomSettings(true);
  };

  const handleSaveRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;
    try {
      await updateRoom.mutateAsync({ roomId: selectedRoom, data: { name: settingsName.trim(), description: settingsDescription.trim() } });
      toast.success('Room updated');
      setShowRoomSettings(false);
    } catch (error) {
      toast.error(`Failed to update room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const filteredRoomsList = useMemo(() => {
    if (!searchQuery.trim()) return rooms as ChatRoom[];
    const q = searchQuery.toLowerCase();
    return (rooms as ChatRoom[]).filter(r =>
      (r.name?.toLowerCase().includes(q)) ||
      r.type.toLowerCase().includes(q) ||
      (r.lastMessage?.toLowerCase().includes(q))
    );
  }, [rooms, searchQuery]);

  const filteredPeopleList = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return (users as OrgUser[]).filter(u =>
      u.id !== user?.id && (
        (u.name?.toLowerCase().includes(q)) ||
        (u.email?.toLowerCase().includes(q))
      )
    );
  }, [users, searchQuery, user?.id]);

  const myMembership = (members as any[]).find(m => m.userId === user?.id);
  const isAdmin = myMembership?.role === 'ADMIN';

  const nonMembers = (users as OrgUser[]).filter(
    u => u.id !== user?.id && !(members as any[]).some(m => m.userId === u.id)
  ).filter(u =>
    !memberSearch.trim() ||
    u.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const dmCandidates = (users as OrgUser[])
    .filter(u => u.id !== user?.id)
    .filter(u =>
      !dmUserSearch.trim() ||
      u.name?.toLowerCase().includes(dmUserSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(dmUserSearch.toLowerCase())
    );

  const isMobile = window.innerWidth < 768;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const roomTypeIcon = (type: RoomType, className = 'w-5 h-5') => {
    if (type === 'DIRECT') return <User className={cn('w-5 h-5', className)} />;
    if (type === 'GROUP') return <Users className="w-5 h-5" />;
    if (type === 'DOMAIN') return <Globe className="w-5 h-5" />;
    return <Hash className="w-5 h-5" />;
  };

  const renderRoomItem = (room: ChatRoom) => {
    const displayName = room.name || (room.type === 'DIRECT' ? roomNameForDm(room) : room.type);
    const isActive = selectedRoom === room.id;

    return (
      <button
        key={room.id}
        onClick={() => {
          setSelectedRoom(room.id);
          if (isMobile) setShowMobileRoomList(false);
        }}
        className={cn(
          'w-full text-left px-2.5 py-2 rounded-2xl transition-colors relative',
          isActive ? 'bg-primary/10' : 'hover:bg-accent/70'
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'relative w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
            room.type === 'DIRECT' ? avatarColor(room.id)
              : room.type === 'DOMAIN' ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
              : room.type === 'GROUP' ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
              : 'bg-gradient-to-br from-emerald-500 to-teal-500'
          )}>
            {room.type === 'DIRECT'
              ? getInitials(displayName === 'Direct Message' ? undefined : displayName, 'DM')
              : room.type === 'DOMAIN' ? <Globe className="w-5 h-5" />
              : room.type === 'GROUP' ? <Users className="w-5 h-5" />
              : <Hash className="w-5 h-5" />}
            {!!room.unread && room.unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-card">
                {room.unread > 9 ? '9+' : room.unread}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('truncate text-sm', room.unread ? 'font-semibold' : 'font-medium')}>{displayName}</span>
              <span className={cn('text-[11px] flex-shrink-0', room.unread ? 'text-primary font-medium' : 'text-muted-foreground')}>
                {formatRelative(room.lastMessageAt)}
              </span>
            </div>
            <span className={cn('truncate text-xs block mt-0.5', room.unread ? 'text-foreground' : 'text-muted-foreground')}>
              {room.lastMessage || 'No messages yet'}
            </span>
          </div>
        </div>
      </button>
    );
  };

  const renderPersonItem = (person: OrgUser) => (
    <button
      key={person.id}
      onClick={() => handleCreateDirect(person.id)}
      className="w-full text-left px-2.5 py-2 rounded-2xl transition-colors hover:bg-accent/70 text-foreground"
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
          avatarColor(person.id)
        )}>
          {getInitials(person.name, person.email)}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{person.name || person.email}</span>
          <span className="truncate text-xs text-muted-foreground block">{person.email}</span>
        </div>
      </div>
    </button>
  );

  function roomNameForDm(room: ChatRoom) {
    if (room.name) return room.name;
    const other = (members as any[]).find(m => m.userId !== user?.id);
    if (other) return usersById[other.userId]?.name || 'Direct Message';
    return 'Direct Message';
  }

  const renderedMessages = (messages as Message[]).map((msg, index) => {
    const prev = (messages as Message[])[index - 1];
    const next = (messages as Message[])[index + 1];
    const day = formatDay((msg.createdAt as number) || 0);
    return {
      msg,
      showDay: !prev || formatDay((prev.createdAt as number) || 0) !== day,
      showHeader: !prev || prev.userId !== msg.userId || formatDay((prev.createdAt as number) || 0) !== day,
      showTail: !next || next.userId !== msg.userId || formatDay((next.createdAt as number) || 0) !== day,
      own: msg.userId === user?.id,
    };
  });

  // Render messages content based on loading/empty state
  const messagesContent = messagesLoading && (messages as Message[]).length === 0 ? (
    <div className="flex justify-center py-8">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  ) : (messages as Message[]).length === 0 ? (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-center">No messages yet. Start the conversation!</p>
    </div>
  ) : (
    <div className="space-y-0.5 w-full">
      {renderedMessages.map(({ msg, showDay, showHeader, showTail, own }) => (
        <div key={msg.id}>
          {showDay && (
            <div className="flex items-center justify-center my-4">
              <span className="text-[11px] font-medium text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                {formatDay((msg.createdAt as number) || 0)}
              </span>
            </div>
          )}
          {msg.type !== 'TEXT' ? (
            <div className="flex justify-center my-2">
              <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1">
                {msg.content}
              </span>
            </div>
          ) : (
            <div className={cn('flex gap-2 group items-end', own ? 'justify-end' : 'justify-start', showHeader ? 'mt-2' : 'mt-0.5')}>
              {!own && (
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0',
                  avatarColor(msg.userId),
                  showHeader ? 'visible' : 'invisible'
                )}>
                  {getInitials(resolveName(msg.userId))}
                </div>
              )}
              <div className={cn('flex flex-col max-w-[70%]', own ? 'items-end' : 'items-start')}>
                {showHeader && !own && (
                  <span className="text-[11px] font-medium text-muted-foreground mb-0.5 px-3">{resolveName(msg.userId)}</span>
                )}
                <div className={cn('flex items-end gap-2', own && 'flex-row-reverse')}>
                  <div className={cn(
                    'px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm transition-shadow group-hover:shadow',
                    own
                      ? 'bg-gradient-to-br from-primary to-violet-500 text-white'
                      : 'bg-muted text-foreground',
                    own
                      ? (showTail ? 'rounded-3xl rounded-br-md' : 'rounded-3xl')
                      : (showTail ? 'rounded-3xl rounded-bl-md' : 'rounded-3xl')
                  )}>
                    {msg.content}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-muted-foreground mb-1"
                    title="Delete message"
                    onClick={() => setMessageToDelete(msg)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {showTail && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 mb-1">
                      {formatTime(msg.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Room List */}
      <aside className={cn(
        'w-80 flex-shrink-0 border-r bg-card flex flex-col',
        isMobile && (showMobileRoomList
          ? 'fixed inset-y-0 left-0 z-40 w-80'
          : 'hidden')
      )}>
        <div className="h-16 px-4 flex items-center justify-between border-b border-border/60 flex-shrink-0">
          <h2 className="font-semibold text-xl tracking-tight">Chats</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Join group" onClick={() => setShowJoinByCode(true)}>
              <UserPlus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" title="New room" onClick={() => setShowCreateRoom(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms or people..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-2 pb-3 space-y-0.5">
              {roomsLoading ? (
                <SkeletonChatList />
              ) : filteredRoomsList.length === 0 && filteredPeopleList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
              ) : (
                <>
                  {filteredRoomsList.length > 0 && (
                    <>
                      {searchQuery.trim() && (
                        <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rooms</p>
                      )}
                      {filteredRoomsList.map(renderRoomItem)}
                    </>
                  )}
                  {filteredPeopleList.length > 0 && (
                    <>
                      <p className="px-2 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">People</p>
                      {filteredPeopleList.map(renderPersonItem)}
                    </>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {isMobile && showMobileRoomList && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setShowMobileRoomList(false)} aria-hidden="true" />
      )}

      {/* Thread + details */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 min-h-0 flex-col">
          {selectedRoom && currentRoom ? (
            <>
              {/* Header */}
              <div className="h-16 px-4 flex items-center justify-between border-b border-border/60 flex-shrink-0 bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 min-w-0">
                  {isMobile && (
                    <Button variant="ghost" size="icon" onClick={() => setShowMobileRoomList(true)}>
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                  )}
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0',
                    currentRoom.type === 'DIRECT' ? avatarColor(currentRoom.id) :
                    currentRoom.type === 'GROUP' ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500' :
                    currentRoom.type === 'DOMAIN' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' :
                    'bg-gradient-to-br from-emerald-500 to-teal-500'
                  )}>
                    {currentRoom.type === 'DIRECT' ? <User className="w-5 h-5" /> :
                     currentRoom.type === 'GROUP' ? <Users className="w-5 h-5" /> :
                     currentRoom.type === 'DOMAIN' ? <Globe className="w-5 h-5" /> : <Hash className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate leading-tight">
                      {roomDisplayName(currentRoom)}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentRoom.type === 'DIRECT'
                        ? 'Active now'
                        : `${(members as any[]).length} member${(members as any[]).length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="capitalize hidden sm:inline-flex rounded-full">{currentRoom.type.toLowerCase()}</Badge>
                  <Button
                    variant={showRoomDetail ? 'secondary' : 'ghost'}
                    size="icon"
                    className="rounded-full"
                    onClick={() => setShowRoomDetail(!showRoomDetail)}
                    aria-label="Room details"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </div>
              </div>

{/* Messages */}
              <div className="flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
                <ScrollArea className="h-full">
                  <div className="p-4 min-h-full flex flex-col justify-end">
                    {messagesContent}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </div>

              {/* Composer */}
              <div className="border-t border-border/60 bg-card flex-shrink-0 p-3">
                <form
                  onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
                  className="flex items-end gap-2 rounded-3xl border border-input bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring"
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={messageInput}
                    onChange={e => { setMessageInput(e.target.value); resizeTextarea(); }}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Type a message..."
                    disabled={sendMessage.isPending}
                    className="flex-1 resize-none bg-transparent border-0 outline-none px-1 py-1.5 text-sm max-h-40 min-h-[24px] placeholder:text-muted-foreground"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-full h-9 w-9 flex-shrink-0"
                    disabled={sendMessage.isPending || !messageInput.trim()}
                  >
                    {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Select a room or create a new one</p>
                <p className="text-sm mt-1">Start collaborating with your team</p>
              </div>
            </div>
          )}
        </div>

        {/* Room details */}
        {showRoomDetail && selectedRoom && currentRoom && (
          <>
            {isMobile && (
              <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setShowRoomDetail(false)} />
            )}
            <aside className={cn(
              'w-96 flex-shrink-0 border-l bg-card flex flex-col',
              isMobile && 'fixed inset-y-0 right-0 z-40 w-96 max-w-[90vw]'
            )}>
              <div className="h-16 px-4 flex items-center justify-between border-b flex-shrink-0">
                <h3 className="font-semibold">Details</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowRoomDetail(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-6">
                  {/* Room header */}
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className={cn(
                      'w-16 h-16 rounded-full flex items-center justify-center text-white',
                      currentRoom.type === 'DIRECT' ? avatarColor(currentRoom.id) : 'bg-primary/80'
                    )}>
                      {currentRoom.type === 'DIRECT' ? <User className="w-7 h-7" />
                        : currentRoom.type === 'DOMAIN' ? <Globe className="w-7 h-7" />
                        : currentRoom.type === 'GROUP' ? <Users className="w-7 h-7" />
                        : <Hash className="w-7 h-7" />}
                    </div>
                    <div>
                      <p className="font-semibold">{roomDisplayName(currentRoom)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{currentRoom.type.toLowerCase()} room</p>
                    </div>
                    {currentRoom.description && (
                      <p className="text-sm text-muted-foreground text-center">{currentRoom.description}</p>
                    )}
                  </div>

                  {/* Members */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Members · {(members as any[]).length}
                      </h4>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowAddMembers(true)}>
                          <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {(members as any[]).map(member => {
                        const u = usersById[member.userId];
                        const isSelf = member.userId === user?.id;
                        return (
                          <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/60 group">
                            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0', avatarColor(member.userId))}>
                              {getInitials(u?.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {u?.name || 'Unknown'}{isSelf && <span className="text-muted-foreground"> (you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{u?.email}</p>
                            </div>
                            {member.role === 'ADMIN' && (
                              <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                            {isAdmin && !isSelf && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  title={member.role === 'ADMIN' ? 'Demote to member' : 'Promote to admin'}
                                  onClick={() => handleToggleRole(member.userId, member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                                >
                                  <Shield className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                  title="Remove member"
                                  onClick={() => handleRemoveMember(member.userId)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Invite code (GROUP) */}
                  {currentRoom.type === 'GROUP' && (
                    <div className="space-y-2 border-t pt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invite Code</h4>
                      {currentRoom.inviteCode ? (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-muted px-3 py-2 rounded font-mono text-sm break-all">{currentRoom.inviteCode}</code>
                          <Button variant="ghost" size="sm" onClick={() => handleGenerateInviteCode(currentRoom.id)} disabled={generateInviteCode.isPending}>
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(currentRoom.inviteCode || '')}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleGenerateInviteCode(currentRoom.id)} disabled={generateInviteCode.isPending}>
                          <Key className="w-4 h-4" /> Generate Invite Code
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Linked domain */}
                  {currentRoom.type === 'DOMAIN' && currentRoom.domainId && (
                    <div className="space-y-2 border-t pt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Domain</h4>
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/domains/${currentRoom.domainId}`)}>
                        <Globe className="w-4 h-4" /> View Domain
                      </Button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</h4>
                    {currentRoom.type !== 'DIRECT' && (
                      <>
                        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setShowAddMembers(true)}>
                          <UserPlus className="w-4 h-4" /> Add Members
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2" onClick={openRoomSettings}>
                          <Settings className="w-4 h-4" /> Room Settings
                        </Button>
                      </>
                    )}
                    {currentRoom.type !== 'DIRECT' && (
                      <Button variant="destructive" className="w-full justify-start gap-2" onClick={handleLeaveRoom}>
                        <X className="w-4 h-4" /> Leave Room
                      </Button>
                    )}
                    <Button variant="destructive" className="w-full justify-start gap-2" onClick={handleDeleteConversation}>
                      <Trash2 className="w-4 h-4" /> Delete Conversation
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </aside>
          </>
        )}
      </div>

      {/* Mobile room list toggle */}
      {isMobile && !showMobileRoomList && (
        <Button
          variant="outline" size="icon"
          className="fixed bottom-4 right-4 z-40 rounded-full shadow-lg"
          onClick={() => setShowMobileRoomList(true)}
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
      )}

      {/* Create Room Dialog */}
      <Dialog open={showCreateRoom} onOpenChange={setShowCreateRoom}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Chat Room</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRoom}>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="Project Alpha, Team Sync, etc."
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="room-type">Type</Label>
                <select
                  id="room-type"
                  value={newRoomType}
                  onChange={e => setNewRoomType(e.target.value as RoomType)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="GENERAL">General</option>
                  <option value="DOMAIN">Domain-specific</option>
                  <option value="GROUP">Group</option>
                </select>
              </div>
              {newRoomType === 'DOMAIN' && (
                <div>
                  <Label htmlFor="room-domain">Domain ID (optional)</Label>
                  <Input
                    id="room-domain"
                    placeholder="domain-uuid"
                    value={newRoomDomainId}
                    onChange={e => setNewRoomDomainId(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateRoom(false)}>Cancel</Button>
              <Button type="submit" disabled={createRoom.isPending}>
                {createRoom.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create Room
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create DM Dialog */}
      <Dialog open={showCreateDirect} onOpenChange={setShowCreateDirect}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start Direct Message</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={dmUserSearch}
                onChange={e => setDmUserSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="max-h-60">
              <div className="space-y-1">
                {usersLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : dmCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                ) : (
                  dmCandidates.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleCreateDirect(u.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold', avatarColor(u.id))}>
                        {getInitials(u.name, u.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{u.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <MessageCircle className="w-5 h-5 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowCreateDirect(false); setDmUserSearch(''); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Members Dialog */}
      <Dialog open={showAddMembers} onOpenChange={setShowAddMembers}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search people..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="max-h-60">
              <div className="space-y-1">
                {nonMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Everyone is already a member</p>
                ) : (
                  nonMembers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/60">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0', avatarColor(u.id))}>
                        {getInitials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleAddMember(u.id)} disabled={addMember.isPending}>
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddMembers(false); setMemberSearch(''); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room Settings Dialog */}
      <Dialog open={showRoomSettings} onOpenChange={setShowRoomSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room Settings</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRoomSettings}>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="settings-name">Room Name</Label>
                <Input
                  id="settings-name"
                  value={settingsName}
                  onChange={e => setSettingsName(e.target.value)}
                  placeholder="Room name"
                />
              </div>
              <div>
                <Label htmlFor="settings-description">Description</Label>
                <textarea
                  id="settings-description"
                  value={settingsDescription}
                  onChange={e => setSettingsDescription(e.target.value)}
                  placeholder="What is this room about?"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowRoomSettings(false)}>Cancel</Button>
              <Button type="submit" disabled={updateRoom.isPending}>
                {updateRoom.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Group Dialog */}
      <Dialog open={showJoinByCode} onOpenChange={setShowJoinByCode}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Join Group Chat</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoinByCode}>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="join-code">Invite Code</Label>
                <Input
                  id="join-code"
                  placeholder="GRP-XXXXXXXX"
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={joinByInviteCode.isPending || !joinCodeInput.trim()}>
                {joinByInviteCode.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Join
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Message Dialog */}
      <Dialog open={!!messageToDelete} onOpenChange={open => { if (!open) setMessageToDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose how you want to remove this message.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleDeleteMessage('me')}
              disabled={deleteMessage.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete for me
            </Button>
            {messageToDelete?.userId === user?.id && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleDeleteMessage('everyone')}
                disabled={deleteMessage.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete for everyone
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => setMessageToDelete(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
