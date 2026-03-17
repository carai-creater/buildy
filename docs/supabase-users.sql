-- 購入者（ユーザー）と利用履歴用テーブル（Supabase SQL Editor で実行）
-- マイページ（利用者）のメール/Google ログインにはこのファイルの実行が必須です。
-- 先に docs/supabase-agents.sql で creators と agents を作成してください。

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamptz default now()
);

create unique index if not exists users_email_key on public.users (email);

-- ユーザーがエージェントを実行した履歴（「購入・利用した」の一覧に使う）
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  agent_id text not null,
  created_at timestamptz default now()
);

create index if not exists runs_user_id_idx on public.runs (user_id);
create index if not exists runs_agent_id_idx on public.runs (agent_id);
