/**
 * 全エージェント共通: Tempo / 無料チェックアウト後の grant が必須（price に関わらず）
 */
import { parseAccessToken } from "./tempo-payment.js";

export async function consumeGrantForExecute(supabase, agentId, accessTokenRaw, secret) {
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: "BUILDY_ACCESS_TOKEN_SECRET が未設定です。",
    };
  }

  const raw = (accessTokenRaw || "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return {
      ok: false,
      status: 402,
      message: "先に決済（チェックアウト）を完了し、アクセストークンを取得してください。",
    };
  }

  const parsed = parseAccessToken(raw, secret);
  if (!parsed || parsed.agentId !== agentId) {
    return { ok: false, status: 401, message: "無効なアクセストークンです。" };
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 401, message: "アクセストークンの有効期限が切れています。" };
  }

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
      message: "実行回数が残っていません。再度チェックアウトしてください。",
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
    return {
      ok: false,
      status: 409,
      message: "利用権の更新に失敗しました。しばらくして再試行してください。",
    };
  }

  return { ok: true };
}
