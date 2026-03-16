import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
      data: { method: req.method, path: req.path, url: req.url },
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

const agents = [
  {
    id: "market-research",
    name: "市場調査エージェント",
    category: "市場調査",
    shortDescription:
      "Web検索から競合比較・インサイト要約まで、自律的にレポートを作成します。",
    pricePerRun: 500,
    hero: true,
  },
  {
    id: "sns-ops",
    name: "SNS運用エージェント",
    category: "SNS運用",
    shortDescription:
      "投稿案・ハッシュタグ・投稿カレンダーを、自社トーンに合わせて自動生成します。",
    pricePerRun: 300,
  },
  {
    id: "code-review",
    name: "コードレビューエージェント",
    category: "開発・QA",
    shortDescription:
      "GitHubリポジトリを解析し、改善ポイントや潜在バグをコメント形式で提案します。",
    pricePerRun: 800,
  },
];

app.use(express.static(__dirname));

app.get("/api/agents", (_req, res) => {
  res.json({ agents });
});

app.get("/api/agents/:id", (req, res) => {
  const agent = agents.find((a) => a.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json({ agent });
});

app.post("/api/agents/:id/run", (req, res) => {
  const agent = agents.find((a) => a.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const { query } = req.body || {};
  const safeQuery = typeof query === "string" && query.trim() ? query.trim() : "指定なし";

  const runId = `run_${Date.now()}`;

  const startedAt = new Date().toISOString();

  const estimatedMinutes = agent.id === "market-research" ? 3 : 1;

  const mockReport =
    agent.id === "market-research"
      ? {
          title: "市場調査レポート（ダミー）",
          overview:
            "このレポートはデモ用のダミーです。実際にはWeb検索・情報整理・要約を自律的に行い、より詳細なレポートを生成します。",
          inputQuery: safeQuery,
          sections: [
            {
              heading: "1. 想定ターゲット市場",
              body: "日本国内のD2Cブランドを中心としたコスメ市場を対象とし、オンライン直販チャネルを主軸としています。",
            },
            {
              heading: "2. 代表的な競合プレイヤー（例）",
              body: "競合A社、競合B社、競合C社などを想定し、それぞれのポジショニング・価格帯・強みを比較します。",
            },
            {
              heading: "3. インサイト（例）",
              body: "ユーザーは成分の透明性と口コミを重視する傾向が強く、SNS上のUGCが購入意思決定に与える影響が大きいことが示唆されます。",
            },
          ],
        }
      : {
          title: `${agent.name} 実行結果（ダミー）`,
          overview:
            "この結果はバックエンド連携のデモ用です。実際の運用時には、外部APIやAIモデルと連携して結果を生成します。",
          inputQuery: safeQuery,
        };

  res.json({
    runId,
    agentId: agent.id,
    startedAt,
    estimatedMinutes,
    status: "completed",
    report: mockReport,
  });
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

// Vercel ではサーバーレスとして api/index.js から使うため listen しない
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Buildy backend listening on http://localhost:${PORT}`);
  });
}

export default app;

