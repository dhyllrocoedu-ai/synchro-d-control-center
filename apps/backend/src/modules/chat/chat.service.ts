import { Injectable, NotFoundException, Inject, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChatRealtimeService } from '../realtime/chat-realtime.service';
import * as crypto from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { encryptContent, decryptContent } from '../../common/message-crypto';

const DM_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

@Injectable()
export class ChatService {
  constructor(
    @Inject(SUPABASE_CLIENT) private supabase: SupabaseClient,
    private realtime: ChatRealtimeService,
  ) {}

  async getRooms(userId: string) {
    const { data, error } = await this.supabase
      .from('chat_rooms')
      .select(`
        *,
        members:chat_room_members!inner(user_id, last_read_at, role),
        domain:domains(id, name),
        _count:messages(count)
      `)
      .eq('chat_room_members.user_id', userId)
      .is('chat_room_members.deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }

  async updateRoom(roomId: string, userId: string, data: { name?: string; description?: string }) {
    const { data: membership, error: memberError } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can update the room');
    }

    const update: Record<string, any> = {};
    if (typeof data.name === 'string') update.name = data.name;
    if (typeof data.description === 'string') update.description = data.description;

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const { data: room, error } = await this.supabase
      .from('chat_rooms')
      .update(update)
      .eq('id', roomId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    this.realtime.emitChange({ entityType: 'chat_rooms', roomId });
    return room;
  }

  async getMessages(roomId: string, userId?: string, limit = 50, before?: Date) {
    let query = this.supabase
      .from('messages')
      .select(`
        *,
        user:users(id, name, avatar_url),
        reply_to:messages!reply_to_id(id, content, user:users(name))
      `)
      .eq('room_id', roomId)
      .is('deleted_at', null)
      // Fetch the newest `limit` messages, then return them oldest-first for display.
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before.toISOString());
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let messages = data || [];
    if (userId && messages.length) {
      // Hide messages the user deleted "for me".
      const { data: deletions } = await this.supabase
        .from('message_deletions')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', messages.map(m => m.id));

      if (deletions?.length) {
        const hidden = new Set(deletions.map(d => d.message_id));
        messages = messages.filter(m => !hidden.has(m.id));
      }
    }

    messages = messages.map((m: any) => ({
      ...m,
      content: decryptContent(m.content),
      reply_to: m.reply_to
        ? { ...m.reply_to, content: decryptContent(m.reply_to.content) }
        : m.reply_to,
    }));

    return messages.reverse();
  }

  async deleteMessage(roomId: string, userId: string, messageId: string, scope: 'me' | 'everyone') {
    const { data: membership } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      throw new ForbiddenException('Not a member of this room');
    }

    const { data: message } = await this.supabase
      .from('messages')
      .select('id, user_id')
      .eq('id', messageId)
      .eq('room_id', roomId)
      .single();

    if (!message) throw new NotFoundException('Message not found');

    if (scope === 'everyone') {
      if (message.user_id !== userId) {
        throw new ForbiddenException('Only the sender can delete a message for everyone');
      }
      const { error } = await this.supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw new Error(error.message);
      this.realtime.emitChange({ entityType: 'messages', roomId });
      return { success: true };
    }

    const { error } = await this.supabase
      .from('message_deletions')
      .upsert(
        { message_id: messageId, user_id: userId },
        { onConflict: 'message_id,user_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    this.realtime.emitChange({ entityType: 'message_deletions', roomId });
    return { success: true };
  }

  async deleteConversation(roomId: string, userId: string) {
    const { error } = await this.supabase
      .from('chat_room_members')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    this.realtime.emitChange({ entityType: 'chat_room_members', roomId });
    return { success: true };
  }

  async sendMessage(roomId: string, userId: string, data: { content: string; type?: string; metadata?: any; replyToId?: string }) {
    const { data: message, error } = await this.supabase
      .from('messages')
      .insert({
        ...data,
        content: encryptContent(data.content),
        user_id: userId,
        room_id: roomId,
        type: data.type || 'TEXT'
      })
      .select(`
        *,
        user:users(id, name, avatar_url)
      `)
      .single();

    if (error) throw new Error(error.message);

    await this.supabase
      .from('chat_rooms')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', roomId);

    this.realtime.emitChange({
      entityType: 'messages',
      roomId,
      actorId: userId,
      senderName: (message as any)?.user?.name || undefined,
      preview: typeof data.content === 'string' ? data.content.slice(0, 140) : undefined,
    });

    return message ? { ...message, content: decryptContent(message.content) } : message;
  }

  async markAsRead(userId: string, roomId: string, messageId: string) {
    const { error } = await this.supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('room_id', roomId);

    if (error) throw new Error(error.message);
  }

  async createRoom(userId: string, data: { name?: string; type: string; domainId?: string }) {
    const { data: room, error } = await this.supabase
      .from('chat_rooms')
      .insert({
        ...data
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // The creator must be a member, otherwise the room is invisible to them.
    if (userId) {
      await this.supabase
        .from('chat_room_members')
        .insert({
          room_id: room.id,
          user_id: userId,
          role: 'ADMIN',
          joined_at: new Date().toISOString(),
        });
    }

    this.realtime.emitChange({ entityType: 'chat_rooms', roomId: room.id });
    return room;
  }

  async getRoomMembers(roomId: string, userId: string) {
    const { data: membership, error: memberError } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership) {
      throw new ForbiddenException('Not a member of this room');
    }

    const { data, error } = await this.supabase
      .from('chat_room_members')
      .select(`
        *,
        user:users(id, name, email, avatar_url)
      `)
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }

  async addMember(roomId: string, requesterId: string, targetUserId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const { data: requesterMembership } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', requesterId)
      .single();

    if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can add members');
    }

    const { data: room } = await this.supabase
      .from('chat_rooms')
      .select('type')
      .eq('id', roomId)
      .single();

    if (room?.type === 'DIRECT') {
      throw new ForbiddenException('Cannot add members to direct messages');
    }

    const { data, error } = await this.supabase
      .from('chat_room_members')
      .insert({
        room_id: roomId,
        user_id: targetUserId,
        role,
        joined_at: new Date().toISOString(),
      })
      .select(`
        *,
        user:users(id, name, email, avatar_url)
      `)
      .single();

    if (error) throw new Error(error.message);

    await this.supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: requesterId,
        content: encryptContent(`${data.user?.name || 'A user'} was added to the room`),
        type: 'SYSTEM',
        metadata: { action: 'member_added', targetUserId },
      });

    this.realtime.emitChange({ entityType: 'chat_room_members', roomId });
    return data;
  }

