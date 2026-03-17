import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 秘密情報は .env に置かず、Vercel 等の「環境変数」のみから読み込む
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.use(express.json());

// #region agent log
app.use((req, _res, next) => {
  fetch("http://127.0.0.1:7621/ingest/1a015be2-eba8-436a-b6d2-cc397703420d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "785dd1" },
    body: JSON.stringify({
      sessionId: "785dd1",
      location: "server.js:request",
      message: "request received",
      data: {
        method: req.method,
        path: req.path,
        url: req.url,
        originalUrl: req.originalUrl,
        __dirname,
        hypothesisId: "A",
      },
      timestamp: Date.now(),
      hypothesisId: "A",
    }),
  }).catch(() => {});
  next();
});
// #endregion

// Vercel プレビュー用・Supabase CDN・インラインスクリプトを許可する CSP
const csp =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "frame-src 'self' https://vercel.live; " +
  "img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com data:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "script-src 'self' 'unsafe-inline' https://vercel.live https://cdn.jsdelivr.net; " +
  "script-src-elem 'self' 'unsafe-inline' https://vercel.live https://cdn.jsdelivr.net; " +
  "connect-src 'self' https:;";
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", csp);
  next();
});

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "..")));
// Vercel の api 関数バンドル内の静的ファイル（api/static/ に配置）
const apiStatic = path.join(__dirname, "api", "static");
app.use(express.static(apiStatic));

// Vercel では static が index を見つけられないことがあるため GET / を明示的に処理
app.get("/", (req, res, next) => {
  const roots = [apiStatic, __dirname, path.join(__dirname, ".."), process.cwd()];
  const tried = roots.map((root) => {
    const p = path.join(root, "index.html");
    return { root, p, exists: fs.existsSync(p) };
  });
  // #region agent log
  fetch("http://127.0.0.1:7621/ingest/1a015be2-eba8-436a-b6d2-cc397703420d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "785dd1" },
    body: JSON.stringify({
      sessionId: "785dd1",
      location: "server.js:GET /",
      message: "GET / handler",
      data: { path: req.path, tried, hypothesisId: "A" },
      timestamp: Date.now(),
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion
  for (const { p, exists } of tried) {
    if (exists) return res.sendFile(p);
  }
  next();
});

app.get("/index.html", (req, res, next) => {
  const p = path.join(apiStatic, "index.html");
  if (fs.existsSync(p)) return res.sendFile(p);
  next();
});

app.get("/api/agents", async (_req, res) => {
  if (!supabase) return res.json({ agents: [] });
  const { data, error } = await supabase.from("agents").select("id, name, category, short_description, price_per_run, hero").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message, agents: [] });
  const agents = (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category || "",
    shortDescription: r.short_description || "",
    pricePerRun: r.price_per_run ?? 0,
    hero: !!r.hero,
  }));
  res.json({ agents });
});

app.get("/api/agents/:id", async (req, res) => {
  if (!supabase) return res.status(404).json({ error: "Agent not found" });
  const { data, error } = await supabase.from("agents").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Agent not found" });
  res.json({
    agent: {
      id: data.id,
      name: data.name,
      category: data.category,
      shortDescription: data.short_description,
      pricePerRun: data.price_per_run,
      hero: data.hero,
      system_prompt: data.system_prompt,
    },
  });
});

app.post("/api/agents/:id/run", async (req, res) => {
  const agent = supabase
    ? (await supabase.from("agents").select("id, name").eq("id", req.params.id).single()).data
    : null;
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { query, user_id: userId } = req.body || {};
  const safeQuery = typeof query === "string" && query.trim() ? query.trim() : "指定なし";
  if (supabase && userId && typeof userId === "string") {
    await supabase.from("runs").insert({ user_id: userId.trim(), agent_id: agent.id });
  }

  res.json({
    runId: `run_${Date.now()}`,
    agentId: agent.id,
    startedAt: new Date().toISOString(),
    estimatedMinutes: 1,
    status: "completed",
    report: {
      title: `${agent.name} 実行結果（ダミー）`,
      overview: "実際の運用時には、外部APIやAIモデルと連携して結果を生成します。",
      inputQuery: safeQuery,
    },
  });
});

