import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ApprovalsService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async create(requesterId: string, data: any) {
    const { data: approval, error } = await this.supabase
      .from('approvals')
      .insert({ ...data, requester_id: requesterId })
      .select(`
        *,
        domain:domains(id, name),
        requester:users!approvals_requester_id_fkey(id, name)
      `)
      .single();

    if (error) throw new Error(error.message);
    return approval;
  }

  async findAll(filters?: any) {
    let query = this.supabase
      .from('approvals')
      .select(`
        *,
        domain:domains(id, name),
        requester:users!approvals_requester_id_fkey(id, name),
        approver:users!approvals_approver_id_fkey(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.domainId) query = query.eq('domain_id', filters.domainId);
    if (filters?.approverId) query = query.eq('approver_id', filters.approverId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('approvals')
      .select(`
        *,
        domain:domains(id, name),
        requester:users!approvals_requester_id_fkey(id, name),
        approver:users!approvals_approver_id_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Approval not found');
    return data;
  }

  async approve(id: string, approverId: string, comment?: string) {
    const approval = await this.findById(id);
    if (approval.status !== 'PENDING') {
      throw new ForbiddenException('Approval already decided');
    }
    if (approval.approver_id && approval.approver_id !== approverId) {
      throw new ForbiddenException('Not authorized to approve');
    }

    const { data, error } = await this.supabase
      .from('approvals')
      .update({
        status: 'APPROVED',
        approver_id: approverId,
        decided_at: new Date().toISOString(),
        metadata: { ...(approval.metadata || {}), approvalComment: comment }
      })
      .eq('id', id)
      .select(`
        *,
        domain:domains(*)
      `)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async reject(id: string, approverId: string, comment?: string) {
    const approval = await this.findById(id);
    if (approval.status !== 'PENDING') {
      throw new ForbiddenException('Approval already decided');
    }
    if (approval.approver_id && approval.approver_id !== approverId) {
      throw new ForbiddenException('Not authorized to reject');
    }

    const { data, error } = await this.supabase
      .from('approvals')
      .update({
        status: 'REJECTED',
        approver_id: approverId,
        decided_at: new Date().toISOString(),
        metadata: { ...(approval.metadata || {}), rejectionComment: comment }
      })
      .eq('id', id)
      .select(`
        *,
        domain:domains(*)
      `)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}