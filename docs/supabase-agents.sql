-- Buildy execute API が参照する agents テーブル（例）
-- Supabase SQL Editor で実行して作成してください。
-- 先に docs/supabase-creators.sql で creators テーブルを作成してください。

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists public.agents (
  id text primary key,
  creator_id uuid references public.creators(id) on delete set null,
  name text not null,
  category text,
  short_description text,
  price_per_run int default 0,
  hero boolean default false,
  system_prompt text not null default 'You are a helpful assistant.',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS を有効にする場合、service role で API から読むためポリシーは不要。
