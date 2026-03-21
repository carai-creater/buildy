# クリエイター提供 UI（エンドユーザー向け）

Buildy にエージェントを登録するときは **GitHub リポジトリ** と、ユーザーが実際に操作する **公開 UI の URL**（`https://...`）の両方が必要です。  
LLM の実行は Buildy の API（`POST /api/agent/execute`）が行います。あなたの UI はその API を呼び出すだけです。

## チェックアウト後のトークン

ユーザーが Buildy でチェックアウトを完了すると、**クリエイター UI へリダイレクト**され、URL の **ハッシュ** に次が付きます。

```
https://your-site.example/app#buildy_access=TOKEN&buildy_agent=AGENT_ID
```

- `buildy_access` … 短時間有効なアクセストークン（そのまま保存しないでください）
- `buildy_agent` … エージェント ID

推奨: ページ読み込み時にハッシュをパースし、**自サイトの `sessionStorage` に保存したうえで `history.replaceState` で URL から消す**。

## API 呼び出し例

```javascript
const apiBase = "https://your-buildy-deployment.example"; // Buildy のオリジン
const token = sessionStorage.getItem("buildy_access"); // 上記ハッシュから保存した値
const agentId = sessionStorage.getItem("buildy_agent");

fetch(apiBase + "/api/agent/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Buildy-Access-Token": token,
  },
  body: JSON.stringify({
    agent_id: agentId,
    user_message: "ユーザーの入力",
    stream: false,
  }),
})
  .then((r) => r.json())
  .then(console.log);
```

CORS は Buildy の `/api/*` で許可されています（トークンはヘッダーで送る）。

## Buildy API のオリジン（クリエイター UI 側）

ホストが Buildy と別ドメインのとき、サンプル HTML では次のいずれかで API のベース URL を渡します。

- ページの `<head>` に  
  `<meta name="buildy-api-origin" content="https://your-buildy.vercel.app" />`
- またはクエリ `?buildy_api=https://your-buildy.vercel.app`（初回のみで `sessionStorage` に保存可能）

## サンプル

リポジトリ内の `docs/creator-ui-sample.html` を参考に、GitHub Pages 等に置いて URL を `public_ui_url` として登録できます。
