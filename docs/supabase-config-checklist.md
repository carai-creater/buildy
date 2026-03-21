# Supabase 設定の見直しチェックリスト

Buildy で Supabase を使うときに、次を順に確認してください。

---

## 1. 環境変数（Vercel で必須）

| 変数名 | どこで使う | 取得場所（Supabase） |
|--------|-------------|----------------------|
| **SUPABASE_URL** | サーバー・クライアント両方 | Project Settings → API → **Project URL** |
| **SUPABASE_SERVICE_ROLE_KEY** | サーバーのみ（DB・Auth 検証） | 同上 → **service_role**（secret） |
| **SUPABASE_ANON_KEY** | クライアント（Google・パスワード認証） | 同上 → **anon public** |

- **SUPABASE_URL** と **SUPABASE_SERVICE_ROLE_KEY** がないと**エージェント一覧・クリエイター登録・マイページ**などが動きません。
- **SUPABASE_ANON_KEY** がないと、クリエイター登録で「**Googleで登録**」と「**メール・パスワード**」のフォームが表示されず、名前＋メールのみの簡易登録になります。

**Vercel での設定:** プロジェクト → Settings → Environment Variables で上記3つを追加し、**保存後に Redeploy** する。

---

## 2. テーブルが作成されているか

Supabase の **SQL Editor** で次を実行済みか確認する。

| ファイル | 作られるテーブル | 必要な機能 |
|----------|------------------|------------|
| `docs/supabase-agents.sql` | `creators`, `agents` | クリエイター登録（簡易）, エージェント一覧・追加・実行 |
| `docs/supabase-users.sql` | `users`, `runs` | マイページ（利用者）ログイン、実行履歴 |
| `docs/supabase-agents-github-repo.sql` | `agents.github_repo` カラム追加 | GitHub リポジトリ連携（任意） |

**Table Editor** で `creators` と `agents` が存在するか確認。マイページで「Could not find the table 'public.users'」が出る場合は `supabase-users.sql` を実行する。

---

## 2.1 Security Advisor で「RLS Disabled in Public」が出ている場合

Supabase の **Security Advisor** で `public.creators` と `public.agents` に RLS 無効の警告が出たら、**SQL Editor** で `docs/supabase-enable-rls.sql` を実行する。RLS を有効にしても、Buildy のサーバーは **service_role** で接続しているため RLS を通過せず、これまでどおり動作する。

---

## 3. 接続確認

デプロイ後のサイトで **`https://あなたのドメイン/api/config`** を開く。

- **supabaseLinked: true** … サーバーから Supabase に接続できている（URL + service_role が効いている）
- **supabaseClientReady: true** … フロントで Google・パスワード認証が使える（anon キーも設定済み）
- **envHint** にメッセージがある … 表示された内容に従って不足している環境変数を追加し、再デプロイする

---

## 4. Google ログインを使う場合の追加設定

1. Supabase ダッシュボード → **Auth → Providers → Google** を有効化し、Client ID / Secret を設定する。
2. **Auth → URL Configuration** の **Redirect URLs** に、アプリのコールバック URL を追加する（例: `https://あなたのドメイン/auth-callback.html`）。
3. Google Cloud Console の OAuth 同意画面で、**認証リダイレクト URI** に Supabase の Callback URL（`https://xxxx.supabase.co/auth/v1/callback`）を登録する。

詳細は `docs/supabase-auth-email.md` を参照。

---

## 5. コード側で参照している変数名（変更しないこと）

- **server.js**: `SUPABASE_URL` または `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY` または `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **lib/supabase-server.ts**（Next.js 用）: `NEXT_PUBLIC_SUPABASE_URL` または `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`

Vercel では **SUPABASE_URL** / **SUPABASE_SERVICE_ROLE_KEY** / **SUPABASE_ANON_KEY** の3つを設定すれば、サーバー・クライアントともに動作します。