// 購入者「自分」を JWT から取得・作成（Google 等 OAuth 後の同期用）
app.get("/api/users/me", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Authorization required" });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid or expired token" });
  const meta = user.user_metadata || {};
  const name = [meta.full_name, meta.name, meta.user_name].find(Boolean);
  const nameStr = (name ? String(name).trim() : null) || user.email || "";
  const email = user.email || "";
  const { data: existing } = await supabase.from("users").select("id, email, name").eq("id", user.id).single();
  if (existing) {
    return res.json({ user: existing });
  }
  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ id: user.id, email, name: nameStr || null })
    .select("id, email, name")
    .single();
  if (insertError) return res.status(400).json({ error: insertError.message });
  res.json({ user: created });
});

// 購入者ログイン（メールで作成 or 取得）
app.post("/api/users/login", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  const emailTrim = email.trim();
  const { data: existing, error: selectError } = await supabase.from("users").select("id, email, name").eq("email", emailTrim).single();
  if (selectError && /schema cache|could not find the table|relation.*does not exist/i.test(selectError.message)) {
    return res.status(503).json({
      error: "利用者ログインには public.users テーブルが必要です。Supabase の SQL Editor で docs/supabase-users.sql を実行してテーブルを作成してください。",
    });
  }
  if (existing) {
    return res.json({ user: existing });
  }
  const { data: created, error } = await supabase.from("users").insert({ email: emailTrim }).select("id, email, name").single();
  if (error) {
    if (/schema cache|could not find the table|relation.*does not exist/i.test(error.message)) {
      return res.status(503).json({
        error: "利用者ログインには public.users テーブルが必要です。Supabase の SQL Editor で docs/supabase-users.sql を実行してテーブルを作成してください。",
      });
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json({ user: created });
});

// 購入者マイページ用：利用したエージェント一覧
app.get("/api/users/:id/agents", async (req, res) => {
  if (!supabase) return res.status(404).json({ error: "Not found" });
  const userId = req.params.id;
  const { data: runRows } = await supabase
    .from("runs")
    .select("agent_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!runRows || runRows.length === 0) {
    return res.json({ user: null, agents: [] });
  }
  const agentIds = [...new Set(runRows.map((r) => r.agent_id))];
  const { data: agentRows } = await supabase.from("agents").select("id, name, category, short_description, price_per_run").in("id", agentIds);
  const byId = (agentRows || []).reduce((acc, a) => {
    acc[a.id] = a;
    return acc;
  }, {});
  const agents = agentIds.map((id) => {
    const r = runRows.find((x) => x.agent_id === id);
    const a = byId[id];
    return a
      ? {
          id: a.id,
          name: a.name,
          category: a.category || "",
          shortDescription: a.short_description || "",
          pricePerRun: a.price_per_run ?? 0,
          lastUsedAt: r ? r.created_at : null,
        }
      : null;
  }).filter(Boolean);
  const { data: user } = await supabase.from("users").select("id, email, name").eq("id", userId).single();
  res.json({ user: user || null, agents });
});

// クライアント用設定（メール認証時に Supabase Auth を使う場合）
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
app.get("/api/config", (_req, res) => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasUrl = !!(url && url.trim());
  const hasServiceKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
  const hasAnonKey = !!(supabaseAnonKey && supabaseAnonKey.trim());
  res.json({
    supabaseUrl: url || "",
    supabaseAnonKey: supabaseAnonKey || "",
    // 接続状況の確認用（キーの中身は返さない）
    supabaseLinked: !!(supabase !== null),
    supabaseClientReady: hasUrl && hasAnonKey,
    envHint: !hasUrl || !hasServiceKey
      ? "SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を Vercel の Environment Variables に設定してください。"
      : !hasAnonKey
        ? "Google・パスワード認証を使う場合は SUPABASE_ANON_KEY も追加してください。"
        : null,
  });
});

