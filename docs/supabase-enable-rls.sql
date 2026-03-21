-- Row Level Security (RLS) を有効にする（Security Advisor の「RLS Disabled in Public」解消用）
-- Supabase SQL Editor で実行してください。
-- サーバーは service_role で接続しているため RLS を通過せず、従来どおり動作します。
-- anon / authenticated からはポリシー未設定のためこれらのテーブルに直接アクセスできません。

alter table if exists public.creators enable row level security;
alter table if exists public.agents enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.runs enable row level security;
