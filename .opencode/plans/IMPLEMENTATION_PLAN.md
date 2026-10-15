
# Synch.cc - Desktop Domain Management SaaS
## Implementation Plan for 5-Person Team (Windows-First, Electron + React)

---

## 1. Project Overview

**Product**: Cross-platform desktop app for teams to monitor/manage client domains with real-time collaboration, local-first architecture, and background monitoring.

**Target**: Windows 10/11 (primary), macOS 12+ (secondary)

**Team**: 5 developers

**Architecture**: Electron + React + TypeScript (Renderer) | Node.js (Main) | SQLite (Local) | NestJS + PostgreSQL (Backend/Sync)


---

## 2. Tech Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Desktop Framework | Electron 28+ | Mature, Windows-first, large ecosystem, team familiarity |
| Frontend | React 18 + TypeScript + Vite | Fast HMR, modern React patterns |
| UI Library | shadcn/ui (Radix + Tailwind) | Accessible, customizable, desktop-appropriate density |
| State Management | TanStack Query + Zustand | Server state + local UI state separation |
| Local Database | SQLite (better-sqlite3) + Drizzle ORM | Fast, embedded, TypeScript types, easy migrations |
| Backend | NestJS + PostgreSQL + Prisma | Team knows TS, excellent DX, Prisma types match frontend |
| Sync Protocol | Custom vector clocks + CRDT-inspired | Full history sync, conflict resolution control |
| Background Jobs | node-cron in main process | No separate worker process needed |
| Notifications | electron-windows-notifications (Win) / native (Mac) | Native toast support |
| Auto-updates | electron-updater + GitHub Releases | Free, reliable, code signing compatible |
| Code Signing | Windows: EV Cert + SignTool | Windows Store / SmartScreen requirements |
| CI/CD | GitHub Actions | Free for public, matrix builds for Win/macOS |


---

## 3. Team Allocation & Work Streams (5 Developers)

### Stream A: Core Platform (2 devs)
- Electron setup, IPC, window management, security
- SQLite schema, migrations, repositories
- Settings, preferences, app lifecycle

### Stream B: Domain & Monitoring (1-2 devs)
- Domain CRUD, import/export, detail views
- Background check workers (WHOIS, DNS, SSL)
- Scheduler, system tray, notifications

### Stream C: Collaboration (1-2 devs)
- Chat system (rooms, messages, threading)
- Tasks (Kanban), approvals, notes, audit log
- Real-time UI updates via WebSocket

### Stream D: Sync & Backend (1-2 devs)
- Sync engine (vector clocks, conflict resolution)
- NestJS backend with sync endpoints
- Migration from Supabase, billing integration

### Stream E: Platform & Release (1 dev, rotating)
- CI/CD, code signing, installer testing
- Auto-updater, crash reporting (Sentry)
- Performance profiling, Windows/macOS parity

**Rotation**: Devs rotate through Stream E every 2 weeks to share release knowledge.

---

## 4. Implementation Phases

### Phase 0: Foundation (Week 1-2) - PARALLEL
| Task | Owner | Deliverable |
|------|-------|-------------|
| Repo setup + monorepo config | Stream A | pnpm workspace, shared types package |
| Electron + Vite + React scaffold | Stream A | Running app with HMR |
| TypeScript strict config, ESLint, Prettier | Stream A | Zero-warning build |
| Preload script + typed IPC bridge | Stream A | Secure main<->renderer communication |
| Basic window manager (save/restore bounds) | Stream A | Persistent window state |
| CI: lint, typecheck, unit test | Stream E | GitHub Actions workflow

### Phase 1: Local Data Layer (Week 2-4) - PARALLEL
| Task | Owner | Deliverable |
|------|-------|-------------|
| SQLite + Drizzle schema (all entities) | Stream A | db/schema.ts, migrations |
| Repository pattern (domains, users, orgs) | Stream A | Type-safe CRUD |
| Domain list virtualized table | Stream B | 10k+ rows @ 60fps |
| Domain detail view (tabs: Overview/DNS/SSL/WHOIS/Activity) | Stream B | Full domain UI |
| Add/edit domain modal + validation | Stream B | Zod schemas, React Hook Form |
| Bulk import (CSV/JSON) + progress | Stream B | Background import with cancel

