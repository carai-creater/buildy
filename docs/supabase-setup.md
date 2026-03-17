# Supabase 新規プロジェクトの作成手順

Buildy でクリエイター登録・エージェント一覧を使うには、Supabase のプロジェクトが必要です。

## 1. プロジェクトを作成する

1. **Supabase にアクセス**  
   [https://supabase.com](https://supabase.com) を開き、ログイン（またはサインアップ）する。

2. **New project を開く**  
   ダッシュボードで **New project** をクリックする。

3. **組織を選ぶ**  
   既存の Organization を選ぶか、**Create a new organization** で新規作成する。

4. **プロジェクト情報を入力**
   - **Name**: プロジェクト名（例: `buildy`）
   - **Database Password**: データベース用の強めのパスワード（控えておく）
   - **Region**: 利用したいリージョン（例: Northeast Asia (Tokyo)）

5. **Create new project** をクリックし、プロビジョニングが終わるまで待つ（1〜2分程度）。

---

## 2. API キーと URL を取得する

1. 左メニューで **Project Settings**（歯車アイコン）を開く。
2. **API** を開く。
3. 以下を控える:
   - **Project URL** … 例: `https://xxxxxxxx.supabase.co`
   - **anon public** … フロント用（公開してもよいキー）
   - **service_role** … サーバー用（**絶対に公開しない**）

---

## 3. テーブルを作成する

1. 左メニューで **SQL Editor** を開く。
2. **New query** で新規クエリを作成する。
3. リポジトリの次のファイルの内容をコピーして実行する:
   - `docs/supabase-agents.sql` … `creators` と `agents` テーブルを作成
   - `docs/supabase-users.sql` … **マイページ（利用者）ログイン用**の `users` と `runs` テーブルを作成（メール/Google ログインを使う場合は必須）
   - （別ファイルで）`docs/supabase-creators.sql` は `supabase-agents.sql` に含まれているため不要

実行後、**Table Editor** で `creators` と `agents` ができていればOKです。マイページの「ログインできない」エラーが出る場合は、`supabase-users.sql` が未実行の可能性が高いので、上記のとおり実行してください。

---

## 4. 環境変数を設定する（.env は使わない）

秘密情報は **.env に置かず**、デプロイ先の環境変数のみで設定します。

### Vercel（推奨）

1. プロジェクト → **Settings** → **Environment Variables**
2. 次を追加する:
   - **SUPABASE_URL** … Project URL（例: `https://xxxx.supabase.co`）
   - **SUPABASE_SERVICE_ROLE_KEY** … Legacy の **service_role** キー
3. 再デプロイする。

ローカルで試す場合は `vercel dev` でプロジェクトをリンクすると、Vercel に登録した環境変数が注入されます。詳細は `docs/env-secrets.md` を参照。

---

## 参考

- [Supabase ドキュメント](https://supabase.com/docs)
- テーブル定義: `docs/supabase-agents.sql` / `docs/supabase-users.sql`
