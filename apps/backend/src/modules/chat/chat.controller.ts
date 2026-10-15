import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Delete, Put, Patch } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('rooms')
  async getRooms(@Req() req: any) {
    return this.chatService.getRooms(req.user.sub);
  }

  @Patch('rooms/:roomId')
  async updateRoom(@Param('roomId') roomId: string, @Req() req: any, @Body() data: { name?: string; description?: string }) {
    return this.chatService.updateRoom(roomId, req.user.sub, data);
  }

  @Get('rooms/:roomId/messages')
  async getMessages(@Param('roomId') roomId: string, @Req() req: any, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.chatService.getMessages(
      roomId,
      req.user.sub,
      parseInt(limit || '50'),
      before ? new Date(before) : undefined,
    );
  }

  @Delete('rooms/:roomId/messages/:messageId')
  async deleteMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Req() req: any,
    @Query('scope') scope?: string,
  ) {
    return this.chatService.deleteMessage(roomId, req.user.sub, messageId, scope === 'everyone' ? 'everyone' : 'me');
  }

  @Delete('rooms/:roomId')
  async deleteConversation(@Param('roomId') roomId: string, @Req() req: any) {
    return this.chatService.deleteConversation(roomId, req.user.sub);
  }

  @Post('rooms/:roomId/messages')
  async sendMessage(@Param('roomId') roomId: string, @Req() req: any, @Body() data: { content: string; type?: string; metadata?: any; replyToId?: string }) {
    return this.chatService.sendMessage(roomId, req.user.sub, data);
  }

  @Post('rooms/:roomId/read')
  async markAsRead(@Param('roomId') roomId: string, @Req() req: any, @Body() data: { messageId: string }) {
    return this.chatService.markAsRead(req.user.sub, roomId, data.messageId);
  }

  @Post('rooms')
  async createRoom(@Req() req: any, @Body() data: { name?: string; type: string; domainId?: string }) {
    return this.chatService.createRoom(req.user.sub, data);
  }

  @Get('rooms/:roomId/members')
  async getRoomMembers(@Param('roomId') roomId: string, @Req() req: any) {
    return this.chatService.getRoomMembers(roomId, req.user.sub);
  }

  @Post('rooms/:roomId/members')
  async addMember(@Param('roomId') roomId: string, @Req() req: any, @Body() data: { userId: string; role?: 'ADMIN' | 'MEMBER' }) {
    return this.chatService.addMember(roomId, req.user.sub, data.userId, data.role || 'MEMBER');
  }

  @Delete('rooms/:roomId/members/:userId')
  async removeMember(@Param('roomId') roomId: string, @Param('userId') userId: string, @Req() req: any) {
    return this.chatService.removeMember(roomId, req.user.sub, userId);
  }

  @Put('rooms/:roomId/members/:userId/role')
  async updateMemberRole(@Param('roomId') roomId: string, @Param('userId') userId: string, @Req() req: any, @Body() data: { role: 'ADMIN' | 'MEMBER' }) {
    return this.chatService.updateMemberRole(roomId, req.user.sub, userId, data.role);
  }

  @Post('rooms/:roomId/leave')
  async leaveRoom(@Param('roomId') roomId: string, @Req() req: any) {
    return this.chatService.leaveRoom(roomId, req.user.sub);
  }

  @Post('rooms/direct')
  async createOrGetDirectMessage(@Req() req: any, @Body() data: { targetUserId: string }) {
    return this.chatService.createOrGetDirectMessage(req.user.sub, data.targetUserId);
  }

  @Post('rooms/:roomId/invite-code')
  async generateInviteCode(@Param('roomId') roomId: string, @Req() req: any) {
    return this.chatService.generateInviteCodeForRoom(roomId, req.user.sub);
  }

  @Post('rooms/join-by-code')
  async joinByInviteCode(@Req() req: any, @Body() data: { inviteCode: string }) {
    return this.chatService.joinByInviteCode(data.inviteCode, req.user.sub);
  }
}