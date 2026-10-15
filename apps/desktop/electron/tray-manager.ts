import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { domainCheckRepo, pendingOpsRepo } from './database/repositories';
import { getSchedulerInstance } from './background-workers/scheduler';
import { WindowManager } from './window-manager';
import log from 'electron-log';

export class TrayManager {
  private tray: Tray | null = null;
  private windowManager: WindowManager;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;
  }

  async initialize() {
    const icon = nativeImage.createFromPath(join(__dirname, '../resources/tray-icon.png'));
    icon.setTemplateImage(true);
    
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Synchro-D');
    
    await this.updateMenu();
    
    this.tray.on('double-click', () => {
      this.windowManager.focusMainWindow();
    });
    
    this.tray.on('right-click', () => {
      this.updateMenu().then(() => this.tray?.popUpContextMenu());
    });
    
    log.info('Tray initialized');
  }

  async updateMenu() {
    if (!this.tray) return;
    
    const alerts = await domainCheckRepo.getCriticalAlerts(5);
    const pendingSync = await pendingOpsRepo.getAll();
    
    const items: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Show Dashboard',
        click: () => this.windowManager.focusMainWindow()
      },
      {
        label: 'Quick Add Domain...',
        click: () => this.windowManager.getMainWindow()?.webContents.send('navigate', '/domains/new')
      },
      { type: 'separator' as const }
    ];
    
    if (alerts.length > 0) {
      alerts.forEach((alert: any) => {
        items.push({
          label: `${this.getAlertIcon(alert.severity)} ${alert.domainName} - ${alert.message}`,
          click: () => {
            this.windowManager.focusMainWindow();
            this.windowManager.getMainWindow()?.webContents.send('navigate', `/domains/${alert.domainId}`);
          }
        });
      });
      items.push({ type: 'separator' as const });
    }
    
    const scheduler = getSchedulerInstance();
    const isPaused = scheduler?.getIsPaused() ?? false;
    
    items.push({
      label: isPaused ? 'Resume Monitoring' : 'Pause Monitoring',
      click: () => {
        scheduler?.togglePause();
        this.updateMenu();
      }
    });
    
    items.push({
      label: 'Sync Now',
      click: () => {
        this.windowManager.getMainWindow()?.webContents.send('sync:trigger');
      }
    });
    
    if (pendingSync.length > 0) {
      items.push({
        label: `⚠ ${pendingSync.length} pending change${pendingSync.length > 1 ? 's' : ''}`,
        enabled: false
      });
    }
    
    items.push({ type: 'separator' as const });
    items.push({
      label: 'Settings...',
      click: () => {
        this.windowManager.focusMainWindow();
        this.windowManager.getMainWindow()?.webContents.send('navigate', '/settings');
      }
    });
    items.push({
      label: 'Quit',
      click: () => app.quit()
    });
    
    const menu = Menu.buildFromTemplate(items);
    this.tray.setContextMenu(menu);
  }

  private getAlertIcon(severity: string): string {
    switch (severity) {
      case 'CRITICAL': return '🔴';
      case 'WARNING': return '🟡';
      default: return '🔵';
    }
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}