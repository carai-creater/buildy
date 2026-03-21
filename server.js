import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Stripe from "stripe";
import {
  getTempoDefaults,
  yenToUsdAtomic,
  randomOrderId,
  verifyTip20TransferWithMemo,
  signAccessToken,
} from "./lib/tempo-payment.js";
import { consumeGrantForExecute } from "./lib/consume-grant.js";

/** Vercel サーバーレスでテーブル未作成時のフォールバック用（本番は Supabase の SQL を実行してください） */
const tempoIntentMemory = new Map();

/** チェックアウト後トークン署名に必須。未設定時は API が 503 を返す。 */
function jsonAccessTokenSecretMissing() {
  return {
    error: "BUILDY_ACCESS_TOKEN_SECRET is not set",
    message:
      "Set BUILDY_ACCESS_TOKEN_SECRET (a long random string) in your deployment environment — e.g. Vercel: Project → Settings → Environment Variables — then redeploy.",
    messageJa:
      "環境変数 BUILDY_ACCESS_TOKEN_SECRET（長いランダム文字列）を設定し、再デプロイしてください（例: Vercel の Project → Settings → Environment Variables）。",
  };
}

/** PostgREST / Supabase: table missing or not in schema cache yet */
function supabaseSaysTableMissing(msg) {
  const m = String(msg || "");
  return /relation|does not exist|Could not find the table/i.test(m);
}

function jsonTempoSchemaMissing(tableKey) {
  const tip = {
    message:
      "In Supabase → SQL Editor, run docs/supabase-tempo-payments.sql from the Buildy repo, then retry.",
    messageJa:
      "Supabase の SQL エディタでリポジトリの docs/supabase-tempo-payments.sql を実行してから再度お試しください。",
  };
  if (tableKey === "intents") {
    return { error: "tempo_payment_intents missing", ...tip };
  }
  return { error: "tempo_access_grants missing", ...tip };
}

function publicOrigin(req) {
  const envBase = (process.env.BUILDY_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

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
  "img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com https://vercel.live data:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "script-src 'self' 'unsafe-inline' https://vercel.live https://cdn.jsdelivr.net; " +
  "script-src-elem 'self' 'unsafe-inline' https://vercel.live https://cdn.jsdelivr.net; " +
  "connect-src 'self' https:;";
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", csp);
  next();
});

// Vercel の api 関数バンドル内の静的ファイル（api/static/ に配置）
const apiStatic = path.join(__dirname, "api", "static");

/** Prefer repo-root English landing, then public/, then api/static (default language: English). */
function sendEnglishIndexHtml(res, next) {
  const candidates = [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "public", "index.html"),
    path.join(apiStatic, "index.html"),
    path.join(process.cwd(), "index.html"),
  ];
  const tried = candidates.map((p) => ({ p, exists: fs.existsSync(p) }));
  // #region agent log
  fetch("http://127.0.0.1:7621/ingest/1a015be2-eba8-436a-b6d2-cc397703420d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "785dd1" },
    body: JSON.stringify({
      sessionId: "785dd1",
      location: "server.js:sendEnglishIndexHtml",
      message: "resolve English index.html",
      data: { tried, hypothesisId: "A" },
      timestamp: Date.now(),
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion
  for (const { p, exists } of tried) {
    if (exists) return res.sendFile(path.resolve(p));
  }
  next();
}

// Before express.static: ensure "/" and "/index.html" are the English homepage, not another index.
app.get("/", (req, res, next) => sendEnglishIndexHtml(res, next));
app.get("/index.html", (req, res, next) => sendEnglishIndexHtml(res, next));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "..")));
app.use(express.static(apiStatic));

app.get("/api/agents", async (_req, res) => {
  if (!supabase) return res.json({ agents: [] });
  // マーケットプレイス一覧はクリエイターが紐づけたエージェントのみ（creator_id あり）
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, category, short_description, price_per_run, hero")
    .not("creator_id", "is", null)
    .order("created_at", { ascending: false });
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
  let uiVariant = data.ui_variant;
  if (!uiVariant && typeof data.name === "string") {
    if (/research/i.test(data.name)) uiVariant = "research";
    else uiVariant = "chat";
  }
  res.json({
    agent: {
      id: data.id,
      name: data.name,
      category: data.category,
      shortDescription: data.short_description,
      pricePerRun: data.price_per_run,
      hero: data.hero,
      system_prompt: data.system_prompt,
      uiVariant: uiVariant || "chat",
    },
  });
});