// クリエイター「自分」を JWT から取得・作成（メール認証後の同期用）
app.get("/api/creators/me", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Authorization required" });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid or expired token" });
  const meta = user.user_metadata || {};
  const name = [meta.full_name, meta.name, meta.user_name].find(Boolean);
  const nameStr = (name ? String(name).trim() : null) || user.email || "クリエイター";
  const email = user.email || "";
  const { data: existing } = await supabase.from("creators").select("id, name, email").eq("id", user.id).single();
  if (existing) {
    return res.json({ creator: existing });
  }
  const { data: created, error: insertError } = await supabase
    .from("creators")
    .insert({ id: user.id, name: nameStr, email })
    .select("id, name, email")
    .single();
  if (insertError) return res.status(400).json({ error: insertError.message });
  res.json({ creator: created });
});

// クリエイター登録（メール認証なし・従来方式。anon key 未設定時やフォールバック用）
app.post("/api/creators/register", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { name, email } = req.body || {};
  if (!name || !email || typeof name !== "string" || typeof email !== "string") {
    return res.status(400).json({ error: "name and email are required" });
  }
  const { data, error } = await supabase.from("creators").insert({ name: name.trim(), email: email.trim() }).select("id, name, email").single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ creator: data });
});

// クリエイター情報とそのエージェント一覧（ダッシュボード用）
app.get("/api/creators/:id", async (req, res) => {
  if (!supabase) return res.status(404).json({ error: "Not found" });
  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("id, name, email")
    .eq("id", req.params.id)
    .single();
  if (creatorError || !creator) return res.status(404).json({ error: "Creator not found" });
  const { data: agentsRows } = await supabase
    .from("agents")
    .select("id, name, category, short_description, price_per_run, created_at")
    .eq("creator_id", req.params.id)
    .order("created_at", { ascending: false });
  const agents = (agentsRows || []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category || "",
    shortDescription: r.short_description || "",
    pricePerRun: r.price_per_run ?? 0,
    createdAt: r.created_at,
  }));
  const agentIds = agents.map((a) => a.id);
  let totalRuns = 0;
  let totalEarnings = 0;
  const byAgent = agents.map((a) => ({ agentId: a.id, agentName: a.name, pricePerRun: a.pricePerRun, runs: 0, earnings: 0 }));
  const byAgentId = Object.fromEntries(byAgent.map((b) => [b.agentId, b]));
  if (agentIds.length > 0) {
    const { data: runRows } = await supabase
      .from("runs")
      .select("agent_id")
      .in("agent_id", agentIds);
    if (runRows && runRows.length > 0) {
      runRows.forEach((r) => {
        const row = byAgentId[r.agent_id];
        if (row) {
          row.runs += 1;
          row.earnings += row.pricePerRun;
          totalRuns += 1;
          totalEarnings += row.pricePerRun;
        }
      });
    }
  }
  res.json({ creator, agents, earnings: { totalRuns, totalEarnings, byAgent } });
});

// プロフィール更新（表示名・メール）
app.patch("/api/creators/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { name, email } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (email !== undefined) updates.email = String(email).trim();
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "name or email required" });
  const { data, error } = await supabase
    .from("creators")
    .update(updates)
    .eq("id", req.params.id)
    .select("id, name, email")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Creator not found" });
  res.json({ creator: data });
});

