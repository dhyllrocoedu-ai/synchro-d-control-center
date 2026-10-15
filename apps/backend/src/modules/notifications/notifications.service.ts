import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '@/supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateNotificationDto, NotificationFiltersDto } from './dto/create-notification.dto';
import { MarkReadDto } from './dto/mark-read.dto';

@Injectable()
export class NotificationsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async create(dto: CreateNotificationDto & { userId: string }) {
    const { data, error } = await this.supabase
      .from('notifications')
      .insert({
        user_id: dto.userId,
        type: dto.type,
        severity: dto.severity || 'INFO',
        title: dto.title,
        message: dto.message,
        entity_type: dto.entityType,
        entity_id: dto.entityId,
        action_url: dto.actionUrl,
        data: dto.data || {},
        read: false,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create notification: ${error.message}`);
    }

    return data;
  }

  async createBulk(notifications: Array<CreateNotificationDto & { userId: string }>) {
    const { data, error } = await this.supabase
      .from('notifications')
      .insert(notifications.map(n => ({
        user_id: n.userId,
        type: n.type,
        severity: n.severity || 'INFO',
        title: n.title,
        message: n.message,
        entity_type: n.entityType,
        entity_id: n.entityId,
        action_url: n.actionUrl,
        data: n.data || {},
        read: false,
      })))
      .select();

    if (error) {
      throw new BadRequestException(`Failed to create notifications: ${error.message}`);
    }

    return data;
  }

  async findAll(filters: NotificationFiltersDto & { userId: string }) {
    let query = this.supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', filters.userId)
      .order('created_at', { ascending: false });

    if (filters.read !== undefined) {
      query = query.eq('read', filters.read);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch notifications: ${error.message}`);
    }

    return { data: data || [], total: count || 0 };
  }

  async findUnreadCount(userId: string) {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      throw new BadRequestException(`Failed to fetch unread count: ${error.message}`);
    }

    return count || 0;
  }

  async findById(id: string, userId: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Notification not found');
      }
      throw new BadRequestException(`Failed to fetch notification: ${error.message}`);
    }

    return data;
  }

  async markRead(id: string, userId: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Notification not found');
      }
      throw new BadRequestException(`Failed to mark notification as read: ${error.message}`);
    }

    return data;
  }

  async markAllRead(userId: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false)
      .select();

    if (error) {
      throw new BadRequestException(`Failed to mark all as read: ${error.message}`);
    }

    return data;
  }

  async delete(id: string, userId: string) {
    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(`Failed to delete notification: ${error.message}`);
    }

    return { success: true };
  }

  async deleteOld(days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new BadRequestException(`Failed to delete old notifications: ${error.message}`);
    }

    return { success: true };
  }
}