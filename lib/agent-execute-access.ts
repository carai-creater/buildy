import { getSupabaseServer } from "@/lib/supabase-server";
import { consumeGrantForExecute as consumeGrantJs } from "./consume-grant.js";

/**
 * 全エージェント: チェックアウトで発行された grant が必須（無料も同様）
 */
export async function consumeGrantForExecute(
  agentId: string,
  _pricePerRun: number,
  accessTokenRaw: string | null | undefined
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  const supabase = getSupabaseServer();
  return consumeGrantJs(supabase, agentId, accessTokenRaw, secret) as Promise<
    { ok: true } | { ok: false; status: number; message: string }
  >;
}
