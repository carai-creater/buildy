-- Buildy execute API が参照する agents テーブル（例）
-- Supabase SQL Editor で実行して作成してください。

create table if not exists public.agents (
  id text primary key,
  name text,
  system_prompt text not null default 'You are a helpful assistant.',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS を有効にする場合、service role で API から読むためポリシーは不要。
-- フロントから直接読む場合は select ポリシーを設定してください。
