import { Notification, app } from 'electron';
import { join } from 'path';
import log from 'electron-log';

let isWindows = process.platform === 'win32';

export function setupNotifications() {
  if (isWindows) {
    try {
      require('electron-windows-notifications');
      log.info('Windows notifications enabled');
    } catch {
      log.warn('electron-windows-notifications not available, using fallback');
    }
  }
}

export function showNotification(options: {
  title: string;
  body: string;
  icon?: string;
  urgency?: 'normal' | 'critical' | 'low';
  actions?: Array<{ type: 'button'; text: string }>;
  onClick?: () => void;
  onAction?: (actionIndex: number) => void;
}) {
  const iconPath = options.icon || join(__dirname, '../resources/icon.png');
  
  const notification = new Notification({
    title: options.title,
    body: options.body,
    icon: iconPath,
    urgency: options.urgency || 'normal',
    actions: options.actions,
    silent: false
  });
  
  if (options.onClick) {
    notification.on('click', options.onClick);
  }
  
  if (options.onAction && options.actions) {
    notification.on('action', (_, index) => {
      options.onAction?.(Number(index));
    });
  }
  
  notification.on('close', () => {
    log.debug('Notification closed');
  });
  
  notification.on('failed', (_, error) => {
    log.error('Notification failed:', error);
  });
  
  notification.show();
  
  return notification;
}

export function showDomainAlert(domain: { name: string; id: string }, alert: { message: string; severity: string }) {
  const urgency = alert.severity === 'CRITICAL' ? 'critical' : 'normal';
  
  return showNotification({
    title: `Synchro-D: ${domain.name}`,
    body: alert.message,
    urgency,
    actions: [
      { type: 'button', text: 'View Domain' },
      { type: 'button', text: 'Snooze 1h' }
    ],
    onClick: () => {
      const win = require('electron').BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send('navigate', `/domains/${domain.id}`);
      }
    },
    onAction: (index) => {
      if (index === 0) {
        const win = require('electron').BrowserWindow.getAllWindows()[0];
        if (win) {
          if (win.isMinimized()) win.restore();
          win.focus();
          win.webContents.send('navigate', `/domains/${domain.id}`);
        }
      } else if (index === 1) {
        log.info('Snooze alert for 1 hour - not implemented yet');
      }
    }
  });
}

export function showSyncStatus(isOnline: boolean, pendingCount: number) {
  if (!isOnline) {
    showNotification({
      title: 'Synchro-D: Offline',
      body: `You're offline. ${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending sync.`,
      urgency: 'normal'
    });
  } else if (pendingCount > 0) {
    showNotification({
      title: 'Synchro-D: Syncing',
      body: `${pendingCount} change${pendingCount !== 1 ? 's' : ''} synced successfully.`,
      urgency: 'low'
    });
  }
}

export function showNewMessage(message: {
  senderName?: string;
  preview?: string;
  roomId: string;
}) {
  const sender = message.senderName?.trim() || 'New message';
  const body = (message.preview?.trim() || 'Sent you a message').slice(0, 160);

  return showNotification({
    title: sender,
    body,
    urgency: 'normal',
    onClick: () => {
      const win = require('electron').BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send('navigate', '/chat');
      }
    },
  });
}

export function showTaskAssigned(task: { title: string; domainName?: string }) {
  showNotification({
    title: 'New Task Assigned',
    body: `${task.title}${task.domainName ? ` (${task.domainName})` : ''}`,
    urgency: 'normal',
    actions: [{ type: 'button', text: 'View Task' }],
    onClick: () => {
      const win = require('electron').BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send('navigate', '/tasks');
      }
    }
  });
}

export function showApprovalRequested(approval: { title: string; domainName: string }) {
  showNotification({
    title: 'Approval Requested',
    body: `${approval.title} for ${approval.domainName}`,
    urgency: 'normal',
    actions: [{ type: 'button', text: 'Review' }, { type: 'button', text: 'Later' }],
    onClick: () => {
      const win = require('electron').BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send('navigate', '/approvals');
      }
    },
    onAction: (index) => {
      if (index === 0) {
        const win = require('electron').BrowserWindow.getAllWindows()[0];
        if (win) {
          if (win.isMinimized()) win.restore();
          win.focus();
          win.webContents.send('navigate', '/approvals');
        }
      }
    }
  });
}