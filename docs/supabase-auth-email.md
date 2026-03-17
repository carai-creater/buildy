# クリエイター登録のメール認証・Googleログイン（Supabase Auth）

Supabase の **Auth** を使うと、登録時に「確認メール」を送ったり、**Google でログイン**を用意できます。

## やること

### 1. 環境変数

Vercel（またはサーバー）の環境変数に次を追加します。

| 変数名 | 説明 |
|--------|------|
| `SUPABASE_ANON_KEY` | Supabase ダッシュボードの **Project Settings → API** にある **anon / public** キー |

既存の `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` に加えて、この **anon key** を設定すると、クリエイター登録でメール認証フローが有効になります。

- **未設定の場合**: 従来どおり「表示名＋メールだけ」で即登録（メール認証なし）。
- **設定した場合**: 「表示名＋メール＋パスワード」でサインアップし、確認メール送信 → リンククリックで本人確認 → ダッシュボードへ。

### 2. Supabase ダッシュボード

1. **Auth → Providers** で **Email** を有効のままにし、必要なら **Confirm email** をオンにします（ホスト型では通常オン）。
2. **Auth → URL Configuration** の **Redirect URLs** に、次の URL を追加します。
   - 本番: `https://あなたのドメイン/auth-callback.html`
   - ローカル: `http://localhost:3000/auth-callback.html`
   - Vercel プレビュー: `https://*.vercel.app/auth-callback.html` など

リンククリック後、ここで指定した URL にリダイレクトされます。

### 3. メールテンプレート（任意）

**Auth → Email Templates** の **Confirm signup** を編集すると、確認メールの文面を変更できます。  
変数は [Supabase のドキュメント](https://supabase.com/docs/guides/auth/auth-email-templates) を参照してください。

### 4. Google ログイン（任意）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、**API とサービス → 認証情報** から **OAuth 2.0 クライアント ID**（タイプ: ウェブアプリケーション）を作成。
2. **承認済みの JavaScript 生成元** にサイトの URL（例: `https://あなたのドメイン`、`http://localhost:3000`）を追加。
3. **承認済みのリダイレクト URI** に Supabase のコールバック URL を追加。  
   Supabase ダッシュボード → **Auth → Providers → Google** に表示されている **Callback URL**（例: `https://xxxx.supabase.co/auth/v1/callback`）をそのまま Google に登録。
4. **クライアント ID** と **クライアントシークレット** を Supabase の **Auth → Providers → Google** に貼り付けて保存。

これでクリエイター登録・利用者マイページの「Googleで登録」「Googleでログイン」が有効になります。Redirect URLs には `auth-callback.html` と `auth-callback.html?next=user` を許可しておいてください。

### 5. 流れのまとめ

**メール認証**
1. ユーザーが「クリエイター登録」で表示名・メール・パスワードを入力して送信。
2. フロントで `supabase.auth.signUp()` を呼ぶ → Supabase が確認メールを送信。
3. ユーザーがメール内のリンクをクリック → `auth-callback.html` にリダイレクト。
4. `auth-callback.html` でセッションを確定し、`GET /api/creators/me` で `creators` テーブルに一行作成（または既存を返却）。
5. `buildy_creator_id` を保存し、`creator-dashboard.html` に遷移。

**Google ログイン**
1. ユーザーが「Googleで登録」または「Googleでログイン」をクリック。
2. `signInWithOAuth({ provider: 'google' })` で Google にリダイレクト。
3. 認証後、Supabase が `auth-callback.html`（利用者の場合は `?next=user`）にリダイレクト。`?code=...` またはハッシュでセッションを取得。
4. `exchangeCodeForSession` または `setSession` でセッション確定 → `/api/creators/me` または `/api/users/me` で DB 同期 → ダッシュボードまたはマイページへ。

## 注意

- **anon key** はクライアントに渡すため、RLS で「誰が何を読めるか」を正しく設定してください。  
  現在はサーバーが **service_role** で `creators` を操作しており、API 経由でのみ作成・取得しています。
- 既存の「メール認証なし」登録（`POST /api/creators/register`）は、anon key を**設定しない**限りそのまま使えます。
