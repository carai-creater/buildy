# Tempo 決済（Buildy）

有料エージェント（`price_per_run` &gt; 0）の利用に、[Tempo](https://tempo.xyz/) 上の TIP-20 ステーブルコイン（例: pathUSD）と `transferWithMemo` を使います。

## 1. Supabase テーブル

`docs/supabase-tempo-payments.sql` を SQL Editor で実行してください。

## 2. 環境変数（Vercel / サーバー）

| 変数 | 説明 |
|------|------|
| `BUILDY_TEMPO_RECEIVER` | **必須（有料時）** Buildy が受け取る EVM アドレス（0x…） |
| `BUILDY_ACCESS_TOKEN_SECRET` | **必須（有料時）** ランダムな長い文字列（アクセストークン署名用） |
| `TEMPO_RPC_URL` | 省略時: Mainnet `https://rpc.tempo.xyz` / Testnet `https://rpc.moderato.tempo.xyz`（`TEMPO_CHAIN_ID` に応じて） |
| `TEMPO_CHAIN_ID` | `4217`（Mainnet）または `42431`（Moderato Testnet）。省略時は `42431` |
| `TEMPO_TIP20_ADDRESS` | 省略時は pathUSD `0x20c0000000000000000000000000000000000000` |
| `BUILDY_JPY_PER_USD` | 円→ドル換算の参考レート（省略時 `150`） |

テストネットでは [Chainstack の手順](https://docs.chainstack.com/docs/tempo-tutorial-first-payment-app) のとおり `tempo_fundAddress` でテスト用トークンを取得できます。

## 3. 利用フロー

1. ユーザーが `pay.html?agent=...` でインテント作成 → ウォレットで `transferWithMemo`（メモは注文 ID）
2. `verify` でチェーン上のレシートを検証 → `tempo_access_grants` に保存 → ブラウザに短期アクセストークン
3. `agent-use.html` が `X-Buildy-Access-Token` 付きで `POST /api/agent/execute` を呼ぶ（Next.js 側で利用権を消費）

無料エージェントは `pay` が自動で `agent-use` にリダイレクトし、`execute` はトークン不要です。

## 4. ローカル開発

- `POST /api/payments/tempo/*` と `GET /api/agents` は Express（`server.js`）経由
- **実 LLM 実行**は `next dev` の `POST /api/agent/execute` が必要です

```bash
npm run dev:next   # 別ターミナルで execute 用
npm run dev        # 静的 + API
```
