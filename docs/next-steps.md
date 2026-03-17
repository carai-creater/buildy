# 次にやることチェックリスト

## 必須（動かすために）

### 1. Supabase のテーブルを作る
まだなら、Supabase の **SQL Editor** で順に実行する。

- `docs/supabase-creators.sql` … クリエイター用
- `docs/supabase-agents.sql` … エージェント用（creators のあと）
- `docs/supabase-users.sql` … 利用者・利用履歴用

### 2. 環境変数を設定する（Vercel など）
**Settings → Environment Variables** で次を設定。

| 変数名 | どこで見るか |
|--------|----------------|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上 → service_role（secret） |
| `SUPABASE_ANON_KEY` | 同上 → anon public（メール認証・Google 用） |

- メール認証や Google ログインを使う場合だけ **SUPABASE_ANON_KEY** を追加すればよい。
- 詳細: `docs/env-secrets.md`

### 3. メール認証・Google を使う場合の Supabase 設定
- **Auth → URL Configuration** の **Redirect URLs** に  
  `https://あなたのドメイン/auth-callback.html` と  
  `http://localhost:3000/auth-callback.html` を追加。
- **Google ログイン** を使うなら **Auth → Providers → Google** で Client ID / Secret を設定し、  
  Google Cloud の「承認済みリダイレクト URI」に Supabase の Callback URL を追加。  
  → 手順は `docs/supabase-auth-email.md` の「Google ログイン」参照。

### 4. デプロイして動作確認
- 変更を push して Vercel でデプロイ。
- クリエイター登録（メール or Google）→ ダッシュボード表示。
- 利用者マイページのログイン（メール or Google）→ 利用したエージェント表示（トップで実行すると履歴に残る）。

---

## 任意（やるとよいこと）

- **メールテンプレート**: Supabase の **Auth → Email Templates** で「Confirm signup」の文面を編集。
- **収益まわり**: いまは総実行数・総売上は 0。決済（Stripe 等）を入れると実際の売上を反映できる。
- **パスワードリセット**: Supabase Auth の「Recovery」で「パスワードを忘れた」フローを追加可能。
- **本番ドメイン**: Vercel のカスタムドメインを設定したら、Supabase の Redirect URLs と Google の「承認済みの JavaScript 生成元」に本番 URL を追加する。

---

## 困ったとき

- 登録しても反応がない → ブラウザの開発者ツールの **Network** で `/api/creators/register` や `/api/config` のレスポンスを確認。503 なら Supabase の URL/キー未設定の可能性。
- Google ログインでエラー → Redirect URL が Supabase と Google で一致しているか確認。`docs/supabase-auth-email.md` の手順を再確認。
