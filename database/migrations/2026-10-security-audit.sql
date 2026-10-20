-- ELS SCHOOL MANAGER — sécurité, journal d’activité et limites de connexion.
-- Idempotent : peut être rejoué sans supprimer les données existantes.
begin;
create table if not exists auth_rate_limits (
  id bigserial primary key,
  action text not null check (action in ('login','signup')),
  ip_hash text not null,
  identity_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_rate_limits_lookup_idx
  on auth_rate_limits(action,ip_hash,identity_hash,created_at desc);
create index if not exists auth_rate_limits_cleanup_idx on auth_rate_limits(created_at);

create table if not exists platform_admin_audit (
  id bigserial primary key,
  actor_email text not null,
  action text not null,
  school_id uuid references schools(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_admin_audit_created_idx on platform_admin_audit(created_at desc);

create table if not exists school_activity_log (
  id bigserial primary key,
  school_id uuid not null references schools(id) on delete cascade,
  actor_user_id uuid references app_users(id) on delete set null,
  actor_email text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists school_activity_log_school_created_idx on school_activity_log(school_id,created_at desc);
delete from auth_rate_limits where created_at < now() - interval '2 days';
commit;
