import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface SyncPullRequest {
  since: Record<string, number>;
  entityTypes: string[];
  limit?: number;
}

interface SyncPushRequest {
  operations: Array<{
    id: string;
    entityType: string;
    entityId: string;
    operation: 'CREATE' | 'UPDATE' | 'DELETE';
    payload: any;
    vectorClock: Record<string, number>;
  }>;
  clientClock: Record<string, number>;
}

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('pull')
  async pull(@Body() data: SyncPullRequest, @Req() req: any) {
    return this.syncService.pull(data, req.user?.sub);
  }

  @Post('push')
  async push(@Body() data: SyncPushRequest, @Req() req: any) {
    return this.syncService.push(data);
  }

  @Get('status')
  async status(@Req() req: any) {
    const since = req.query.since as string;
    const sinceClock = since ? JSON.parse(since) : {};
    const serverClock = await this.syncService['getServerVectorClock']();
    
    const hasChanges = Object.keys(serverClock).some(
      key => (serverClock[key] || 0) > (sinceClock[key] || 0)
    );

    return {
      hasChanges,
      serverClock,
      entityTypes: ['domains', 'tasks', 'messages', 'approvals', 'notes', 'chat_rooms', 'chat_room_members', 'users', 'notifications', 'user_preferences']
    };
  }
}