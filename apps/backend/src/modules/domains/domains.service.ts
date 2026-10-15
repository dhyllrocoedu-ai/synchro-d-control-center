import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DomainsService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async create(data: any) {
    const { data: domain, error } = await this.supabase
      .from('domains')
      .insert({
        ...data,
        nameservers: data.nameservers || [],
        price_per_year: data.pricePerYear || 0,
        currency: data.currency || 'USD',
        check_interval: data.checkInterval || 3600
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return domain;
  }

  async findAll(filters?: any) {
    let query = this.supabase
      .from('domains')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    // "all" is sent by the UI as a sentinel; it must not reach the enum column.
    const status = filters?.status && filters.status !== 'all' ? filters.status : undefined;
    const type = filters?.type && filters.type !== 'all' ? filters.type : undefined;

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    if (filters?.assigneeId) query = query.eq('assignee_id', filters.assigneeId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('domains')
      .select(`
        *,
        checks:domain_checks(*),
        tasks(*),
        approvals(*),
        notes(*),
        chat_room:chat_rooms(*),
        assignee:users(id, name, email, avatar_url),
        subscription(*)
      `)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Domain not found');
    return data;
  }

  async update(id: string, data: any) {
    const { data: domain, error } = await this.supabase
      .from('domains')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return domain;
  }

  async delete(id: string) {
    const { error } = await this.supabase
      .from('domains')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async getExpiring(days: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    
    const { data, error } = await this.supabase
      .from('domains')
      .select('*')
      .is('deleted_at', null)
      .gte('expiry_date', new Date().toISOString())
      .lte('expiry_date', cutoff.toISOString())
      .order('expiry_date', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }

  async getStats() {
    const [total, expiring, expired, monitoring] = await Promise.all([
      this.supabase.from('domains').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      this.supabase.from('domains').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('expiry_date', new Date().toISOString()).lte('expiry_date', new Date(Date.now() + 30 * 86400000).toISOString()),
      this.supabase.from('domains').select('id', { count: 'exact', head: true }).is('deleted_at', null).lt('expiry_date', new Date().toISOString()),
      this.supabase.from('domains').select('id', { count: 'exact', head: true }).eq('monitoring_enabled', true).is('deleted_at', null)
    ]);

    return { 
      total: total.count || 0, 
      expiringSoon: expiring.count || 0, 
      expired: expired.count || 0, 
      monitoring: monitoring.count || 0 
    };
  }
}