/**
 * LLM 実行（Vercel で /api が Express に集約されるため Next と同じパスをここでも提供）
 */
app.post("/api/agent/execute", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "server_error", message: "LLM が設定されていません。" });
  }
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

  const body = req.body || {};
  const agent_id = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  const user_message = typeof body.user_message === "string" ? body.user_message.trim() : "";
  const bodyMessages = Array.isArray(body.messages) ? body.messages : null;
  const stream = body.stream !== false;
  const paymentHeader =
    (req.headers["x-buildy-access-token"] || req.headers["X-Buildy-Access-Token"] || "").toString().trim() ||
    (typeof body.payment_access_token === "string" ? body.payment_access_token : "");

  if (!agent_id) {
    return res.status(400).json({ error: "agent_id_required", message: "agent_id は必須です。" });
  }

  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).json(jsonAccessTokenSecretMissing());
  }

  try {
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, system_prompt, creator_id, price_per_run")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent || !agent.creator_id) {
      return res.status(404).json({
        error: "agent_not_found",
        message: "指定されたエージェントが見つかりません。",
      });
    }

    const grantCheck = await consumeGrantForExecute(supabase, agent_id, paymentHeader, secret);
    if (!grantCheck.ok) {
      return res.status(grantCheck.status).json({
        error: "payment_required",
        message: grantCheck.message,
      });
    }

    const systemPrompt = (agent.system_prompt && String(agent.system_prompt)) || "You are a helpful assistant.";
    let messages = [];
    if (bodyMessages && bodyMessages.length > 0) {
      messages = bodyMessages;
    } else if (user_message) {
      messages = [{ role: "user", content: user_message }];
    } else {
      return res.status(400).json({
        error: "messages_required",
        message: "messages または user_message を送信してください。",
      });
    }

    const openaiMessages = [{ role: "system", content: systemPrompt }, ...messages];
    const openai = new OpenAI({ apiKey });

    if (stream) {
      const s = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: openaiMessages,
        stream: true,
      });
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      try {
        for await (const chunk of s) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      } catch (e) {
        console.error("[Buildy execute] stream error", e);
        res.write(
          `data: ${JSON.stringify({ error: "stream_error", message: "ストリーム中にエラーが発生しました。" })}\n\n`
        );
      }
      return res.end();
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: openaiMessages,
      stream: false,
    });
    const content = completion.choices?.[0]?.message?.content ?? "";
    return res.json({ content, conversation_id: body.conversation_id });
  } catch (err) {
    console.error("[Buildy execute]", err);
    return res.status(500).json({
      error: "execution_failed",
      message: err instanceof Error ? err.message : "エージェント実行に失敗しました。",
    });
  }
});

