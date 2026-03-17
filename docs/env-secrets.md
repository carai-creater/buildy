# API キー・秘密情報の扱い（セキュア運用）

**.env ファイルは使用しません。** 秘密情報はすべてデプロイ先の「環境変数」のみで設定し、リポジトリに含めません。

## 方針

- **SUPABASE_SERVICE_ROLE_KEY** と **OPENAI_API_KEY** はサーバー専用。フロントや公開場所に一切出さない。
- 値の設定は **Vercel の Environment Variables**（または利用するホストの同等機能）のみで行う。
- ローカルで試す場合も、Vercel に登録した環境変数を `vercel env pull` で取り込むか、本番と同じく「プラットフォームの環境変数」だけに依存する。

## 設定する変数名（Vercel でだけ設定する）

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `SUPABASE_URL` | Supabase の Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role キー（Legacy） | `eyJ...` |
| `SUPABASE_ANON_KEY` | Supabase の anon / public キー（クリエイター登録の「Googleで登録」・メール・パスワード用。`/api/config` でクライアントに渡す） | `eyJ...` |
| `OPENAI_API_KEY` | OpenAI API キー（Next.js の execute 用） | `sk-...` |
| `OPENAI_MODEL` | 利用モデル（任意） | `gpt-4o-mini` |

**NEXT_PUBLIC_*** はクライアントに露出するため、**キー類には使わない**。URL だけ `NEXT_PUBLIC_SUPABASE_URL` で渡す必要がある場合は可。`SUPABASE_ANON_KEY` はメール認証を有効にする場合のみ設定し、`/api/config` 経由でクライアントに返します（詳細は `docs/supabase-auth-email.md`）。

## 設定手順（Vercel）

1. プロジェクト → **Settings** → **Environment Variables**
2. 上記の変数を **Production / Preview / Development** の必要な環境に追加
3. 再デプロイ

ローカルで `vercel dev` を使う場合、同じプロジェクトにリンクしていれば Vercel に登録した値が注入されます。**.env ファイルは作成しない**でください。
