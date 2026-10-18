-- ELS SCHOOL MANAGER — ledger privé des paiements d'abonnement SasPay sur Neon.
-- À exécuter une fois après database/neon-schema.sql.
begin;
create table if not exists school_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  created_by uuid references app_users(id) on delete set null,
  plan_code text not null references subscription_plans(code),
  amount_xof integer not null check (amount_xof > 0),
  currency char(3) not null default 'XOF' check (currency = 'XOF'),
  reference text not null unique,
  provider_session_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  subscription_activated_at timestamptz
);
create index if not exists school_payment_transactions_school_created_idx
  on school_payment_transactions(school_id, created_at desc);
alter table school_subscriptions add column if not exists subscription_activated_at timestamptz;
commit;
