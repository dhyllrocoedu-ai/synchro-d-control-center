import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_CLIENT, SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { ChatRealtimeService, ChatChangeEvent } from './chat-realtime.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class ChatGateway {
  @WebSocketServer()
  server!: any;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(SUPABASE_ANON_CLIENT) private anon: any,
    @Inject(SUPABASE_CLIENT) private supabase: any,
    private realtime: ChatRealtimeService,
  ) {
    this.realtime.onChange((event) => this.broadcast(event));
  }

  async handleConnection(socket: any) {
    try {
      const token =
        (socket.handshake?.auth?.token as string | undefined) ||
        this.extractBearer(socket);

      if (!token) {
        socket.disconnect(true);
        return;
      }

      const { data, error } = await this.anon.auth.getUser(token);
      if (error || !data?.user) {
        socket.disconnect(true);
        return;
      }

      const { data: profile } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
        socket.disconnect(true);
        return;
      }

      socket.data.userId = profile.id;
      socket.join(`user:${profile.id}`);
    } catch (err) {
      this.logger.warn(`Socket connection failed: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect() {
    /* no-op */
  }

  private extractBearer(socket: any): string | undefined {
    const header: string | undefined = socket.handshake?.headers?.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
    return undefined;
  }

  private broadcast(event: ChatChangeEvent) {
    if (!this.server) return;
    this.server.emit('chat:changed', event);
  }
}
