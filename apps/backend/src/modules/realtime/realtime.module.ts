import { Global, Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatRealtimeService } from './chat-realtime.service';

@Global()
@Module({
  providers: [ChatRealtimeService, ChatGateway],
  exports: [ChatRealtimeService, ChatGateway],
})
export class RealtimeModule {}
