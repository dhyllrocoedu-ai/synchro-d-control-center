import { Global, Module, Provider, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';
export const SUPABASE_ANON_CLIENT = 'SUPABASE_ANON_CLIENT';

const supabaseProvider: Provider = {
  provide: SUPABASE_CLIENT,
  useFactory: (configService: ConfigService) => {
    const url = configService.get<string>('SUPABASE_URL');
    const key = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || configService.get<string>('SUPABASE_SERVICE_KEY');

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
    }

    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  },
  inject: [ConfigService]
};

const supabaseAnonProvider: Provider = {
  provide: SUPABASE_ANON_CLIENT,
  useFactory: (configService: ConfigService) => {
    const url = configService.get<string>('SUPABASE_URL');
    const anonKey = configService.get<string>('SUPABASE_ANON_KEY');

    if (!url) {
      throw new Error('SUPABASE_URL must be set in environment variables');
    }

    if (!anonKey) {
      // The anon key is required for client-style auth operations
      // (signInWithPassword / refreshSession / getUser). Add it to .env.
      new Logger('SupabaseModule').warn(
        'SUPABASE_ANON_KEY is not set. Falling back to SUPABASE_SERVICE_KEY for auth operations. ' +
        'Add SUPABASE_ANON_KEY to apps/backend/.env (Supabase Dashboard > Settings > API).'
      );
    }

    const key = anonKey || configService.get<string>('SUPABASE_SERVICE_KEY');

    if (!key) {
      throw new Error('SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY must be set in environment variables');
    }

    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  },
  inject: [ConfigService]
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [supabaseProvider, supabaseAnonProvider],
  exports: [SUPABASE_CLIENT, SUPABASE_ANON_CLIENT]
})
export class SupabaseModule {}
