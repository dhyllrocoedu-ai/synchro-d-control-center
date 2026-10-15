import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class TasksService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async create(creatorId: string, data: any) {
    const { data: task, error } = await this.supabase
      .from('tasks')
      .insert({ ...data, creator_id: creatorId })
      .select(`
        *,
        assignee:users(id, name, email),
        domain:domains(id, name)
      `)
      .single();

    if (error) throw new Error(error.message);
    return task;
  }

  async findAll(filters?: any) {
    let query = this.supabase
      .from('tasks')
      .select(`
        *,
        assignee:users!tasks_assignee_id_fkey(id, name, email),
        domain:domains(id, name)
      `)
      .order('updated_at', { ascending: false });

    if (filters?.domainId) query = query.eq('domain_id', filters.domainId);
    if (filters?.assigneeId) query = query.eq('assignee_id', filters.assigneeId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('tasks')
      .select(`
        *,
        assignee:users!tasks_assignee_id_fkey(id, name, email),
        domain:domains(id, name),
        creator:users!tasks_creator_id_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Task not found');
    return data;
  }

  async update(id: string, data: any) {
    const updateData: any = { ...data };
    if (data.status === 'DONE' && !data.completedAt) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: task, error } = await this.supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assignee:users!tasks_assignee_id_fkey(id, name, email)
      `)
      .single();

    if (error) throw new Error(error.message);
    return task;
  }

  async delete(id: string) {
    const { error } = await this.supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}