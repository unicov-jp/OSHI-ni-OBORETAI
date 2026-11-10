import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

// 行レベルセキュリティを迂回する特権クライアント。
// 取得ジョブ・Stripe Webhook・アカウント登録の確定処理でのみ使う。ブラウザへは絶対に渡さない。
export function createAdminClient(): SupabaseClient {
  if (!cached) {
    const key = process.env.SUPABASE_SECRET_KEY ?? requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    cached = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