// --- Tempo 決済（TIP-20 transferWithMemo）: https://tempo.xyz/
app.post("/api/payments/tempo/intent", async (req, res) => {
  const agentId = (req.body?.agentId || req.body?.agent_id || "").toString().trim();
  if (!agentId) return res.status(400).json({ error: "agentId is required" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id, name, short_description, price_per_run, creator_id")
    .eq("id", agentId)
    .single();
  if (agentErr || !agent || !agent.creator_id) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const priceYen = Number(agent.price_per_run) || 0;
  const cfg = getTempoDefaults();
  let checkoutKind;
  let atomic;
  let usd;

  if (priceYen <= 0) {
    checkoutKind = "free";
    atomic = "0";
    usd = 0;
  } else {
    checkoutKind = "tempo";
    if (!cfg.receiver) {
      return res.status(503).json({
        error: "BUILDY_TEMPO_RECEIVER is not set",
        message: "決済先ウォレットが未設定です。環境変数 BUILDY_TEMPO_RECEIVER を設定してください。",
      });
    }
    const conv = yenToUsdAtomic(priceYen);
    atomic = conv.atomic;
    usd = conv.usd;
  }

  const orderId = randomOrderId();
  const memoLabel = `by-${orderId}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const row = {
    order_id: orderId,
    agent_id: agent.id,
    amount_usd_atomic: atomic,
    memo_label: memoLabel,
    expires_at: expiresAt,
  };

  const { error: insErr } = await supabase.from("tempo_payment_intents").insert(row);
  if (insErr) {
    if (supabaseSaysTableMissing(insErr.message)) {
      return res.status(503).json(jsonTempoSchemaMissing("intents"));
    }
    // その他の一時エラー時はメモリに保持（開発用・非推奨）
    tempoIntentMemory.set(orderId, { ...row, agent_name: agent.name });
  }

  res.json({
    checkoutKind,
    orderId,
    memoLabel,
    amountUsd: usd,
    amountAtomic: atomic,
    decimals: 6,
    tokenAddress: checkoutKind === "tempo" ? cfg.tokenAddress : null,
    recipient: checkoutKind === "tempo" ? cfg.receiver : null,
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
    explorerUrl: cfg.explorerBase,
    tempoSiteUrl: "https://tempo.xyz/",
    tempoDocsUrl: "https://docs.tempo.xyz/",
    agent: {
      id: agent.id,
      name: agent.name,
      shortDescription: agent.short_description || "",
      pricePerRunYen: priceYen,
    },
    intentExpiresAt: expiresAt,
  });
});

app.post("/api/payments/tempo/verify", async (req, res) => {
  const orderId = (req.body?.orderId || req.body?.order_id || "").toString().trim();
  const txHash = (req.body?.txHash || req.body?.tx_hash || "").toString().trim();
  if (!orderId || !txHash) {
    return res.status(400).json({ error: "orderId and txHash are required" });
  }
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).json(jsonAccessTokenSecretMissing());
  }

  let intent = null;
  const { data: intentRow, error: intentErr } = await supabase
    .from("tempo_payment_intents")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!intentErr && intentRow) {
    intent = intentRow;
  } else {
    const mem = tempoIntentMemory.get(orderId);
    if (mem) {
      intent = {
        order_id: mem.order_id,
        agent_id: mem.agent_id,
        amount_usd_atomic: mem.amount_usd_atomic,
        memo_label: mem.memo_label,
        expires_at: mem.expires_at,
      };
    }
  }

  if (!intent) {
    return res.status(404).json({ error: "order not found or expired" });
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "intent expired" });
  }

  const cfg = getTempoDefaults();
  const v = await verifyTip20TransferWithMemo(txHash, {
    recipient: cfg.receiver,
    tokenAddress: cfg.tokenAddress,
    minAtomic: intent.amount_usd_atomic,
    memoLabel: intent.memo_label,
    rpcUrl: cfg.rpcUrl,
  });
  if (!v.ok) {
    return res.status(400).json({ error: v.error || "verification failed" });
  }

  const grantExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const grantRow = {
    order_id: orderId,
    agent_id: intent.agent_id,
    payer_wallet: v.from,
    tx_hash: txHash,
    amount_usd_atomic: intent.amount_usd_atomic,
    runs_remaining: 1,
    expires_at: grantExpires,
  };

  const { data: grant, error: gErr } = await supabase.from("tempo_access_grants").insert(grantRow).select("id").single();

  let grantId;
  if (gErr || !grant) {
    if (supabaseSaysTableMissing(gErr?.message)) {
      return res.status(503).json(jsonTempoSchemaMissing("grants"));
    }
    if (/duplicate|unique|violates unique constraint/i.test(gErr?.message || "")) {
      return res.status(400).json({ error: "この取引はすでに登録されています。" });
    }
    return res.status(400).json({ error: gErr?.message || "failed to save grant" });
  }
  grantId = grant.id;

  await supabase.from("tempo_payment_intents").delete().eq("order_id", orderId);
  tempoIntentMemory.delete(orderId);

  const expSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const accessToken = signAccessToken(
    { grantId, agentId: intent.agent_id, exp: expSec },
    secret
  );

  res.json({
    ok: true,
    accessToken,
    grantId,
    agentId: intent.agent_id,
    payerWallet: v.from,
    expiresAt: grantExpires,
    usePath: `./agent-use.html?agent=${encodeURIComponent(intent.agent_id)}`,
  });
});

/** 無料エージェントも「チェックアウト」通過用（オンチェーン送金なしで grant 発行） */
app.post("/api/payments/tempo/confirm-free", async (req, res) => {
  const orderId = (req.body?.orderId || req.body?.order_id || "").toString().trim();
  if (!orderId) return res.status(400).json({ error: "orderId is required" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });

  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).json(jsonAccessTokenSecretMissing());
  }

  let intent = null;
  const { data: intentRow, error: intentErr } = await supabase
    .from("tempo_payment_intents")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!intentErr && intentRow) {
    intent = intentRow;
  } else {
    const mem = tempoIntentMemory.get(orderId);
    if (mem) {
      intent = {
        order_id: mem.order_id,
        agent_id: mem.agent_id,
        amount_usd_atomic: mem.amount_usd_atomic,
        memo_label: mem.memo_label,
        expires_at: mem.expires_at,
      };
    }
  }

  if (!intent) return res.status(404).json({ error: "order not found or expired" });
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "intent expired" });
  }

  let isZero = intent.amount_usd_atomic === "0";
  if (!isZero) {
    try {
      isZero = BigInt(intent.amount_usd_atomic) === 0n;
    } catch {
      isZero = false;
    }
  }
  if (!isZero) {
    return res.status(400).json({
      error: "This order requires on-chain Tempo payment (amount > 0).",
    });
  }

  const txHash = `free:${orderId}:${crypto.randomBytes(12).toString("hex")}`;
  const grantExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const grantRow = {
    order_id: orderId,
    agent_id: intent.agent_id,
    payer_wallet: "0x0000000000000000000000000000000000000000",
    tx_hash: txHash,
    amount_usd_atomic: "0",
    runs_remaining: 1,
    expires_at: grantExpires,
  };

  const { data: grant, error: gErr } = await supabase.from("tempo_access_grants").insert(grantRow).select("id").single();

  if (gErr || !grant) {
    if (supabaseSaysTableMissing(gErr?.message)) {
      return res.status(503).json(jsonTempoSchemaMissing("grants"));
    }
    return res.status(400).json({ error: gErr?.message || "failed to save grant" });
  }

  await supabase.from("tempo_payment_intents").delete().eq("order_id", orderId);
  tempoIntentMemory.delete(orderId);

  const expSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const accessToken = signAccessToken(
    { grantId: grant.id, agentId: intent.agent_id, exp: expSec },
    secret
  );

  res.json({
    ok: true,
    accessToken,
    grantId: grant.id,
    agentId: intent.agent_id,
    expiresAt: grantExpires,
    usePath: `./agent-use.html?agent=${encodeURIComponent(intent.agent_id)}`,
  });
});

/** Stripe Checkout（カード等）— 一般ユーザー向けの簡単な支払い */
app.post("/api/payments/stripe/create-checkout-session", async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return res.status(503).json({
      error: "stripe_not_configured",
      message: "STRIPE_SECRET_KEY が未設定です。Stripe ダッシュボードでキーを取得し環境変数に設定してください。",
    });
  }
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).json(jsonAccessTokenSecretMissing());
  }

  const agentId = (req.body?.agentId || req.body?.agent_id || "").toString().trim();
  const returnPath = req.body?.returnPath === "pay-en.html" ? "pay-en.html" : "pay.html";
  if (!agentId) return res.status(400).json({ error: "agentId is required" });

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id, name, short_description, price_per_run, creator_id")
    .eq("id", agentId)
    .single();
  if (agentErr || !agent || !agent.creator_id) {
    return res.status(404).json({ error: "Agent not found" });
  }
  const priceYen = Math.round(Number(agent.price_per_run) || 0);
  if (priceYen <= 0) {
    return res.status(400).json({
      error: "free_agent",
      message: "無料エージェントは Stripe ではなく画面の無料チェックアウトを使ってください。",
    });
  }

  const origin = publicOrigin(req);
  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "jpy",
            unit_amount: priceYen,
            product_data: {
              name: `Buildy · ${agent.name}`,
              description: (agent.short_description || "").slice(0, 450) || undefined,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/${returnPath}?agent=${encodeURIComponent(agentId)}&paid=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${returnPath}?agent=${encodeURIComponent(agentId)}`,
      metadata: {
        buildy_agent_id: agentId,
        buildy_price_jpy: String(priceYen),
      },
    });
    if (!session.url) {
      return res.status(500).json({ error: "stripe_no_url" });
    }
    return res.json({ url: session.url });
  } catch (e) {
    console.error("[Buildy Stripe] create session", e);
    return res.status(500).json({
      error: "stripe_error",
      message: e instanceof Error ? e.message : "Stripe session failed",
    });
  }
});