// GitHub リポジトリ情報取得（公開リポのみ・未認証で 60 req/h 制限あり）
app.get("/api/github/repo", async (req, res) => {
  const url = (req.query.url || req.query.repo || "").toString().trim();
  let ownerRepo = url;
  if (url.startsWith("https://github.com/")) {
    ownerRepo = url.replace(/^https:\/\/github\.com\/?/, "").replace(/\/$/, "").split("/").slice(0, 2).join("/");
  } else if (url.startsWith("http")) {
    return res.status(400).json({ error: "GitHub の URL を入力してください（https://github.com/owner/repo）" });
  }
  if (!ownerRepo || !ownerRepo.includes("/")) {
    return res.status(400).json({ error: "リポジトリを「owner/repo」または「https://github.com/owner/repo」で指定してください" });
  }
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!ghRes.ok) {
      const t = await ghRes.text();
      if (ghRes.status === 404) return res.status(404).json({ error: "リポジトリが見つかりません（非公開の場合は公開にしてください）" });
      return res.status(ghRes.status).json({ error: t || "GitHub API エラー" });
    }
    const repo = await ghRes.json();
    res.json({
      name: repo.name || "",
      description: repo.description || "",
      full_name: repo.full_name || ownerRepo,
      html_url: repo.html_url || `https://github.com/${ownerRepo}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "取得に失敗しました" });
  }
});

// エージェント追加（クリエイター登録済みの id を creator_id に指定）
app.post("/api/agents", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { name, category, shortDescription, pricePerRun, system_prompt, creator_id, github_repo } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const githubRepoVal = github_repo && typeof github_repo === "string" ? github_repo.trim() || null : null;
  const row = {
    id,
    name: name.trim(),
    category: category != null ? String(category).trim() : null,
    short_description: shortDescription != null ? String(shortDescription).trim() : null,
    price_per_run: typeof pricePerRun === "number" ? pricePerRun : parseInt(pricePerRun, 10) || 0,
    system_prompt: system_prompt && typeof system_prompt === "string" ? system_prompt.trim() : "You are a helpful assistant.",
    creator_id: creator_id || null,
  };
  if (githubRepoVal) row.github_repo = githubRepoVal;
  let result = await supabase.from("agents").insert(row).select("id, name, category, short_description, price_per_run").single();
  if (result.error && githubRepoVal && /github_repo|column.*does not exist/i.test(result.error.message)) {
    delete row.github_repo;
    result = await supabase.from("agents").insert(row).select("id, name, category, short_description, price_per_run").single();
  }
  if (result.error) return res.status(400).json({ error: result.error.message });
  const data = result.data;
  res.status(201).json({ agent: { id: data.id, name: data.name, category: data.category, shortDescription: data.short_description, pricePerRun: data.price_per_run } });
});

// エージェント更新
app.patch("/api/agents/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { name, category, shortDescription, pricePerRun, system_prompt } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (category !== undefined) updates.category = String(category).trim() || null;
  if (shortDescription !== undefined) updates.short_description = String(shortDescription).trim() || null;
  if (pricePerRun !== undefined) updates.price_per_run = typeof pricePerRun === "number" ? pricePerRun : parseInt(pricePerRun, 10) || 0;
  if (system_prompt !== undefined) updates.system_prompt = String(system_prompt).trim() || "You are a helpful assistant.";
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("agents").update(updates).eq("id", req.params.id).select("id, name, category, short_description, price_per_run").single();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Agent not found" });
  res.json({ agent: { id: data.id, name: data.name, category: data.category, shortDescription: data.short_description, pricePerRun: data.price_per_run } });
});

// エージェント削除
app.delete("/api/agents/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { error } = await supabase.from("agents").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

app.post("/api/auth/login", (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  const token = `demo_${Buffer.from(email).toString("base64")}`;
  res.json({
    token,
    user: {
      id: "demo-user",
      email,
      name: "Demo User",
    },
  });
});

app.get("/api/me", (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer demo_")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    user: {
      id: "demo-user",
      email: "demo@example.com",
      name: "Demo User",
    },
  });
});

// #region agent log
app.use((req, res, next) => {
  if (res.headersSent) return next();
  fetch("http://127.0.0.1:7621/ingest/1a015be2-eba8-436a-b6d2-cc397703420d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "785dd1" },
    body: JSON.stringify({
      sessionId: "785dd1",
      location: "server.js:no-route",
      message: "no route matched",
      data: { path: req.path, originalUrl: req.originalUrl, method: req.method },
      timestamp: Date.now(),
      hypothesisId: "C",
    }),
  }).catch(() => {});
  res.status(404).json({ error: "not_found", path: req.path });
});
// #endregion

// Vercel ではサーバーレスとして api/index.js から使うため listen しない
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Buildy backend listening on http://localhost:${PORT}`);
  });
}

export default app;

