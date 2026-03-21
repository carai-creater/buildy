import { getSupabaseServer } from "@/lib/supabase-server";
import { parseAccessToken } from "@/lib/tempo-payment.js";

/**
 * 有料エージェントは Tempo 決済で発行されたトークンと DB 上の grant が必要。
 * 無料（price_per_run === 0）は常に許可。
 * 成功時は runs_remaining を 1 減らす（先に消費してから LLM 実行）。
 */
export async function consumeGrantForExecute(
  agentId: string,
  pricePerRun: number,
  accessTokenRaw: string | null | undefined
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const price = Number(pricePerRun) || 0;
  if (price <= 0) return { ok: true };

  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: "有料エージェントの実行には BUILDY_ACCESS_TOKEN_SECRET の設定が必要です。",
    };
  }

  const raw = (accessTokenRaw || "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return {
      ok: false,
      status: 402,
      message:
        "このエージェントは有料です。Tempo（stablecoin）で決済後に表示されるトークンで実行できます。",
    };
  }

  const parsed = parseAccessToken(raw, secret);
  if (!parsed || parsed.agentId !== agentId) {
    return { ok: false, status: 401, message: "無効なアクセストークンです。" };
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 401, message: "アクセストークンの有効期限が切れています。" };
  }

  const supabase = getSupabaseServer();
  const { data: grant, error } = await supabase
    .from("tempo_access_grants")
    .select("id, runs_remaining, expires_at")
    .eq("id", parsed.grantId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error || !grant) {
    return { ok: false, status: 401, message: "決済に基づく利用権が見つかりません。" };
  }
  if (new Date(grant.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, message: "利用権の有効期限が切れています。" };
  }
  const runs = Number(grant.runs_remaining) || 0;
  if (runs <= 0) {
    return {
      ok: false,
      status: 402,
      message: "実行回数が残っていません。再度お支払いください。",
    };
  }

  const { data: updated, error: uerr } = await supabase
    .from("tempo_access_grants")
    .update({ runs_remaining: runs - 1 })
    .eq("id", grant.id)
    .eq("runs_remaining", runs)
    .select("id")
    .maybeSingle();

  if (uerr || !updated) {
    return { ok: false, status: 409, message: "利用権の更新に失敗しました。しばらくして再試行してください。" };
  }

  return { ok: true };
}