app.post("/api/payments/stripe/complete", async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  const sessionId = (req.body?.sessionId || req.body?.session_id || "").toString().trim();
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
  if (!key) return res.status(503).json({ error: "stripe_not_configured" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const secret = process.env.BUILDY_ACCESS_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).json(jsonAccessTokenSecretMissing());
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "payment_not_completed", message: session.payment_status || "unknown" });
    }

    const agentId = session.metadata?.buildy_agent_id;
    const metaPrice = parseInt(session.metadata?.buildy_price_jpy || "", 10);
    if (!agentId || !Number.isFinite(metaPrice)) {
      return res.status(400).json({ error: "invalid_session_metadata" });
    }

    const { data: agent, error: aerr } = await supabase
      .from("agents")
      .select("id, price_per_run")
      .eq("id", agentId)
      .single();
    if (aerr || !agent) return res.status(404).json({ error: "Agent not found" });
    const expected = Math.round(Number(agent.price_per_run) || 0);
    const paid = session.amount_total;
    if (paid !== expected || metaPrice !== expected) {
      return res.status(400).json({ error: "amount_mismatch" });
    }

    const txHash = `stripe:${sessionId}`;
    const { data: existing } = await supabase.from("tempo_access_grants").select("id").eq("tx_hash", txHash).maybeSingle();

    let grantId;
    if (existing?.id) {
      grantId = existing.id;
    } else {
      const grantExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const email = session.customer_details?.email || session.customer_email;
      const grantRow = {
        order_id: `stripe_${sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-16)}`,
        agent_id: agentId,
        payer_wallet: email ? `stripe_email:${email}` : "stripe:guest",
        tx_hash: txHash,
        amount_usd_atomic: String(paid),
        runs_remaining: 1,
        expires_at: grantExpires,
      };
      const { data: grant, error: gErr } = await supabase
        .from("tempo_access_grants")
        .insert(grantRow)
        .select("id")
        .single();
      if (gErr || !grant) {
        if (supabaseSaysTableMissing(gErr?.message)) {
          return res.status(503).json(jsonTempoSchemaMissing("grants"));
        }
        if (/duplicate|unique|violates unique constraint/i.test(gErr?.message || "")) {
          const { data: again } = await supabase.from("tempo_access_grants").select("id").eq("tx_hash", txHash).maybeSingle();
          if (again?.id) grantId = again.id;
          else return res.status(409).json({ error: "grant_conflict" });
        } else {
          return res.status(400).json({ error: gErr?.message || "failed to save grant" });
        }
      } else {
        grantId = grant.id;
      }
    }

    if (!grantId) {
      return res.status(500).json({ error: "grant_missing" });
    }

    const expSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const accessToken = signAccessToken({ grantId, agentId, exp: expSec }, secret);
    return res.json({
      ok: true,
      accessToken,
      grantId,
      agentId,
    });
  } catch (e) {
    console.error("[Buildy Stripe] complete", e);
    return res.status(500).json({
      error: "stripe_error",
      message: e instanceof Error ? e.message : "verification failed",
    });
  }
});

