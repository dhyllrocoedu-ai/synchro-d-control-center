import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT, SUPABASE_ANON_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private supabase: SupabaseClient,
    @Inject(SUPABASE_ANON_CLIENT) private anon: SupabaseClient
  ) {}

  async create(data: {
    id?: string;
    email: string;
    password?: string;
    name: string;
    role?: string;
  }) {
    const { data: existing } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', data.email)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    let authUserId = data.id;

    if (!authUserId) {
      if (!data.password) {
        throw new BadRequestException('Password is required to create a user');
      }

      const { data: created, error: createError } = await this.supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        throw new ConflictException(createError?.message || 'Failed to create auth user');
      }

      authUserId = created.user.id;
    }

    const { data: user, error } = await this.supabase
      .from('users')
      .insert({
        id: authUserId,
        email: data.email,
        name: data.name,
        role: data.role || 'MEMBER',
      })
      .select('id, email, name, role, created_at')
      .single();

    if (error) {
      // Roll back the auth user if we created one in this call
      if (!data.id) {
        await this.supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      }
      throw new Error(error.message);
    }

    return this.mapUser(user);
  }

  async findByEmail(email: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at')
      .eq('email', email)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapUser(data);
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('User not found');
    return this.mapUser(data);
  }

  async findAll() {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapUser);
  }

  async update(id: string, data: { name?: string; avatarUrl?: string; role?: string }) {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.avatarUrl) updateData.avatar_url = data.avatarUrl;
    if (data.role) updateData.role = data.role;

    const { data: user, error } = await this.supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, role, avatar_url')
      .single();

    if (error) throw new Error(error.message);
    return this.mapUser(user);
  }

  async delete(id: string) {
    const { error } = await this.supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    // Best-effort removal of the backing Supabase Auth account
    await this.supabase.auth.admin.deleteUser(id).catch(() => undefined);
  }

  private mapUser(data: any) {
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      avatarUrl: data.avatar_url,
      createdAt: data.created_at,
    };
  }

  private async verifyPassword(email: string, password: string): Promise<boolean> {
    const { error } = await this.anon.auth.signInWithPassword({ email, password });
    return !error;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.findById(userId);

    const isValid = await this.verifyPassword(user.email, currentPassword);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const { error } = await this.supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) throw new Error(error.message);

    return { success: true };
  }

  async generate2FASecret(userId: string) {
    const secret = speakeasy.generateSecret({
      name: `Synchro-D (${userId})`,
      length: 32
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Store secret temporarily in user_preferences (valid for 10 minutes)
    await this.supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        sync_preferences: {
          temp_2fa_secret: secret.base32,
          temp_2fa_expires: Date.now() + 600000 // 10 minutes
        }
      });

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      otpauthUrl: secret.otpauth_url
    };
  }

  async confirm2FA(userId: string, token: string): Promise<{ verified: boolean; backupCodes?: string[] }> {
    const { data: prefs, error } = await this.supabase
      .from('user_preferences')
      .select('sync_preferences')
      .eq('user_id', userId)
      .single();

    if (error || !prefs?.sync_preferences?.temp_2fa_secret) {
      throw new BadRequestException('No pending 2FA setup found. Please generate a new secret.');
    }

    const tempSecret = prefs.sync_preferences.temp_2fa_secret;
    const expires = prefs.sync_preferences.temp_2fa_expires;

    if (Date.now() > expires) {
      await this.clearTemp2FA(userId);
      throw new BadRequestException('2FA setup expired. Please generate a new secret.');
    }

    const verified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) {
      return { verified: false };
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      randomBytes(4).toString('hex').toUpperCase()
    );

    // Enable 2FA permanently
    await this.supabase
      .from('users')
      .update({
        two_factor_secret: tempSecret,
        two_factor_enabled: true,
        two_factor_backup_codes: backupCodes
      })
      .eq('id', userId);

    // Clear temp secret
    await this.clearTemp2FA(userId);

    return { verified: true, backupCodes };
  }

  async disable2FA(userId: string, password: string) {
    const user = await this.findById(userId);

    const isValid = await this.verifyPassword(user.email, password);
    if (!isValid) {
      throw new BadRequestException('Password is incorrect');
    }

    await this.supabase
      .from('users')
      .update({
        two_factor_secret: null,
        two_factor_enabled: false,
        two_factor_backup_codes: null
      })
      .eq('id', userId);

    return { success: true };
  }

  async verify2FAToken(userId: string, token: string): Promise<boolean> {
    const { data: user } = await this.supabase
      .from('users')
      .select('two_factor_secret, two_factor_enabled, two_factor_backup_codes')
      .eq('id', userId)
      .single();

    if (!user?.two_factor_enabled || !user.two_factor_secret) {
      return true; // 2FA not enabled
    }

    // Check TOTP
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (verified) return true;

    // Check backup codes
    if (user.two_factor_backup_codes?.includes(token.toUpperCase())) {
      // Remove used backup code
      const updatedCodes = user.two_factor_backup_codes.filter((c: string) => c !== token.toUpperCase());
      await this.supabase
        .from('users')
        .update({ two_factor_backup_codes: updatedCodes })
        .eq('id', userId);
      return true;
    }

    return false;
  }

  private async clearTemp2FA(userId: string) {
    await this.supabase
      .from('user_preferences')
      .update({
        sync_preferences: {
          temp_2fa_secret: null,
          temp_2fa_expires: null
        }
      })
      .eq('user_id', userId);
  }
}