  async removeMember(roomId: string, requesterId: string, targetUserId: string) {
    const { data: requesterMembership } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', requesterId)
      .single();

    if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can remove members');
    }

    if (requesterId === targetUserId) {
      throw new ForbiddenException('Cannot remove yourself, use leave room instead');
    }

    const { data: targetMembership } = await this.supabase
      .from('chat_room_members')
      .select('user:users(name)')
      .eq('room_id', roomId)
      .eq('user_id', targetUserId)
      .single() as { data: { user: { name: string }[] | { name: string } } | null };

    const { error } = await this.supabase
      .from('chat_room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', targetUserId);

    if (error) throw new Error(error.message);

    const targetUserName = Array.isArray(targetMembership?.user) ? targetMembership.user[0]?.name : targetMembership?.user?.name;

    await this.supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: requesterId,
        content: encryptContent(`${targetUserName || 'A user'} was removed from the room`),
        type: 'SYSTEM',
        metadata: { action: 'member_removed', targetUserId },
      });

    this.realtime.emitChange({ entityType: 'chat_room_members', roomId });
    return { success: true };
  }

  async updateMemberRole(roomId: string, requesterId: string, targetUserId: string, role: 'ADMIN' | 'MEMBER') {
    const { data: requesterMembership } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', requesterId)
      .single();

    if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can change roles');
    }

    if (requesterId === targetUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const { data, error } = await this.supabase
      .from('chat_room_members')
      .update({ role })
      .eq('room_id', roomId)
      .eq('user_id', targetUserId)
      .select(`
        *,
        user:users(id, name, email, avatar_url)
      `)
      .single();

    if (error) throw new Error(error.message);

    await this.supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: requesterId,
        content: encryptContent(`${data.user?.name || 'A user'} is now a ${role.toLowerCase()}`),
        type: 'SYSTEM',
        metadata: { action: 'role_changed', targetUserId, newRole: role },
      });

    this.realtime.emitChange({ entityType: 'chat_room_members', roomId });
    return data;
  }

  async leaveRoom(roomId: string, userId: string) {
    const { data: room } = await this.supabase
      .from('chat_rooms')
      .select('type')
      .eq('id', roomId)
      .single();

    if (room?.type === 'DIRECT') {
      throw new ForbiddenException('Cannot leave direct messages');
    }

    const { data: membership } = await this.supabase
      .from('chat_room_members')
      .select('role, user:users(name)')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single() as { data: { role: string; user: { name: string }[] | { name: string } } | null };

    const { error } = await this.supabase
      .from('chat_room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);

    const memberUserName = Array.isArray(membership?.user) ? membership.user[0]?.name : membership?.user?.name;

    await this.supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        content: encryptContent(`${memberUserName || 'A user'} left the room`),
        type: 'SYSTEM',
        metadata: { action: 'member_left', targetUserId: userId },
      });

    this.realtime.emitChange({ entityType: 'chat_room_members', roomId });
    return { success: true };
  }

  private generateDeterministicRoomId(dmKey: string): string {
    return uuidv5(dmKey, DM_NAMESPACE);
  }

  async createOrGetDirectMessage(userId: string, targetUserId: string) {
    const dmKey = [userId, targetUserId].sort().join(':');
    const deterministicId = this.generateDeterministicRoomId(dmKey);

    const { data: existingRoom, error: findError } = await this.supabase
      .from('chat_rooms')
      .select('*')
      .eq('type', 'DIRECT')
      .eq('dm_key', dmKey)
      .maybeSingle();

    if (findError) throw new Error(findError.message);

    if (existingRoom) {
      // Re-open the conversation if the current user had previously deleted it.
      await this.supabase
        .from('chat_room_members')
        .update({ deleted_at: null })
        .eq('room_id', existingRoom.id)
        .eq('user_id', userId);

      this.realtime.emitChange({ entityType: 'chat_rooms', roomId: existingRoom.id });
      return existingRoom;
    }

    const { data: room, error } = await this.supabase
      .from('chat_rooms')
      .insert({
        id: deterministicId,
        type: 'DIRECT',
        dm_key: dmKey,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.supabase
      .from('chat_room_members')
      .insert([
        { room_id: room.id, user_id: userId, role: 'ADMIN', joined_at: new Date().toISOString() },
        { room_id: room.id, user_id: targetUserId, role: 'ADMIN', joined_at: new Date().toISOString() },
      ]);

    this.realtime.emitChange({ entityType: 'chat_rooms', roomId: room.id });
    return room;
  }

  generateInviteCode(): string {
    const bytes = crypto.randomBytes(4);
    return `GRP-${bytes.toString('hex').toUpperCase()}`;
  }

  async generateInviteCodeForRoom(roomId: string, userId: string) {
    // Check room exists and user is admin
    const { data: membership, error: memberError } = await this.supabase
      .from('chat_room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (memberError || !membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can generate invite codes');
    }

    // Check room is GROUP type
    const { data: room, error: roomError } = await this.supabase
      .from('chat_rooms')
      .select('type, invite_code')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      throw new NotFoundException('Room not found');
    }

    if (room.type !== 'GROUP') {
      throw new ForbiddenException('Invite codes can only be generated for GROUP rooms');
    }

    // If invite code already exists, return it (auto-generate on first click)
    if (room.invite_code) {
      return { inviteCode: room.invite_code };
    }

    // Generate new invite code
    const inviteCode = this.generateInviteCode();

    const { error: updateError } = await this.supabase
      .from('chat_rooms')
      .update({ invite_code: inviteCode, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (updateError) throw new Error(updateError.message);

    return { inviteCode };
  }

  async joinByInviteCode(inviteCode: string, userId: string) {
    // Find room by invite code
    const { data: room, error: roomError } = await this.supabase
      .from('chat_rooms')
      .select('id, type')
      .eq('invite_code', inviteCode)
      .single();

    if (roomError || !room) {
      throw new NotFoundException('Invalid invite code');
    }

    if (room.type !== 'GROUP') {
      throw new ForbiddenException('Invite codes only work for GROUP rooms');
    }

    // Check if user is already a member
    const { data: existingMember } = await this.supabase
      .from('chat_room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single();

    if (!existingMember) {
      // Add user as member
      const { error: memberError } = await this.supabase
        .from('chat_room_members')
        .insert({
          room_id: room.id,
          user_id: userId,
          role: 'MEMBER',
          joined_at: new Date().toISOString(),
        });

      if (memberError) throw new Error(memberError.message);

      // Add system message
      const { data: userData } = await this.supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();

      await this.supabase
        .from('messages')
        .insert({
          room_id: room.id,
          user_id: userId,
          content: encryptContent(`${userData?.name || 'A user'} joined via invite code`),
          type: 'SYSTEM',
          metadata: { action: 'joined_via_invite' },
        });
    }

    this.realtime.emitChange({ entityType: 'chat_room_members', roomId: room.id });
    // Return room with members
    return this.getRoomMembers(room.id, userId);
  }
}