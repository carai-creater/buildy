-- GitHub リポジトリ連携用カラム追加（既存プロジェクト用）
-- Supabase SQL Editor で実行してください。

alter table if exists public.agents
  add column if not exists github_repo text;

comment on column public.agents.github_repo is 'GitHub リポジトリ（owner/repo または https://github.com/owner/repo）';
