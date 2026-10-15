import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface ChatChangeEvent {
  entityType: string;
  roomId?: string;
  actorId?: string;
  preview?: string;
  senderName?: string;
}

@Injectable()
export class ChatRealtimeService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emitChange(event: ChatChangeEvent): void {
    this.emitter.emit('changed', event);
  }

  onChange(listener: (event: ChatChangeEvent) => void): () => void {
    this.emitter.on('changed', listener);
    return () => this.emitter.off('changed', listener);
  }
}
