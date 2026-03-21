-- エージェントごとの利用画面タイプ（任意）
-- ui_variant: 'chat' | 'research' | 将来の種類を追加可能
-- 未設定時は名前に "research" が含まれると research、それ以外は chat になります。

alter table public.agents add column if not exists ui_variant text;

comment on column public.agents.ui_variant is 'Buildy 利用画面: chat（デフォルト） / research など';
