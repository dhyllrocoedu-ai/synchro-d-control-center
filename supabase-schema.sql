-- ============================================================================
-- Synch.cc Supabase Database Schema (fresh install)
-- ============================================================================
-- Run the ENTIRE file in the Supabase SQL Editor as a single query.
-- Intended for a brand-new/empty project. It is safe to re-run: tables use
-- IF NOT EXISTS and triggers/policies are dropped before being recreated.
--
-- Single-workspace model: there are NO organizations. Everyone who signs up is
-- an equal member of one implicit workspace and shares the same data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Trigger function: keep updated_at current
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ----------------------------------------------------------------------------
-- Enumerated types
-- ----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE domain_type AS ENUM ('MANAGED', 'MONITORED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE domain_status AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'PENDING_TRANSFER', 'ERROR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE check_type AS ENUM ('WHOIS', 'DNS', 'SSL', 'EXPIRY', 'REGISTRAR_LOCK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE check_status AS ENUM ('OK', 'WARNING', 'CRITICAL', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE billing_cycle AS ENUM ('MONTHLY', 'YEARLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE room_type AS ENUM ('DOMAIN', 'GENERAL', 'DIRECT', 'GROUP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE member_role AS ENUM ('ADMIN', 'MEMBER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_type AS ENUM ('TEXT', 'SYSTEM', 'TASK_CREATED', 'APPROVAL_REQUESTED', 'DOMAIN_UPDATE', 'NOTE_ADDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE approval_type AS ENUM ('RENEWAL', 'TRANSFER', 'DNS_CHANGE', 'DELETE', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM (
    'DOMAIN_EXPIRY', 'DOMAIN_CHECK_FAILED', 'SSL_EXPIRY', 'DNS_CHANGE',
    'REGISTRAR_LOCK_CHANGE', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED',
    'APPROVAL_REJECTED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED',
    'MENTION', 'SYNC_CONFLICT', 'SYNC_COMPLETED', 'SYNC_FAILED',
    'WHOIS_CHANGE', 'DNS_MISMATCH', 'CUSTOM'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Users
-- ----------------------------------------------------------------------------
-- Credentials live in Supabase Auth (auth.users). public.users stores profile
-- data and its id matches auth.users.id.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    -- Retained for backwards compatibility; auth.users owns the password.
    password_hash TEXT,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role user_role DEFAULT 'MEMBER',
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Domains
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type domain_type DEFAULT 'MONITORED',
    status domain_status DEFAULT 'ACTIVE',
    registrar TEXT,
    registrar_domain_id TEXT UNIQUE,
    nameservers TEXT[] DEFAULT '{}',
    auth_code TEXT UNIQUE,
    expiry_date TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT TRUE,
    monitoring_enabled BOOLEAN DEFAULT TRUE,
    check_interval INTEGER DEFAULT 3600,
    price_per_year DECIMAL(10,2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    assignee_id UUID REFERENCES users(id),
    subscription_id UUID,
    chat_room_id UUID,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS domains_status_idx ON domains(status);
CREATE INDEX IF NOT EXISTS domains_expiry_idx ON domains(expiry_date);
CREATE INDEX IF NOT EXISTS domains_sync_idx ON domains(last_synced_at);

-- ----------------------------------------------------------------------------
-- Domain Checks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    type check_type NOT NULL,
    status check_status NOT NULL,
    data JSONB NOT NULL,
    previous_data JSONB,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    next_check_at TIMESTAMPTZ,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS checks_domain_type_time_idx ON domain_checks(domain_id, type, checked_at);

-- ----------------------------------------------------------------------------
-- Subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    status subscription_status DEFAULT 'ACTIVE',
    billing_cycle billing_cycle DEFAULT 'YEARLY',
    current_period_end TIMESTAMPTZ NOT NULL,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Chat Rooms
-- ----------------------------------------------------------------------------
-- dm_key is a deterministic, order-independent key for DIRECT rooms
-- (the two user ids sorted and joined with ':'). It guarantees a single
-- shared thread per pair across all devices.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    description TEXT,
    type room_type DEFAULT 'DOMAIN',
    domain_id UUID UNIQUE REFERENCES domains(id),
    invite_code TEXT UNIQUE,
    dm_key TEXT UNIQUE,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_rooms_invite_code_idx ON chat_rooms(invite_code);
CREATE INDEX IF NOT EXISTS chat_rooms_dm_key_idx ON chat_rooms(dm_key);

-- ----------------------------------------------------------------------------
-- Chat Room Members
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    role member_role DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, room_id)
);

CREATE INDEX IF NOT EXISTS chat_room_members_room_idx ON chat_room_members(room_id);

-- ----------------------------------------------------------------------------
-- Messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    type message_type DEFAULT 'TEXT',
    metadata JSONB,
    user_id UUID NOT NULL REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES messages(id),
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_room_time_idx ON messages(room_id, created_at);

-- ----------------------------------------------------------------------------
-- Message Deletions ("delete for me")
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_deletions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_deletions_user_idx ON message_deletions(user_id);

-- ----------------------------------------------------------------------------
-- Tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'TODO',
    priority priority DEFAULT 'MEDIUM',
    domain_id UUID REFERENCES domains(id),
    assignee_id UUID REFERENCES users(id),
    creator_id UUID NOT NULL REFERENCES users(id),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_domain_status_idx ON tasks(domain_id, status);
CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON tasks(assignee_id, status);

-- ----------------------------------------------------------------------------
-- Approvals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type approval_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status approval_status DEFAULT 'PENDING',
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id),
    approver_id UUID REFERENCES users(id),
    metadata JSONB NOT NULL,
    decided_at TIMESTAMPTZ,
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_domain_status_idx ON approvals(domain_id, status);
CREATE INDEX IF NOT EXISTS approvals_approver_status_idx ON approvals(approver_id, status);

-- ----------------------------------------------------------------------------
-- Notes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_domain_time_idx ON notes(domain_id, created_at);

-- ----------------------------------------------------------------------------
-- Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    severity notification_severity DEFAULT 'INFO',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    action_url TEXT,
    read BOOLEAN DEFAULT FALSE,
    data JSONB DEFAULT '{}',
    vector_clock JSONB DEFAULT '{}',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, read) WHERE read = FALSE;

-- ----------------------------------------------------------------------------
-- User Preferences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    timezone TEXT DEFAULT 'UTC',
    date_format TEXT DEFAULT 'MM/DD/YYYY',
    theme TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'en',
    notification_preferences JSONB DEFAULT '{
        "domain_expiry": true,
        "ssl_expiry": true,
        "dns_changes": false,
        "registrar_lock": true,
        "whois_changes": false,
        "task_assignments": true,
        "approval_requests": true,
        "mentions": true,
        "sync_conflicts": true,
        "weekly_digest": false
    }',
    sync_preferences JSONB DEFAULT '{
        "auto_sync": true,
        "sync_on_startup": true,
        "conflict_resolution": "prompt"
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Audit Logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    user_id UUID REFERENCES users(id),
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_time_idx ON audit_logs(user_id, created_at);

