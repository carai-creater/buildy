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

// Vercel プレビュー用 feedback.js を許可する CSP（script-src-elem を明示しないと default-src でブロックされる）
const csp =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com data:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "script-src 'self' https://vercel.live; script-src-elem 'self' https://vercel.live; " +
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

// 購入者ログイン（メールで作成 or 取得）
app.post("/api/users/login", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  const emailTrim = email.trim();
  const { data: existing } = await supabase.from("users").select("id, email, name").eq("email", emailTrim).single();
  if (existing) {
    return res.json({ user: existing });
  }
  const { data: created, error } = await supabase.from("users").insert({ email: emailTrim }).select("id, email, name").single();
  if (error) return res.status(400).json({ error: error.message });
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

// クリエイター登録
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
  // 収益は将来的に runs テーブルから集計。現状は 0
  const totalRuns = 0;
  const totalEarnings = 0;
  res.json({ creator, agents, earnings: { totalRuns, totalEarnings } });
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

// エージェント追加（クリエイター登録済みの id を creator_id に指定）
app.post("/api/agents", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const { name, category, shortDescription, pricePerRun, system_prompt, creator_id } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = {
    id,
    name: name.trim(),
    category: category != null ? String(category).trim() : null,
    short_description: shortDescription != null ? String(shortDescription).trim() : null,
    price_per_run: typeof pricePerRun === "number" ? pricePerRun : parseInt(pricePerRun, 10) || 0,
    system_prompt: system_prompt && typeof system_prompt === "string" ? system_prompt.trim() : "You are a helpful assistant.",
    creator_id: creator_id || null,
  };
  const { data, error } = await supabase.from("agents").insert(row).select("id, name, category, short_description, price_per_run").single();
  if (error) return res.status(400).json({ error: error.message });
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

