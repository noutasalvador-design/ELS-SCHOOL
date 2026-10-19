-- ELS SCHOOL MANAGER: frais scolaires et soldes par élève.
-- Exécuter une seule fois sur la base Neon existante.
create table if not exists school_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  amount_xof bigint not null check (amount_xof > 0),
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  academic_year text not null,
  due_date date,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((class_id is not null and student_id is null) or (class_id is null and student_id is not null))
);
create index if not exists school_fee_assignments_school_idx on school_fee_assignments(school_id, academic_year);
create index if not exists school_fee_assignments_student_idx on school_fee_assignments(student_id);
