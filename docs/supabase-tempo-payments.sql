-- Tempo 決済インテントとアクセス権（Buildy）
-- Supabase SQL Editor で実行してください。

create table if not exists public.tempo_payment_intents (
  order_id text primary key,
  agent_id text not null,
  amount_usd_atomic text not null,
  memo_label text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_tempo_intents_agent on public.tempo_payment_intents (agent_id);
create index if not exists idx_tempo_intents_expires on public.tempo_payment_intents (expires_at);

create table if not exists public.tempo_access_grants (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  agent_id text not null,
  payer_wallet text not null,
  tx_hash text not null unique,
  amount_usd_atomic text not null,
  runs_remaining int not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_tempo_grants_agent on public.tempo_access_grants (agent_id);
create index if not exists idx_tempo_grants_expires on public.tempo_access_grants (expires_at);