app.post("/api/agents/:id/run", async (req, res) => {
  const row = supabase
    ? (await supabase.from("agents").select("id, name, creator_id").eq("id", req.params.id).single()).data
    : null;
  if (!row || !row.creator_id) return res.status(404).json({ error: "Agent not found" });
  const agent = { id: row.id, name: row.name };

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
  // clone 用 URL の末尾 .git は GitHub API で 404 になるため除去
  ownerRepo = ownerRepo.replace(/\.git$/i, "").replace(/\/+$/, "").trim();
  if (!ownerRepo.includes("/")) {
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
  let resolvedCreatorId =
    creator_id != null && String(creator_id).trim() !== "" ? String(creator_id).trim() : null;
  if (!resolvedCreatorId) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && user?.id) resolvedCreatorId = user.id;
    }
  }
  if (!resolvedCreatorId) {
    return res.status(400).json({
      error:
        "creator_id is required. Open the dashboard while logged in and use Add agent, or paste your creator ID.",
    });
  }
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const githubRepoVal = github_repo && typeof github_repo === "string" ? github_repo.trim() || null : null;
  const row = {
    id,
    name: name.trim(),
    category: category != null ? String(category).trim() : null,
    short_description: shortDescription != null ? String(shortDescription).trim() : null,
    price_per_run: typeof pricePerRun === "number" ? pricePerRun : parseInt(pricePerRun, 10) || 0,
    system_prompt: system_prompt && typeof system_prompt === "string" ? system_prompt.trim() : "You are a helpful assistant.",
    creator_id: resolvedCreatorId,
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
  const { name, category, shortDescription, pricePerRun, system_prompt, ui_variant } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (category !== undefined) updates.category = String(category).trim() || null;
  if (shortDescription !== undefined) updates.short_description = String(shortDescription).trim() || null;
  if (pricePerRun !== undefined) updates.price_per_run = typeof pricePerRun === "number" ? pricePerRun : parseInt(pricePerRun, 10) || 0;
  if (system_prompt !== undefined) updates.system_prompt = String(system_prompt).trim() || "You are a helpful assistant.";
  if (ui_variant !== undefined) updates.ui_variant = String(ui_variant).trim() || null;
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

