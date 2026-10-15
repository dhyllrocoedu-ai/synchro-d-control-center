import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join, resolve } from 'path';
import { WindowManager } from './window-manager';
import { TrayManager } from './tray-manager';
import { setupIpcHandlers } from './ipc-handlers';
import { initializeDatabase, closeDatabase } from './database';
import { settingsRepo, chatRepo } from './database/repositories';
import { BackgroundScheduler } from './background-workers/scheduler';
import { SyncEngine } from './sync-engine';
import { realtimeClient, RealtimeChangeEvent } from './realtime';
import { setupNotifications, showNewMessage } from './notifications';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.format = '{h}:{i}:{s} {text}';

// libSQL throws CLIENT_CLOSED when an in-flight query races with shutdown or a
// dev hot-reload. That is expected noise, not a real failure — swallow just that
// case so it no longer surfaces as an unhandled rejection.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes('CLIENT_CLOSED') || message.includes('The client is closed')) {
    log.debug('Ignored database-closed rejection:', message);
    return;
  }
  log.error('Unhandled rejection:', reason);
});

const isDev = !app.isPackaged;
const PROTOCOL = 'synchcc';

if (isDev && process.env.DISABLE_HW_ACCEL === '1') {
  app.disableHardwareAcceleration();
}

// Single instance lock is required for deep-link handling (second-instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function findDeepLinkArg(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:3001';
const HEALTH_ENDPOINT = `${BACKEND_URL}/api/health`;

const MAX_HEALTH_RETRIES = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

