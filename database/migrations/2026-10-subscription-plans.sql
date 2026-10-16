-- ELS SCHOOL MANAGER: migration des forfaits mensuels.
-- À exécuter UNE SEULE FOIS sur une base Neon ayant déjà reçu l'ancien neon-schema.sql.
-- Sur une base neuve, exécuter database/neon-schema.sql à la place.

begin;

create table if not exists subscription_plans (
  code text primary key check (code in ('essentiel','standard','illimite')),
  name text not null,
  monthly_price_xof integer not null check (monthly_price_xof >= 0),
  student_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (student_limit is null or student_limit > 0)
);

insert into subscription_plans (code, name, monthly_price_xof, student_limit)
values
  ('essentiel', 'Essentiel', 5000, 100),
  ('standard', 'Standard', 10000, 300),
  ('illimite', 'Illimité', 25000, null)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_xof = excluded.monthly_price_xof,
  student_limit = excluded.student_limit,
  active = true;

alter table school_subscriptions
  add column if not exists student_limit integer default 100;

alter table school_subscriptions
  drop constraint if exists school_subscriptions_plan_code_check;

alter table school_subscriptions
  drop constraint if exists school_subscriptions_student_limit_check;

update school_subscriptions
set monthly_price_xof = case plan_code
      when 'essentiel' then 5000
      when 'standard' then 10000
      when 'illimite' then 25000
      else 5000
    end,
    student_limit = case plan_code
      when 'essentiel' then 100
      when 'standard' then 300
      when 'illimite' then null
      else 100
    end;

alter table school_subscriptions
  add constraint school_subscriptions_plan_code_check
  check (plan_code in ('essentiel','standard','illimite'));

alter table school_subscriptions
  add constraint school_subscriptions_student_limit_check
  check (student_limit is null or student_limit > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_subscriptions_plan_code_fkey'
      and conrelid = 'school_subscriptions'::regclass
  ) then
    alter table school_subscriptions
      add constraint school_subscriptions_plan_code_fkey
      foreign key (plan_code) references subscription_plans(code);
  end if;
end $$;


-- Backfill any schools that existed before subscription support.
insert into school_subscriptions (school_id, plan_code, status, monthly_price_xof, student_limit)
select s.id, 'essentiel', 'trial', 5000, 100
from schools s
on conflict (school_id) do nothing;

create or replace function create_default_school_subscription()
returns trigger language plpgsql security definer set search_path = public
as $
begin
  insert into school_subscriptions (school_id, plan_code, status, monthly_price_xof, student_limit)
  values (new.id, 'essentiel', 'trial', 5000, 100)
  on conflict (school_id) do nothing;
  return new;
end;
$;

drop trigger if exists schools_create_default_subscription on schools;
create trigger schools_create_default_subscription
after insert on schools
for each row execute procedure create_default_school_subscription();

create or replace function enforce_school_student_limit()
returns trigger language plpgsql security definer set search_path = public
as $
declare active_count integer; max_students integer; subscription_found boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text, 0));
  select ss.student_limit, true into max_students, subscription_found
  from school_subscriptions ss where ss.school_id = new.school_id;

  if not coalesce(subscription_found, false) then
    raise exception 'SUBSCRIPTION_NOT_CONFIGURED: abonnement absent pour cet établissement';
  end if;

  if new.status = 'active' then
    select count(*)::integer into active_count from students st
    where st.school_id = new.school_id and st.status = 'active'
      and (tg_op = 'INSERT' or st.id <> new.id);
    if max_students is not null and active_count >= max_students then
      raise exception 'SUBSCRIPTION_LIMIT_REACHED: ce forfait est limité à % élèves actifs.', max_students;
    end if;
  end if;
  return new;
end;
$;

drop trigger if exists students_enforce_subscription_limit on students;
create trigger students_enforce_subscription_limit
before insert or update of school_id, status on students
for each row execute procedure enforce_school_student_limit();

commit;

-- Le forfait Illimité conserve student_limit = NULL, sans plafond.
-- Le contrôle effectif du nombre d'élèves doit être implémenté côté API serveur.
