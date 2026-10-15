import { Injectable, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';
import { encryptContent } from '../../common/message-crypto';

@Injectable()
export class MigrationService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async importFromSupabase(data: {
    users: any[];
    domains: any[];
    domainChecks: any[];
    subscriptions: any[];
    chatRooms: any[];
    chatRoomMembers: any[];
    messages: any[];
    tasks: any[];
    approvals: any[];
    notes: any[];
  }) {
    const results = {
      users: 0,
      domains: 0,
      domainChecks: 0,
      subscriptions: 0,
      chatRooms: 0,
      chatRoomMembers: 0,
      messages: 0,
      tasks: 0,
      approvals: 0,
      notes: 0
    };

    for (const user of data.users) {
      const { error } = await this.supabase
        .from('users')
        .upsert(user, { onConflict: 'id' });
      if (!error) results.users++;
    }

    for (const domain of data.domains) {
      const { error } = await this.supabase
        .from('domains')
        .upsert(domain, { onConflict: 'id' });
      if (!error) results.domains++;
    }

    for (const check of data.domainChecks) {
      const { error } = await this.supabase
        .from('domain_checks')
        .upsert(check, { onConflict: 'id' });
      if (!error) results.domainChecks++;
    }

    for (const sub of data.subscriptions) {
      const { error } = await this.supabase
        .from('subscriptions')
        .upsert(sub, { onConflict: 'id' });
      if (!error) results.subscriptions++;
    }

    for (const room of data.chatRooms) {
      const { error } = await this.supabase
        .from('chat_rooms')
        .upsert(room, { onConflict: 'id' });
      if (!error) results.chatRooms++;
    }

    for (const member of data.chatRoomMembers) {
      const { error } = await this.supabase
        .from('chat_room_members')
        .upsert(member, { onConflict: 'user_id,room_id' });
      if (!error) results.chatRoomMembers++;
    }

    for (const message of data.messages) {
      const { error } = await this.supabase
        .from('messages')
        .upsert(
          message && typeof message.content === 'string'
            ? { ...message, content: encryptContent(message.content) }
            : message,
          { onConflict: 'id' },
        );
      if (!error) results.messages++;
    }

    for (const task of data.tasks) {
      const { error } = await this.supabase
        .from('tasks')
        .upsert(task, { onConflict: 'id' });
      if (!error) results.tasks++;
    }

    for (const approval of data.approvals) {
      const { error } = await this.supabase
        .from('approvals')
        .upsert(approval, { onConflict: 'id' });
      if (!error) results.approvals++;
    }

    for (const note of data.notes) {
      const { error } = await this.supabase
        .from('notes')
        .upsert(note, { onConflict: 'id' });
      if (!error) results.notes++;
    }

    return results;
  }
}