-- ----------------------------------------------------------------------------
-- Entity Changes (sync log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    vector_clock JSONB NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entity_changes_entity_idx ON entity_changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_changes_created_idx ON entity_changes(created_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_rooms_updated_at ON chat_rooms;
CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_room_members_updated_at ON chat_room_members;
CREATE TRIGGER update_chat_room_members_updated_at BEFORE UPDATE ON chat_room_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_message_deletions_updated_at ON message_deletions;
CREATE TRIGGER update_message_deletions_updated_at BEFORE UPDATE ON message_deletions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- The backend talks to Postgres with the service_role key, which bypasses RLS.
-- These policies cover direct client access. Since this is a single shared
-- workspace, authenticated users may read/write shared data; notifications and
-- preferences stay private to their owner.
-- ----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_changes ENABLE ROW LEVEL SECURITY;

-- Shared workspace: any signed-in user has full access to shared tables.
DROP POLICY IF EXISTS "Shared workspace access" ON users;
CREATE POLICY "Shared workspace access" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON domains;
CREATE POLICY "Shared workspace access" ON domains FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON domain_checks;
CREATE POLICY "Shared workspace access" ON domain_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON subscriptions;
CREATE POLICY "Shared workspace access" ON subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON chat_rooms;
CREATE POLICY "Shared workspace access" ON chat_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON chat_room_members;
CREATE POLICY "Shared workspace access" ON chat_room_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON messages;
CREATE POLICY "Shared workspace access" ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON message_deletions;
CREATE POLICY "Shared workspace access" ON message_deletions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON tasks;
CREATE POLICY "Shared workspace access" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON approvals;
CREATE POLICY "Shared workspace access" ON approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared workspace access" ON notes;
CREATE POLICY "Shared workspace access" ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Private to owner.
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
CREATE POLICY "Users can insert own notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Grants for the backend service role (bypasses RLS)
-- ----------------------------------------------------------------------------
GRANT ALL ON users, domains, domain_checks, subscriptions, chat_rooms,
    chat_room_members, messages, message_deletions, tasks, approvals, notes,
    notifications, user_preferences, audit_logs, entity_changes TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- Notes
-- ============================================================================
-- Credentials are managed by Supabase Auth (auth.users). The public.users table
-- stores profile data and its id matches auth.users.id.
-- ============================================================================
