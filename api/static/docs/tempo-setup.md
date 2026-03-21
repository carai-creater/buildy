# Tempo 決済（Buildy）

有料エージェントの支払いは次のいずれかです。

- **推奨（一般ユーザー向け）**: [Stripe Checkout](./stripe-setup.md) で **カード**（`STRIPE_SECRET_KEY` 設定時、チェックアウト画面のボタンから）。
- **暗号資産向け**: [Tempo](https://tempo.xyz/) 上の TIP-20 と `transferWithMemo`。

**無料エージェント**も同じチェックアウト画面を通り、`POST /api/payments/tempo/confirm-free` で利用権を発行します（オンチェーン送金なし）。

## 1. Supabase テーブル

`docs/supabase-tempo-payments.sql` を SQL Editor で実行してください。

クリエイターが **ユーザー向け UI の URL** を登録するには `docs/supabase-agents-public-ui.sql`（`public_ui_url` カラム）も実行してください。

エージェントごとの Buildy 内フォールバック UI は `docs/supabase-agent-ui-variant.sql`（任意、`ui_variant`: `chat` / `research`）。`public_ui_url` がある場合はチェックアウト後にそちらへ誘導されます。

## 2. 環境変数（Vercel / サーバー）

| 変数 | 説明 |
|------|------|
| `BUILDY_ACCESS_TOKEN_SECRET` | **必須** ランダムな長い文字列（チェックアウト後トークン署名） |
| `BUILDY_TEMPO_RECEIVER` | **有料エージェントに必須** 受取 EVM アドレス（0x…） |
| `OPENAI_API_KEY` | LLM 実行に必須 |
| `TEMPO_RPC_URL` | 省略時は `TEMPO_CHAIN_ID` に応じたデフォルト RPC |
| `TEMPO_CHAIN_ID` | `4217`（Mainnet）または `42431`（Testnet）。省略時 `42431` |
| `TEMPO_TIP20_ADDRESS` | 省略時 pathUSD `0x20c0…000` |
| `BUILDY_JPY_PER_USD` | 円→ドル換算（省略時 `150`） |

## 3. 利用フロー

1. `pay.html?agent=...` で `POST /api/payments/tempo/intent` → `checkoutKind`: `tempo` または `free`
2. **有料**: ウォレットで `transferWithMemo` → `POST /api/payments/tempo/verify`
3. **無料**: 「チェックアウト完了」→ `POST /api/payments/tempo/confirm-free`
4. 返却された `accessToken` を保存し、`public_ui_url` があるエージェントは **クリエイター提供 UI** へリダイレクト（URL ハッシュにトークン付与）。未設定のレガシー向けに `agent-use.html` から `X-Buildy-Access-Token` 付きで `POST /api/agent/execute` も可。詳細は [creator-ui.md](./creator-ui.md)。

Vercel では `/api` が Express に集約されるため、**`POST /api/agent/execute` は `server.js` 内でも実装**しています（Next の Route と同等の処理）。

## 4. ローカル開発

```bash
npm run dev
```

`next dev` を併用しなくても、上記のとおり Express から execute できます。
