-- クリエイター登録用テーブル（Supabase SQL Editor で実行）

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- メール重複防止（任意）
create unique index if not exists creators_email_key on public.creators (email);
