/**
 * レートリミットの雛形（インメモリ）。
 * 本番では Upstash Redis や DB カウントに置き換えることを推奨。
 */
const store = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS = 30; // 1分あたり最大リクエスト数

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, entry);
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  entry.count += 1;
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  return {
    allowed: entry.count <= MAX_REQUESTS,
    remaining,
  };
}
