# Stripe（カード決済）

一般ユーザーが **クレジット／デビットカード** でエージェントを購入できるようにするための設定です（Stripe Checkout）。

## 1. Stripe でアカウント・商品準備

1. [Stripe](https://stripe.com/) に登録し、ダッシュボードを開く。
2. **Developers → API keys** で **Secret key**（`sk_test_...` / 本番は `sk_live_...`）を取得。

## 2. 環境変数（Vercel / サーバー）

| 変数 | 説明 |
|------|------|
| `STRIPE_SECRET_KEY` | **必須** Stripe のシークレットキー |
| `BUILDY_ACCESS_TOKEN_SECRET` | **必須** 決済後トークン署名用（Tempo / 無料チェックアウトと共通） |
| `BUILDY_PUBLIC_URL` | **推奨** 本番のオリジン（例: `https://your-app.vercel.app`）。未設定時はリクエストヘッダから推定 |

## 3. 利用フロー

1. ユーザーが `pay.html` / `pay-en.html` で **「カードで支払う（Stripe）」** を押す。
2. `POST /api/payments/stripe/create-checkout-session` が Checkout URL を返す。
3. 支払い成功後、Stripe が `success_url`（`?paid=stripe&session_id=...`）にリダイレクト。
4. ページが `POST /api/payments/stripe/complete` でセッションを検証し、`tempo_access_grants` に記録してアクセストークンを返す。
5. 既存どおり `agent-use` から `X-Buildy-Access-Token` で実行。

## 4. 本番の注意

- **Webhook**（`checkout.session.completed`）で fulfillment する構成にすると、リダイレクト失敗時も安全です。現状は **成功 URL 戻り** 前提の MVP です。
- 日本向けに **Link / コンビニ** などを足す場合は Stripe ダッシュボードと API の `payment_method_types` を調整してください。

## 5. 無料エージェント

`price_per_run === 0` は Stripe セッションを作りません。画面の **無料チェックアウト** を使います。
