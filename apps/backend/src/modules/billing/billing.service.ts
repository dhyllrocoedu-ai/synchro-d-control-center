import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class BillingService {
  constructor(@Inject(SUPABASE_CLIENT) private supabase: SupabaseClient) {}

  async getSubscriptions() {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select(`
        *,
        domain:domains(id, name)
      `);

    if (error) throw new Error(error.message);
    return data || [];
  }

  async createSubscription(domainId: string, planId: string, data: { billingCycle: string; pricePerYear: number }) {
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const { data: subscription, error } = await this.supabase
      .from('subscriptions')
      .insert({
        domain_id: domainId,
        plan_id: planId,
        billing_cycle: data.billingCycle,
        current_period_end: periodEnd.toISOString(),
        price_per_year: data.pricePerYear
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return subscription;
  }

  async cancelSubscription(id: string) {
    const { error } = await this.supabase
      .from('subscriptions')
      .update({ status: 'CANCELED' })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async renewSubscription(id: string) {
    const { data: sub, error: findError } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !sub) throw new NotFoundException('Subscription not found');

    const periodEnd = new Date(sub.current_period_end);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ current_period_end: periodEnd.toISOString(), status: 'ACTIVE' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getInvoices() {
    return [];
  }
}