async function waitForBackend(): Promise<void> {
  let backoff = INITIAL_BACKOFF_MS;
  for (let attempt = 1; attempt <= MAX_HEALTH_RETRIES; attempt++) {
    try {
      const response = await fetch(HEALTH_ENDPOINT, { method: 'GET' });
      if (response.ok) {
        log.info('Backend is ready');
        return;
      }
      log.debug(`Backend health check failed (attempt ${attempt}): ${response.status}`);
    } catch (err) {
      log.debug(`Backend not reachable (attempt ${attempt}):`, err);
    }
    if (attempt < MAX_HEALTH_RETRIES) {
      log.info(`Waiting for backend... (attempt ${attempt}/${MAX_HEALTH_RETRIES})`);
      await new Promise(r => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
  throw new Error(`Backend did not become healthy after ${MAX_HEALTH_RETRIES} attempts`);
}

// Exchange the stored refresh token for a fresh access token. Used by the sync
// engine and realtime client when the server rejects the current token (401).
async function refreshAuthToken(syncEngine?: SyncEngine): Promise<boolean> {
  try {
    const refreshToken = await settingsRepo.get('refreshToken');
    if (!refreshToken) return false;

    const response = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
    if (!data?.accessToken) return false;

    await settingsRepo.set('accessToken', data.accessToken);
    if (data.refreshToken) await settingsRepo.set('refreshToken', data.refreshToken);

    syncEngine?.setAuthToken(data.accessToken);
    realtimeClient.setToken(data.accessToken);
    log.info('Refreshed access token');
    return true;
  } catch (err) {
    log.warn('Token refresh failed:', err);
    return false;
  }
}

class Application {
  private windowManager!: WindowManager;
  private trayManager!: TrayManager;
  private backgroundScheduler!: BackgroundScheduler;
  private syncEngine!: SyncEngine;
  private pendingDeepLink: string | null = null;

  async initialize() {
    this.setupAppEvents();
    this.setupAutoUpdater();

    await initializeDatabase();

    this.windowManager = new WindowManager();
    this.trayManager = new TrayManager(this.windowManager);
    this.backgroundScheduler = new BackgroundScheduler();
    this.syncEngine = new SyncEngine();

    // Wait for backend to be healthy before proceeding with sync/realtime
    await waitForBackend();

    setupIpcHandlers(this.windowManager, this.syncEngine, this.backgroundScheduler);
    setupNotifications();

    // Push a live refresh to every window whenever the server reports a change.
    // Fetch only the changed chat entities first so the UI updates almost
    // instantly, then run the full sync in the background without blocking.
    realtimeClient.init(async (event: RealtimeChangeEvent) => {
      try {
        await this.syncEngine.pullChat();
      } catch (err) {
        log.warn('Chat pull on realtime change failed:', err);
      }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('chat:updated', {});
      }
      void this.syncEngine.sync();

      try {
        await this.maybeNotifyNewMessage(event);
      } catch (err) {
        log.warn('New-message notification failed:', err);
      }
    });

    // Recover automatically when the stored access token has expired.
    this.syncEngine.setTokenRefresher(() => refreshAuthToken(this.syncEngine));
    realtimeClient.setTokenRefresher(() => refreshAuthToken(this.syncEngine));

    // Restore an existing session so sync can run after a restart
    const storedAccessToken = await settingsRepo.get('accessToken');
    if (storedAccessToken) {
      this.syncEngine.setAuthToken(storedAccessToken as string);
      realtimeClient.setToken(storedAccessToken as string);
    }

    const win = await this.windowManager.createMainWindow(
      isDev ? 'http://localhost:5173' : `file://${join(__dirname, '../dist/index.html')}`
    );

    win.webContents.on('did-finish-load', () => {
      if (this.pendingDeepLink) {
        win.webContents.send('auth:deep-link', this.pendingDeepLink);
        this.pendingDeepLink = null;
      }
    });

    // Handle a deep link that launched the app
    const launchDeepLink = findDeepLinkArg(process.argv);
    if (launchDeepLink) {
      this.handleDeepLink(launchDeepLink);
    }

    log.info('Application initialized');
  }

  private handleDeepLink(url: string) {
    log.info('Received deep link:', url);
    const win = this.windowManager?.getMainWindow?.();

    if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
      this.windowManager.focusMainWindow();
      win.webContents.send('auth:deep-link', url);
    } else {
      this.pendingDeepLink = url;
    }
  }

  // Show a desktop notification for an incoming message when the app is not
  // focused, the sender isn't the current user, and the user is a member of
  // the room. (The realtime feed is broadcast app-wide.)
  private async maybeNotifyNewMessage(event: RealtimeChangeEvent) {
    if (!event || event.entityType !== 'messages') return;
    if (!event.roomId || !event.actorId) return;

    const currentUser = await settingsRepo.get('currentUser');
    if (!currentUser || event.actorId === currentUser) return;

    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed() && focused.isFocused()) return;

    const members = await chatRepo.getRoomMembers(event.roomId).catch(() => []);
    if (!members.some((m: any) => m.userId === currentUser)) return;

    showNewMessage({
      senderName: event.senderName,
      preview: event.preview,
      roomId: event.roomId,
    });
  }

  private setupAppEvents() {
    Menu.setApplicationMenu(null);

    app.on('second-instance', (_event, argv) => {
      const deepLink = findDeepLinkArg(argv);
      if (deepLink) {
        this.handleDeepLink(deepLink);
      } else {
        this.windowManager?.focusMainWindow();
      }
    });

    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.windowManager.createMainWindow(
          isDev ? 'http://localhost:5173' : `file://${join(__dirname, '../dist/index.html')}`
        );
      }
    });

    app.on('before-quit', () => {
      this.backgroundScheduler?.stop();
      this.syncEngine?.stop();
      realtimeClient.disconnect();
      closeDatabase();
    });

    ipcMain.handle('app:get-version', () => app.getVersion());
    ipcMain.handle('app:quit', () => app.quit());
  }

  private setupAutoUpdater() {
    if (isDev) return;

    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
    });

    autoUpdater.on('error', (err) => {
      log.error('Auto-updater error:', err);
    });
  }
}

registerProtocol();

const application = new Application();

if (gotTheLock) {
  app.whenReady().then(() => application.initialize()).catch((err) => {
    log.error('Failed to initialize application:', err);
    app.quit();
  });
}
