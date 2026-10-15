import { sqliteTable, text, integer, real, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] }).default('MEMBER'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
});

export const domains = sqliteTable('domains', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['MANAGED', 'MONITORED'] }).default('MONITORED'),
  status: text('status', { enum: ['ACTIVE', 'EXPIRING', 'EXPIRED', 'PENDING_TRANSFER', 'ERROR'] }).default('ACTIVE'),
  registrar: text('registrar'),
  registrarDomainId: text('registrar_domain_id'),
  nameservers: text('nameservers', { mode: 'json' }).default('[]'),
  authCode: text('auth_code').unique(),
  expiryDate: integer('expiry_date'),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).default(true),
  monitoringEnabled: integer('monitoring_enabled', { mode: 'boolean' }).default(true),
  checkInterval: integer('check_interval').default(3600),
  pricePerYear: real('price_per_year').default(0),
  currency: text('currency').default('USD'),
  assigneeId: text('assignee_id').references(() => users.id),
  subscriptionId: text('subscription_id'),
  chatRoomId: text('chat_room_id'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`),
  deletedAt: integer('deleted_at')
}, (table) => ({
  statusIdx: index('domains_status_idx').on(table.status),
  expiryIdx: index('domains_expiry_idx').on(table.expiryDate),
  syncIdx: index('domains_sync_idx').on(table.lastSyncedAt)
}));

export const domainChecks = sqliteTable('domain_checks', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['WHOIS', 'DNS', 'SSL', 'EXPIRY', 'REGISTRAR_LOCK'] }).notNull(),
  status: text('status', { enum: ['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'] }).notNull(),
  data: text('data', { mode: 'json' }).notNull(),
  previousData: text('previous_data', { mode: 'json' }),
  checkedAt: integer('checked_at').default(sql`(strftime('%s', 'now'))`),
  nextCheckAt: integer('next_check_at'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at')
}, (table) => ({
  domainTypeTimeIdx: index('checks_domain_type_time_idx').on(table.domainId, table.type, table.checkedAt)
}));

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().unique().references(() => domains.id),
  planId: text('plan_id').notNull(),
  status: text('status', { enum: ['ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING'] }).default('ACTIVE'),
  billingCycle: text('billing_cycle', { enum: ['MONTHLY', 'YEARLY'] }).default('YEARLY'),
  currentPeriodEnd: integer('current_period_end').notNull(),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
});

export const chatRooms = sqliteTable('chat_rooms', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  type: text('type', { enum: ['DOMAIN', 'GENERAL', 'DIRECT', 'GROUP'] }).default('DOMAIN'),
  domainId: text('domain_id').unique().references(() => domains.id),
  inviteCode: text('invite_code').unique(),
  dmKey: text('dm_key').unique(),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
});

export const chatRoomMembers = sqliteTable('chat_room_members', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['ADMIN', 'MEMBER'] }).default('MEMBER'),
  joinedAt: integer('joined_at').default(sql`(strftime('%s', 'now'))`),
  lastReadAt: integer('last_read_at'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  deletedAt: integer('deleted_at'),
  updatedAt: integer('updated_at')
}, (table) => ({
  uniqueUserRoom: index('chat_room_members_unique_idx').on(table.userId, table.roomId)
}));

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  type: text('type', { enum: ['TEXT', 'SYSTEM', 'TASK_CREATED', 'APPROVAL_REQUESTED', 'DOMAIN_UPDATE', 'NOTE_ADDED'] }).default('TEXT'),
  metadata: text('metadata', { mode: 'json' }),
  userId: text('user_id').notNull().references(() => users.id),
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => messages.id, { onDelete: 'cascade' }),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`),
  deletedAt: integer('deleted_at')
}, (table) => ({
  roomTimeIdx: index('messages_room_time_idx').on(table.roomId, table.createdAt)
}));

export const messageDeletions = sqliteTable('message_deletions', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  uniqueMessageUser: index('message_deletions_unique_idx').on(table.messageId, table.userId)
}));

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED'] }).default('TODO'),
  priority: text('priority', { enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }).default('MEDIUM'),
  domainId: text('domain_id').references(() => domains.id),
  assigneeId: text('assignee_id').references(() => users.id),
  creatorId: text('creator_id').notNull().references(() => users.id),
  dueDate: integer('due_date'),
  completedAt: integer('completed_at'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  domainStatusIdx: index('tasks_domain_status_idx').on(table.domainId, table.status),
  assigneeStatusIdx: index('tasks_assignee_status_idx').on(table.assigneeId, table.status)
}));

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['RENEWAL', 'TRANSFER', 'DNS_CHANGE', 'DELETE', 'CUSTOM'] }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] }).default('PENDING'),
  domainId: text('domain_id').notNull().references(() => domains.id),
  requesterId: text('requester_id').notNull().references(() => users.id),
  approverId: text('approver_id').references(() => users.id),
  metadata: text('metadata', { mode: 'json' }).notNull(),
  decidedAt: integer('decided_at'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  domainStatusIdx: index('approvals_domain_status_idx').on(table.domainId, table.status),
  approverStatusIdx: index('approvals_approver_status_idx').on(table.approverId, table.status)
}));

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  domainTimeIdx: index('notes_domain_time_idx').on(table.domainId, table.createdAt)
}));

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { 
    enum: [
      'DOMAIN_EXPIRY', 'DOMAIN_CHECK_FAILED', 'SSL_EXPIRY', 'DNS_CHANGE',
      'REGISTRAR_LOCK_CHANGE', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED',
      'APPROVAL_REJECTED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED',
      'MENTION', 'SYNC_CONFLICT', 'SYNC_COMPLETED', 'SYNC_FAILED',
      'WHOIS_CHANGE', 'REGISTRAR_LOCK_CHANGE', 'DNS_MISMATCH', 'CUSTOM'
    ]
  }).notNull(),
  severity: text('severity', { enum: ['INFO', 'WARNING', 'CRITICAL'] }).default('INFO'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  actionUrl: text('action_url'),
  read: integer('read', { mode: 'boolean' }).default(false),
  data: text('data', { mode: 'json' }).default('{}'),
  vectorClock: text('vector_clock', { mode: 'json' }).default('{}'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  userIdx: index('notifications_user_idx').on(table.userId),
  userReadIdx: index('notifications_user_read_idx').on(table.userId, table.read),
}));

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').default('UTC'),
  dateFormat: text('date_format').default('MM/DD/YYYY'),
  theme: text('theme').default('dark'),
  language: text('language').default('en'),
  notificationPreferences: text('notification_preferences', { mode: 'json' }).default('{}'),
  syncPreferences: text('sync_preferences', { mode: 'json' }).default('{}'),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
});

export const pendingOperations = sqliteTable('pending_operations', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation', { enum: ['CREATE', 'UPDATE', 'DELETE'] }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  vectorClock: text('vector_clock', { mode: 'json' }).notNull(),
  retryCount: integer('retry_count').default(0),
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  lastAttemptAt: integer('last_attempt_at')
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`)
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type DomainCheck = typeof domainChecks.$inferSelect;
export type NewDomainCheck = typeof domainChecks.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type NewChatRoom = typeof chatRooms.$inferInsert;
export type ChatRoomMember = typeof chatRoomMembers.$inferSelect;
export type NewChatRoomMember = typeof chatRoomMembers.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type PendingOperation = typeof pendingOperations.$inferSelect;
export type NewPendingOperation = typeof pendingOperations.$inferInsert;
export type Settings = typeof settings.$inferSelect;