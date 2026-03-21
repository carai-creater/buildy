-- エンドユーザー向け UI の公開 URL（クリエイターが GitHub Pages 等でホスト）
-- 登録時に必須。先に docs/supabase-agents.sql で agents テーブルがあることを確認してください。

alter table if exists public.agents
  add column if not exists public_ui_url text;

comment on column public.agents.public_ui_url is 'ユーザーがエージェントを操作する HTTPS URL（GitHub 上のコードを動かすフロント）';
