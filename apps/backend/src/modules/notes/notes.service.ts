import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class NotesService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async list(domainId: string) {
    if (!domainId) throw new BadRequestException('domainId is required');

    const { data, error } = await this.supabase
      .from('notes')
      .select('*')
      .eq('domain_id', domainId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }

  async create(userId: string, domainId: string, content: string) {
    if (!domainId) throw new BadRequestException('domainId is required');
    if (!content || !content.trim()) throw new BadRequestException('content is required');

    const { data, error } = await this.supabase
      .from('notes')
      .insert({ domain_id: domainId, user_id: userId, content })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabase.from('notes').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }
}
