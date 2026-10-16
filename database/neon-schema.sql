-- ELS SCHOOL MANAGER — schéma de départ PostgreSQL pour Neon.
-- À exécuter UNE SEULE FOIS sur un projet Neon neuf.
-- Ne pas exécuter sur la base d'une école en production sans sauvegarde.
-- Les mots de passe doivent être stockés sous forme de hash côté serveur (bcrypt/argon2),
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

-- Abonnement du logiciel par établissement, distinct des frais scolaires des élèves.
create table if not exists school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references schools(id) on delete cascade,
  plan_code text not null default 'essentiel'
    check (plan_code in ('essentiel','standard')),
  status text not null default 'trial'
    check (status in ('trial','active','past_due','cancelled','suspended')),
  monthly_price_xof integer not null default 3000 check (monthly_price_xof >= 0),
  currency char(3) not null default 'XOF',
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_school_name_idx on students(school_id,last_name,first_name);
create index if not exists classes_school_level_idx on classes(school_id,level);
create index if not exists attendance_school_date_idx on attendance(school_id,attendance_date);
create index if not exists grades_school_student_idx on grades(school_id,student_id);
create index if not exists fee_payments_school_date_idx on fee_payments(school_id,paid_at desc);
create index if not exists memberships_user_active_idx on school_memberships(user_id,active);

-- IMPORTANT:
-- Cette migration prépare le modèle de données Neon mais ne rend pas encore l'interface
-- React compatible avec Neon. L'API serveur doit authentifier chaque requête et contrôler
-- le membership school_id avant toute lecture/écriture. Ne pas y mettre de vraies données
-- d'élèves avant l'implémentation et les tests d'autorisation.
