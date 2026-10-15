import { io, Socket } from 'socket.io-client';
import log from 'electron-log';

const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:3001';

export interface RealtimeChangeEvent {
  entityType?: string;
  roomId?: string;
  actorId?: string;
  preview?: string;
  senderName?: string;
}

class RealtimeClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private onChange: ((event: RealtimeChangeEvent) => void) | null = null;
  private tokenRefresher: (() => Promise<boolean>) | null = null;
  private refreshing = false;
  private lastRefreshAttempt = 0;
  private readonly REFRESH_COOLDOWN_MS = 30000; // 30 seconds between refresh attempts

  init(onChange: (event: RealtimeChangeEvent) => void): void {
    this.onChange = onChange;
    if (this.token) this.connect();
  }

  setTokenRefresher(refresher: () => Promise<boolean>): void {
    this.tokenRefresher = refresher;
  }

  setToken(token: string | null): void {
    this.token = token || null;
    if (!this.token) {
      this.disconnect();
      return;
    }
    this.connect();
  }

  private connect(): void {
    if (!this.token) return;

    if (this.socket) {
      this.socket.auth = { token: this.token };
      if (!this.socket.connected) this.socket.connect();
      return;
    }

    this.socket = io(BACKEND_URL, {
      transports: ['websocket'],
      auth: { token: this.token },
    });

    this.socket.on('chat:changed', (event?: RealtimeChangeEvent) => {
      try {
        this.onChange?.(event || {});
      } catch (err) {
        log.error('Realtime change handler failed:', err);
      }
    });

    this.socket.on('connect_error', (err) => {
      const errMsg = err.message || String(err);
      log.warn('Realtime socket connection error:', errMsg);
      
      // Only attempt token refresh on auth-related errors (401, unauthorized)
      const isAuthError = errMsg.includes('401') || 
                          errMsg.includes('Unauthorized') || 
                          errMsg.includes('unauthorized') ||
                          errMsg.includes('token') ||
                          errMsg.includes('auth');
      
      if (isAuthError) {
        void this.refreshAndReconnect();
      } else {
        // For non-auth errors, just log and let socket.io handle reconnection
        // with its built-in exponential backoff
        log.debug('Non-auth connection error, socket.io will retry automatically');
      }
    });

    this.socket.on('disconnect', (reason) => {
      // The gateway calls socket.disconnect(true) when the token is rejected;
      // socket.io will not auto-reconnect in that case, so refresh and retry.
      if (reason === 'io server disconnect') {
        log.info('Server disconnected, attempting token refresh');
        void this.refreshAndReconnect();
      } else {
        log.debug('Socket disconnected:', reason);
      }
    });
  }

  private async refreshAndReconnect(): Promise<void> {
    if (!this.tokenRefresher || this.refreshing) return;
    
    const now = Date.now();
    if (now - this.lastRefreshAttempt < this.REFRESH_COOLDOWN_MS) {
      log.debug('Token refresh on cooldown, skipping');
      return;
    }
    this.lastRefreshAttempt = now;
    
    this.refreshing = true;
    try {
      // On success the refresher calls setToken(), which reconnects with a fresh token.
      await this.tokenRefresher();
    } catch (err) {
      log.warn('Realtime token refresh failed:', err);
    } finally {
      this.refreshing = false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();
