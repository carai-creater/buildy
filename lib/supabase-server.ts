import { createClient } from "@supabase/supabase-js";

// 秘密情報は .env に置かず、デプロイ先の環境変数のみから読み込む
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[Buildy] Supabase URL or key missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_*)."
  );
}

/**
 * Server-side Supabase client（API Route 用）。
 * 環境変数からのみキーを読み込み、フロントに露出させない。
 */
export function getSupabaseServer() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase is not configured");
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}
