export type Role = 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';

export type DomainType = 'MANAGED' | 'MONITORED';
export type DomainStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'PENDING_TRANSFER' | 'ERROR';

export type CheckType = 'WHOIS' | 'DNS' | 'SSL' | 'EXPIRY' | 'REGISTRAR_LOCK';
export type CheckStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export type RoomType = 'DOMAIN' | 'GENERAL' | 'DIRECT' | 'GROUP';
export type MemberRole = 'ADMIN' | 'MEMBER';
export type MessageType = 'TEXT' | 'SYSTEM' | 'TASK_CREATED' | 'APPROVAL_REQUESTED' | 'DOMAIN_UPDATE' | 'NOTE_ADDED';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ApprovalType = 'RENEWAL' | 'TRANSFER' | 'DNS_CHANGE' | 'DELETE' | 'CUSTOM';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface VectorClock {
  [nodeId: string]: number;
}

export interface SyncedEntity {
  id: string;
  vectorClock: VectorClock;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Organization extends SyncedEntity {
  name: string;
  slug: string;
  settings: Record<string, unknown>;
}

export interface User extends SyncedEntity {
  email: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  organizationId: string;
}

export interface Domain extends SyncedEntity {
  name: string;
  type: DomainType;
  status: DomainStatus;
  registrar?: string;
  registrarDomainId?: string;
  nameservers: string[];
  authCode?: string;
  expiryDate?: number;
  autoRenew: boolean;
  monitoringEnabled: boolean;
  checkInterval: number;
  pricePerYear: number;
  currency: string;
  organizationId: string;
  assigneeId?: string;
  subscriptionId?: string;
  chatRoomId?: string;
}

export interface DomainCheck extends SyncedEntity {
  domainId: string;
  type: CheckType;
  status: CheckStatus;
  data: Record<string, unknown>;
  previousData?: Record<string, unknown>;
  checkedAt: number;
  nextCheckAt: number;
}

export interface Subscription extends SyncedEntity {
  organizationId: string;
  domainId: string;
  planId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodEnd: number;
}

export interface ChatRoom extends SyncedEntity {
  name?: string;
  type: RoomType;
  organizationId: string;
  domainId?: string;
}

export interface ChatRoomMember extends SyncedEntity {
  userId: string;
  roomId: string;
  role: MemberRole;
  joinedAt: number;
  lastReadAt?: number;
}

export interface Message extends SyncedEntity {
  content: string;
  type: MessageType;
  metadata?: Record<string, unknown>;
  userId: string;
  roomId: string;
  replyToId?: string;
}

export interface Task extends SyncedEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  domainId?: string;
  assigneeId?: string;
  creatorId: string;
  dueDate?: number;
  completedAt?: number;
}

export interface Approval extends SyncedEntity {
  type: ApprovalType;
  title: string;
  description?: string;
  status: ApprovalStatus;
  domainId: string;
  requesterId: string;
  approverId?: string;
  metadata: Record<string, unknown>;
  decidedAt?: number;
}

export interface Note extends SyncedEntity {
  content: string;
  domainId: string;
  userId: string;
}

export interface AuditLog extends SyncedEntity {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  userId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface PendingOperation {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  vectorClock: VectorClock;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
}

export interface SyncPullRequest {
  since: VectorClock;
  entityTypes: string[];
  limit?: number;
}

export interface SyncPullResponse {
  entities: Record<string, SyncedEntity[]>;
  serverClock: VectorClock;
  conflicts: SyncConflict[];
}

export interface SyncPushRequest {
  operations: PendingOperation[];
  clientClock: VectorClock;
}

export interface SyncPushResponse {
  serverClock: VectorClock;
  applied: string[];
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  entityType: string;
  entityId: string;
  localVersion: SyncedEntity;
  serverVersion: SyncedEntity;
  resolution?: 'local' | 'server' | 'merge';
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt?: number;
  pendingCount: number;
  conflictCount: number;
}

export interface DomainAlert {
  id: string;
  domainId: string;
  domainName: string;
  type: 'EXPIRY' | 'SSL_EXPIRY' | 'DNS_MISMATCH' | 'REGISTRAR_LOCK' | 'WHOIS_CHANGE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  acknowledgedAt?: number;
}

export interface NotificationPayload {
  id: string;
  type: 'domain_alert' | 'task_assigned' | 'approval_requested' | 'message_mention' | 'sync_conflict';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type { VectorClock as VectorClockType } from './types';