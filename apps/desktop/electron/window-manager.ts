import { BrowserWindow, screen, ipcMain, nativeImage, nativeTheme } from 'electron';
import { join } from 'path';
import { settingsRepo } from './database/repositories';
import log from 'electron-log';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private readonly windowStateKey = 'mainWindowBounds';

  constructor() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('window:minimize', () => this.mainWindow?.minimize());
    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });
    ipcMain.handle('window:close', () => this.mainWindow?.close());
    ipcMain.handle('window:is-maximized', () => this.mainWindow?.isMaximized() ?? false);
  }

  async createMainWindow(url: string): Promise<BrowserWindow> {
    const savedBounds = await this.getSavedBounds();

    this.mainWindow = new BrowserWindow({
      x: savedBounds?.x,
      y: savedBounds?.y,
      width: savedBounds?.width ?? 1400,
      height: savedBounds?.height ?? 900,
      minWidth: 1000,
      minHeight: 700,
      show: false,
      frame: false,
      backgroundColor: '#05080F',
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: !process.env.NODE_ENV?.includes('development'),
        nodeIntegration: false,
        webSecurity: !process.env.NODE_ENV?.includes('development')
      },
      icon: join(__dirname, '../resources/icon.png')
    });

    this.mainWindow.loadURL(url);

    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log.error('Window failed to load:', { errorCode, errorDescription, validatedURL });
    });

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      if (process.env.NODE_ENV?.includes('development')) {
        this.mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    });

    this.mainWindow.on('close', () => {
      this.saveBounds();
    });

    this.mainWindow.on('maximize', () => {
      this.mainWindow?.webContents.send('window:maximized-changed', true);
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow?.webContents.send('window:maximized-changed', false);
    });

    this.mainWindow.on('resize', () => {
      this.debouncedSaveBounds();
    });

    this.mainWindow.on('move', () => {
      this.debouncedSaveBounds();
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https:')) {
        require('electron').shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  focusMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.focus();
    }
  }

  private async getSavedBounds(): Promise<Electron.Rectangle | null> {
    try {
      const settings = await settingsRepo.get('windowBounds');
      return settings ?? null;
    } catch {
      return null;
    }
  }

  private saveBoundsDebounce: NodeJS.Timeout | null = null;
  
  private debouncedSaveBounds() {
    if (this.saveBoundsDebounce) clearTimeout(this.saveBoundsDebounce);
    this.saveBoundsDebounce = setTimeout(() => this.saveBounds(), 500);
  }

  private async saveBounds() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    const bounds = this.mainWindow.getBounds();
    await settingsRepo.set('windowBounds', bounds);
  }
}