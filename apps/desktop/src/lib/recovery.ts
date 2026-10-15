export interface RecoveryParams {
  accessToken?: string;
  token?: string;
}

/**
 * Extracts Supabase recovery credentials from a reset URL or deep link.
 *
 * Supports:
 *  - Implicit flow fragments: `synchcc://reset-password#access_token=...&refresh_token=...&type=recovery`
 *  - Query params: `...?token_hash=...&type=recovery` or `...?token=...`
 */
export function extractRecoveryParams(raw: string): RecoveryParams {
  if (!raw) return {};

  try {
    const hashIndex = raw.indexOf('#');
    const queryIndex = raw.indexOf('?');

    const params = new URLSearchParams();

    if (queryIndex >= 0) {
      const query = raw.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
      new URLSearchParams(query).forEach((value, key) => params.set(key, value));
    }

    if (hashIndex >= 0) {
      new URLSearchParams(raw.slice(hashIndex + 1)).forEach((value, key) => params.set(key, value));
    }

    return {
      accessToken: params.get('access_token') || undefined,
      token: params.get('token_hash') || params.get('token') || undefined,
    };
  } catch {
    return {};
  }
}
