# Buildy Landing Page

シンプルで洗練された、Buildy（ビルディ）のコンセプト紹介用ランディングページです。

## 概要

- **目的**: 「AIエージェントの民主化」を掲げるBuildyの世界観・価値提案を、Appleのようなミニマルで白ベース＋オレンジアクセントのUIで表現したWebサイトです。
- **構成**:
  - ヒーローセクション（コンセプトとエージェントの一例）
  - コンセプト説明（エコシステムの図解的テキスト）
  - エージェントのマーケットプレイス例
  - クリエイター向けの価値提案
  - 料金／導入イメージ

## セットアップと閲覧方法

依存ライブラリはなく、純粋なHTML＋CSSのみで構成されています。

```bash
cd /Users/rentaro/cursor/buildy3
open index.html   # macOS（トップは英語。日本語は index-ja.html）
```

もしくは、任意の静的ファイルサーバー（`python -m http.server` など）でルートディレクトリをホストしてブラウザでアクセスしてください。

## ファイル構成

- `index.html` — トップ（英語）
- `index-ja.html` — トップ（日本語）
- `index-en.html` — 互換用リダイレクト → `index.html`
- `styles.css` — レイアウト・タイポグラフィ・レスポンシブ対応等のスタイル

### English (deploy note)

If submitting a **new agent listing** returns **`database_schema`**, your Supabase `agents` table is missing columns. In **SQL Editor**, run `docs/supabase-agents-github-repo.sql` then `docs/supabase-agents-public-ui.sql` from this repo.

For **CSP / `connect-src`**: Supabase Realtime uses **`wss:`**. This repo’s `vercel.json` allows `https:` and `wss:` for fetches and websockets.

## Supabase（本番でエージェント追加が `database_schema` になる場合）

`agents` テーブルが古いままだと、`github_repo` / `public_ui_url` カラムがなく **503 + `database_schema`** になります。Supabase → **SQL Editor** で、リポジトリの次を **この順で** 実行してください。

1. `docs/supabase-agents-github-repo.sql`
2. `docs/supabase-agents-public-ui.sql`

（新規なら `docs/supabase-agents.sql` 一式から作っても構いません。）

## Content-Security-Policy（コンソールの connect-src）

ブラウザで Supabase Realtime 等が **WebSocket (`wss:`)** を使う場合、`connect-src` に `wss:` が必要です。`vercel.json` では `connect-src 'self' https: wss:` を指定しています。別ホストにデプロイする場合は同等の設定をしてください。

