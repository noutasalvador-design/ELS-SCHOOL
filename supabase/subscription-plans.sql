-- ELS SCHOOL MANAGER — forfaits mensuels et limites d'élèves pour l'application Supabase actuelle.
-- À exécuter dans Supabase > SQL Editor. Faire une sauvegarde avant toute migration de production.
-- Ce fichier n'active pas les paiements : il prépare le catalogue et impose les plafonds côté base.

begin;

create table if not exists public.subscription_plans (
  code text primary key check (code in ('essentiel','standard','illimite')),
  name text not null,
  monthly_price_xof integer not null check (monthly_price_xof >= 0),
  student_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint subscription_plans_student_limit_check check (student_limit is null or student_limit > 0)
);

insert into public.subscription_plans (code, name, monthly_price_xof, student_limit, active)
values
  ('essentiel','Essentiel',5000,100,true),
  ('standard','Standard',10000,300,true),
  ('illimite','Illimité',25000,null,true)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_xof = excluded.monthly_price_xof,
  student_limit = excluded.student_limit,
  active = true;

create table if not exists public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  plan_code text not null default 'essentiel' references public.subscription_plans(code),
  status text not null default 'trial'
    check (status in ('trial','active','past_due','cancelled','suspended')),
  monthly_price_xof integer not null default 5000 check (monthly_price_xof >= 0),
  student_limit integer default 100 check (student_limit is null or student_limit > 0),
  currency char(3) not null default 'XOF' check (currency = 'XOF'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Préserver les abonnements existants si le script est relancé.
insert into public.school_subscriptions (school_id,plan_code,status,monthly_price_xof,student_limit)
select s.id,'essentiel','trial',5000,100
from public.schools s
on conflict (school_id) do nothing;

-- Synchroniser les snapshots de prix/limite quand une école choisit un forfait.
create or replace function public.set_school_subscription_plan(
  target_school uuid,
  target_plan text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_plan public.subscription_plans%rowtype;
begin
  if auth.uid() is null or not public.has_school_role(
    target_school, array['school_director']::public.school_role[]
  ) then
    raise exception 'Seule la direction de cet établissement peut gérer son abonnement';
  end if;

  select * into selected_plan
  from public.subscription_plans
  where code = target_plan and active = true;

  if not found then
    raise exception 'Forfait inconnu ou désactivé';
  end if;

  -- Cette fonction ne confirme aucun paiement. Elle est réservée à une future intégration
  -- de facturation; l'interface publique ne doit pas l'appeler pour activer un forfait payant.
  update public.school_subscriptions
  set plan_code = selected_plan.code,
      monthly_price_xof = selected_plan.monthly_price_xof,
      student_limit = selected_plan.student_limit,
      updated_at = now()
  where school_id = target_school;
end;
$$;
revoke all on function public.set_school_subscription_plan(uuid,text) from public;
grant execute on function public.set_school_subscription_plan(uuid,text) to authenticated;

create or replace function public.create_default_school_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.school_subscriptions (school_id,plan_code,status,monthly_price_xof,student_limit)
  values (new.id,'essentiel','trial',5000,100)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists schools_create_default_subscription on public.schools;
create trigger schools_create_default_subscription
after insert on public.schools
for each row execute procedure public.create_default_school_subscription();

create or replace function public.enforce_school_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  max_students integer;
  subscription_found boolean;
begin
  -- Lock per school so two concurrent registrations cannot both pass the same limit.
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text, 0));

  select ss.student_limit, true
    into max_students, subscription_found
  from public.school_subscriptions ss
  where ss.school_id = new.school_id;

  if not coalesce(subscription_found, false) then
    raise exception 'SUBSCRIPTION_NOT_CONFIGURED: abonnement absent pour cet établissement';
  end if;

  if new.status = 'active' then
    select count(*)::integer into active_count
    from public.students st
    where st.school_id = new.school_id
      and st.status = 'active'
      and (tg_op = 'INSERT' or st.id <> new.id);

    if max_students is not null and active_count >= max_students then
      raise exception 'SUBSCRIPTION_LIMIT_REACHED: ce forfait est limité à % élèves actifs. Changez de forfait pour inscrire davantage d’élèves.', max_students;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists students_enforce_subscription_limit on public.students;
create trigger students_enforce_subscription_limit
before insert or update of school_id,status on public.students
for each row execute procedure public.enforce_school_student_limit();

alter table public.subscription_plans enable row level security;
alter table public.school_subscriptions enable row level security;

drop policy if exists "authenticated users can read subscription plans" on public.subscription_plans;
create policy "authenticated users can read subscription plans"
on public.subscription_plans for select to authenticated using (active = true);

drop policy if exists "school members can read their subscription" on public.school_subscriptions;
create policy "school members can read their subscription"
on public.school_subscriptions for select to authenticated
using (public.is_school_member(school_id));

-- Pas de politique INSERT/UPDATE/DELETE pour les utilisateurs : la direction ne peut pas
-- activer un forfait payant en modifiant directement son prix ou son statut depuis le navigateur.
grant select on public.subscription_plans to authenticated;
grant select on public.school_subscriptions to authenticated;

commit;
