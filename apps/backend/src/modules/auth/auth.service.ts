import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SUPABASE_CLIENT, SUPABASE_ANON_CLIENT } from '../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    @Inject(SUPABASE_CLIENT) private supabase: SupabaseClient,
    @Inject(SUPABASE_ANON_CLIENT) private anon: SupabaseClient
  ) {}

  private getResetRedirectUrl(): string {
    return process.env.AUTH_RESET_REDIRECT_URL || 'synchcc://reset-password';
  }

  private async isFirstUser(): Promise<boolean> {
    const { count } = await this.supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    return (count || 0) === 0;
  }

  async register(data: { email: string; password: string; name: string }) {
    const role = (await this.isFirstUser()) ? 'ADMIN' : 'MEMBER';

    // Create the Supabase Auth account (source of truth for credentials)
    const { data: created, error: createError } = await this.supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      throw new ConflictException(createError?.message || 'Failed to create account');
    }

    const authUserId = created.user.id;

    let user;
    try {
      user = await this.usersService.create({
        id: authUserId,
        email: data.email,
        name: data.name,
        role,
      });
    } catch (err) {
      // Roll back the auth user so the email can be reused
      await this.supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      throw err;
    }

    const { data: signIn, error: signInError } = await this.anon.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError || !signIn.session) {
      throw new UnauthorizedException(signInError?.message || 'Account created but sign-in failed');
    }

    return {
      user,
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
    };
  }

  async login(email: string, password: string) {
    const { data, error } = await this.anon.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findById(data.user.id);

    return {
      user,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.anon.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async getUserFromToken(token: string) {
    const { data, error } = await this.anon.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    try {
      return await this.usersService.findById(data.user.id);
    } catch {
      return null;
    }
  }

  async requestPasswordReset(email: string) {
    // Always return success to avoid leaking which emails exist
    const existing = await this.usersService.findByEmail(email).catch(() => null);

    if (existing) {
      await this.anon.auth
        .resetPasswordForEmail(email, { redirectTo: this.getResetRedirectUrl() })
        .catch(() => undefined);
    }

    return { success: true };
  }

  async resetPassword(params: { token?: string; accessToken?: string; newPassword: string }) {
    if (!params.newPassword || params.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    let authUserId: string | undefined;

    if (params.accessToken) {
      const { data, error } = await this.anon.auth.getUser(params.accessToken);
      if (error || !data.user) {
        throw new BadRequestException('Invalid or expired reset link');
      }
      authUserId = data.user.id;
    } else if (params.token) {
      const { data, error } = await this.anon.auth.verifyOtp({
        type: 'recovery',
        token_hash: params.token,
      });
      if (error || !data.user) {
        throw new BadRequestException('Invalid or expired reset link');
      }
      authUserId = data.user.id;
    } else {
      throw new BadRequestException('Missing reset token');
    }

    const { error } = await this.supabase.auth.admin.updateUserById(authUserId, {
      password: params.newPassword,
    });

    if (error) throw new Error(error.message);

    return { success: true };
  }
}
