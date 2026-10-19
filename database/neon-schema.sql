-- ELS SCHOOL MANAGER — schéma de départ PostgreSQL pour Neon.
-- À exécuter UNE SEULE FOIS sur un projet Neon neuf.
-- Ne pas exécuter sur la base d'une école en production sans sauvegarde.
-- Les mots de passe doivent être stockés sous forme de hash côté serveur (scrypt),
-- jamais en clair. Les requêtes doivent toujours vérifier l'appartenance à l'école.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 120),
  slug text not null unique,
  academic_year text not null default '2026-2027',
  status text not null default 'trial' check (status in ('trial','active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null default 'school_director'
    check (role in ('school_director','teacher','accountant','secretary')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id,user_id)
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  level text not null check (level in ('CI','CP','CE1','CE2','CM1','CM2')),
  academic_year text not null default '2026-2027',
  created_at timestamptz not null default now(),
  unique (school_id,name,academic_year)
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_number text not null,
  first_name text not null,
  last_name text not null,
  gender text check (gender in ('F','M')),
  class_id uuid references classes(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','transferred','graduated','inactive')),
  created_at timestamptz not null default now(),
  unique (school_id,student_number)
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('present','absent','late','excused')),
  note text,
  recorded_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id,student_id,attendance_date)
);

create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject text not null,
  term text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 20),
  coefficient numeric(5,2) not null default 1 check (coefficient > 0),
  comment text,
  recorded_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  receipt_number text not null,
  amount_xof bigint not null check (amount_xof > 0),
  payment_method text not null
    check (payment_method in ('cash','mobile_money','bank_transfer','other')),
  paid_at timestamptz not null default now(),
  note text,
  recorded_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id,receipt_number)
);

-- Catalogue des forfaits mensuels (FCFA / XOF).
-- Les limites sont contrôlées côté serveur au moment de l'inscription d'un élève.
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

-- Abonnement du logiciel par établissement, distinct des frais scolaires des élèves.
create table if not exists school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references schools(id) on delete cascade,
  plan_code text not null default 'essentiel'
    references subscription_plans(code),
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

-- Créer un abonnement par défaut pour les établissements actuels et futurs.
insert into school_subscriptions (school_id, plan_code, status, monthly_price_xof, student_limit)
select s.id, 'essentiel', 'trial', 5000, 100
from schools s
on conflict (school_id) do nothing;

create or replace function create_default_school_subscription()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into school_subscriptions (school_id, plan_code, status, monthly_price_xof, student_limit)
  values (new.id, 'essentiel', 'trial', 5000, 100)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists schools_create_default_subscription on schools;
create trigger schools_create_default_subscription
after insert on schools
for each row execute procedure create_default_school_subscription();

create or replace function enforce_school_student_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  active_count integer;
  max_students integer;
  subscription_found boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text, 0));

  select ss.student_limit, true
    into max_students, subscription_found
  from school_subscriptions ss
  where ss.school_id = new.school_id;

  if not coalesce(subscription_found, false) then
    raise exception 'SUBSCRIPTION_NOT_CONFIGURED: abonnement absent pour cet établissement';
  end if;

  if new.status = 'active' then
    select count(*)::integer into active_count
    from students st
    where st.school_id = new.school_id
      and st.status = 'active'
      and (tg_op = 'INSERT' or st.id <> new.id);

    if max_students is not null and active_count >= max_students then
      raise exception 'SUBSCRIPTION_LIMIT_REACHED: ce forfait est limité à % élèves actifs.', max_students;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists students_enforce_subscription_limit on students;
create trigger students_enforce_subscription_limit
before insert or update of school_id, status on students
for each row execute procedure enforce_school_student_limit();

create index if not exists students_school_name_idx on students(school_id,last_name,first_name);
create index if not exists classes_school_level_idx on classes(school_id,level);
create index if not exists attendance_school_date_idx on attendance(school_id,attendance_date);
create index if not exists grades_school_student_idx on grades(school_id,student_id);
create index if not exists fee_payments_school_date_idx on fee_payments(school_id,paid_at desc);
create index if not exists memberships_user_active_idx on school_memberships(user_id,active);

-- Sécurité applicative :
-- l'API Vercel authentifie les requêtes et contrôle l'appartenance à l'établissement.
-- Tester l'isolation entre plusieurs écoles avant d'importer de vraies données d'élèves.