### Phase 2: Background Monitoring (Week 3-5) - PARALLEL
| Task | Owner | Deliverable |
|------|-------|-------------|
| System tray + context menu | Stream B | Native tray icon, menu |
| Windows toast notifications | Stream B | Actionable alerts |
| WHOIS worker (rdap/whois) | Stream B | Registrar, expiry, status |
| DNS worker (dns.resolve) | Stream B | A, AAAA, CNAME, MX, NS, TXT |
| SSL worker (tls.check) | Stream B | Cert validity, chain, SANs |
| Configurable scheduler per domain | Stream B | Cron-like, jitter, pause/resume |
| Expiry alert engine (30/14/7/3/1 days) | Stream B | Daily scan, tray badges

### Phase 3: Collaboration Features (Week 4-7) - PARALLEL
| Task | Owner | Deliverable |
|------|-------|-------------|
| Chat rooms (domain, general, DM, group) | Stream C | Room list, unread counts |
| Message threading + reactions | Stream C | Slack-like UX |
| Slash commands (/assign, /task, /approve) | Stream C | Command palette |
| Task Kanban board (react-beautiful-dnd) | Stream C | Drag-drop, domain-linked |
| Approval workflows (request->notify->decide) | Stream C | Modal + email fallback |
| Notes + audit log (domain-scoped) | Stream C | Markdown, @mentions

### Phase 4: Sync Engine (Week 6-10) - SEQUENTIAL DEPENDENCY
| Task | Owner | Deliverable |
|------|-------|-------------|
| Vector clock implementation | Stream D | Causality tracking |
| Offline queue (pending_operations table) | Stream D | Persistent, retryable |
| Pull endpoint (server changes since clock) | Stream D | /api/sync/pull |
| Push endpoint (client operations) | Stream D | /api/sync/push |
| Conflict detection + resolution UI | Stream D | 3-way merge for critical |
| Sync status indicator (online/offline/syncing) | Stream A | Header badge, tooltip |
| Background sync scheduler (30s online) | Stream D | Exponential backoff

### Phase 5: Backend & Migration (Week 8-12) - PARALLEL WITH PHASE 4
| Task | Owner | Deliverable |
|------|-------|-------------|
| NestJS project + Prisma schema | Stream D | Matching local schema |
| Sync endpoints + entity change log | Stream D | Vector clock storage |
| Auth (JWT + refresh, org-scoped) | Stream D | Secure API |
| Supabase -> PostgreSQL migration script | Stream D | One-time + incremental |
| Stripe integration (per-domain pricing) | Stream D | Subscriptions, webhooks |
| Admin dashboard (orgs, users, billing) | Stream D | Separate web admin

### Phase 6: Polish & Platform (Week 11-15)
| Task | Owner | Deliverable |
|------|-------|-------------|
| Keyboard shortcuts (Cmd/Ctrl+K, Cmd+N, etc.) | Stream A | Global + local |
| Native menus (File, Edit, View, Window, Help) | Stream A | Platform conventions |
| Drag-drop (reorder domains, import files) | Stream A | Polished interactions |
| Code signing (Windows EV + macOS notarization) | Stream E | Trusted installers |
| Auto-updater + release pipeline | Stream E | GitHub Releases -> user |
| Sentry + performance monitoring | Stream E | Error tracking, vitals |
| Windows installer (NSIS) + portable | Stream E | Signed, verified |
| macOS DMG + notarization | Stream E | Gatekeeper pass

### Phase 7: Beta & Launch (Week 15-18)
| Task | Owner | Deliverable |
|------|-------|-------------|
| Internal dogfood (team uses daily) | All | Bug bash, feedback |
| Migration tool for early users | Stream D | Supabase import wizard |
| Documentation + onboarding flow | Stream A/C | In-app tour, help menu |
| Performance benchmarks (10k domains) | Stream B | <2s cold start, <100MB RAM |
| Public beta release | Stream E | Signed, auto-updating
