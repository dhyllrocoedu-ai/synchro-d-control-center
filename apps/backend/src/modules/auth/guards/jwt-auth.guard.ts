import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { SUPABASE_CLIENT, SUPABASE_ANON_CLIENT } from '../../../supabase/supabase.module';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ANON_CLIENT) private anon: SupabaseClient,
    @Inject(SUPABASE_CLIENT) private supabase: SupabaseClient
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Not authenticated');
    }

    const token = authHeader.slice('Bearer '.length).trim();

    const { data, error } = await this.anon.auth.getUser(token);
    if (error || !data?.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('users')
      .select('id, email, name, role, avatar_url, created_at')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found');
    }

    request.user = {
      sub: profile.id,
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      avatarUrl: profile.avatar_url,
      createdAt: profile.created_at,
    };

    return true;
  }
}
