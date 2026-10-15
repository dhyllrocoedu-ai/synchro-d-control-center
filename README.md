# Synchro-D - Desktop Domain Management SaaS

A cross-platform desktop application for teams to monitor and manage client domains with real-time collaboration, local-first architecture, and background monitoring.

## Features

- **Domain Management**: Track managed and monitored domains with registrar info, expiry dates, pricing
- **Background Monitoring**: Automatic WHOIS, DNS, SSL, and expiry checks with configurable intervals
- **Team Collaboration**: Real-time chat, task management (Kanban), approval workflows, notes
- **Local-First Architecture**: Full offline support with SQLite, sync when online
- **System Tray Integration**: Background monitoring with native notifications
- **Supabase Migration**: One-time import tool for existing Supabase data

## Tech Stack

- **Desktop**: Electron 28 + React 18 + TypeScript + Vite
- **UI**: shadcn/ui (Radix + Tailwind CSS)
- **State**: TanStack Query + Zustand
- **Local DB**: SQLite (better-sqlite3) + Drizzle ORM
- **Backend**: NestJS + PostgreSQL + Prisma
- **Sync**: Custom vector clock protocol
- **CI/CD**: GitHub Actions with code signing

## Project Structure

```
synch-cc/
├── apps/
│   ├── desktop/          # Electron + React app
│   │   ├── electron/     # Main process
│   │   ├── src/          # Renderer (React)
│   │   └── tools/        # Migration scripts
│   └── backend/          # NestJS API
│       ├── src/
│       └── prisma/
├── packages/
│   ├── shared-types/     # Shared TypeScript types
│   ├── ui-components/    # Shared React components
│   └── eslint-config/    # Shared ESLint config
└── .github/workflows/    # CI/CD pipelines
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL (for backend)

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/backend/.env.example apps/backend/.env
cp apps/desktop/.env.example apps/desktop/.env

# Initialize databases
pnpm db:push          # Local SQLite (desktop)
pnpm --filter @synch-cc/backend db:push  # PostgreSQL (backend)

# Start development
pnpm dev:desktop      # Electron + Vite
pnpm dev:backend      # NestJS API
```

### Environment Variables

**Backend** (`apps/backend/.env`):
```
DATABASE_URL=postgresql://user:pass@localhost:5432/synch_cc
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
PORT=3001
```

**Desktop** (`apps/desktop/.env`):
```
VITE_API_URL=http://localhost:3001
```

## Development

### Available Commands

```bash
# Development
pnpm dev:desktop      # Start Electron + Vite dev server
pnpm dev:backend      # Start NestJS in watch mode

# Building
pnpm build:all        # Build all packages
pnpm --filter @synch-cc/desktop build
pnpm --filter @synch-cc/backend build

# Database
pnpm db:push          # Push schema to local SQLite
pnpm db:studio        # Open Drizzle Studio
pnpm --filter @synch-cc/backend db:studio  # Open Prisma Studio

# Testing
pnpm test             # Run unit tests
pnpm test:e2e         # Run E2E tests

# Migration
pnpm migrate:supabase --org-slug=acme --supabase-url=... --supabase-key=...
```

## Sync Protocol

The application uses a custom vector clock-based sync protocol:

1. Each desktop instance gets a unique `nodeId`
2. Entities carry `vectorClock: { [nodeId]: number }`
3. On sync: pull server changes → merge conflicts → push local changes
4. Conflict resolution: server wins for critical data, LWW + field merge for others

## Code Signing (Windows)

1. Purchase EV Certificate (~$300-500/yr)
2. Add to GitHub Secrets:
   - `EV_CERT_BASE64` - Base64 encoded .pfx file
   - `EV_CERT_PASSWORD` - Certificate password
3. Release workflow handles signing automatically

## Distribution

- **Windows**: NSIS installer + portable (.exe)
- **macOS**: DMG with notarization
- **Linux**: AppImage
- **Updates**: GitHub Releases via electron-updater

## License

Proprietary - All rights reserved