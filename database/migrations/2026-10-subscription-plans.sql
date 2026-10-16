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

commit;

-- Le forfait Illimité conserve student_limit = NULL, sans plafond.
-- Le contrôle effectif du nombre d'élèves doit être implémenté côté API serveur.
