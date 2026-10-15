#!/usr/bin/env node
// Setup script for Synch.cc
// Run with: pnpm setup

import { execSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  
  console.log(`🔍 Node.js version: ${version}`);
  
  if (major !== 20) {
    console.warn(`\n⚠️  WARNING: Synch.cc requires Node.js 20 LTS`);
    console.warn(`   Current version: ${version}`);
    console.warn(`   Native modules (better-sqlite3, bcrypt) may fail to compile on Node ${major}`);
    console.warn(`\n   To fix this:`);
    console.warn(`   1. Install nvm-windows: https://github.com/coreybutler/nvm-windows/releases`);
    console.warn(`   2. Run: nvm install 20 && nvm use 20`);
    console.warn(`   3. Or use: fnm install 20 && fnm use 20`);
    console.warn(`   4. Then restart your terminal and run setup again\n`);
    
    if (major > 20) {
      console.error(`❌ Node.js ${major} is not supported due to native module incompatibility`);
      console.error(`   Please switch to Node.js 20 LTS before continuing\n`);
      process.exit(1);
    }
  } else {
    console.log('✅ Node.js 20 LTS detected - compatible\n');
  }
}

console.log('🚀 Setting up Synch.cc...\n');

checkNodeVersion();

try {
  // 1. Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('pnpm install', { stdio: 'inherit' });
  
  // 2. Copy .env.example to .env if not exists
  console.log('\n📝 Setting up environment files...');
  
  const backendEnvExample = join(__dirname, 'apps/backend/.env.example');
  const backendEnv = join(__dirname, 'apps/backend/.env');
  if (existsSync(backendEnvExample) && !existsSync(backendEnv)) {
    copyFileSync(backendEnvExample, backendEnv);
    console.log('  ✅ Created apps/backend/.env from example');
  }
  
  const desktopEnvExample = join(__dirname, 'apps/desktop/.env.example');
  const desktopEnv = join(__dirname, 'apps/desktop/.env');
  if (existsSync(desktopEnvExample) && !existsSync(desktopEnv)) {
    copyFileSync(desktopEnvExample, desktopEnv);
    console.log('  ✅ Created apps/desktop/.env from example');
  }
  
  // 3. Build shared types
  console.log('\n🔨 Building shared types...');
  execSync('pnpm --filter @synch-cc/shared-types typecheck', { stdio: 'inherit' });
  
  console.log('\n✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Edit apps/backend/.env with your Supabase credentials');
  console.log('  2. Run the supabase-schema.sql in your Supabase SQL Editor');
  console.log('  3. Start development:');
  console.log('     pnpm dev:desktop   # Electron + Vite (terminal 1)');
  console.log('     pnpm dev:backend   # NestJS API (terminal 2)');
  console.log('\n  For Supabase migration:');
  console.log('     pnpm migrate:supabase --org-slug=acme --supabase-url=... --supabase-key=...');
  
} catch (error) {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
}