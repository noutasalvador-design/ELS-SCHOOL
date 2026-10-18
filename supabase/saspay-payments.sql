-- ELS SCHOOL MANAGER — ledger SasPay et activation serveur des forfaits.
-- Exécuter après supabase/schema.sql et supabase/subscription-plans.sql.
-- Ne jamais donner de politiques d'écriture à la clé navigateur pour ces tables.

begin;

create table if not exists public.school_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  plan_code text not null references public.subscription_plans(code),
  amount_xof integer not null check (amount_xof > 0),
  currency char(3) not null default 'XOF' check (currency = 'XOF'),
  reference text not null unique,
  provider text not null default 'SasPay' check (provider = 'SasPay'),
  provider_session_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists school_payment_transactions_school_created_idx
  on public.school_payment_transactions(school_id, created_at desc);
create index if not exists school_payment_transactions_status_created_idx
  on public.school_payment_transactions(status, created_at desc);

alter table public.school_payment_transactions enable row level security;
-- Aucune politique navigateur : seules les fonctions serveur utilisant la service_role
-- peuvent créer/mettre à jour les transactions. Ne jamais exposer cette clé au frontend.

commit;
