-- ELS SCHOOL MANAGER - schéma initial minimal multi-écoles
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Tester les politiques avec deux comptes et deux écoles avant toute vraie donnée.

create extension if not exists pgcrypto;
create type public.school_role as enum ('school_director','teacher','accountant','secretary');
create type public.school_status as enum ('trial','active','suspended');

create table public.schools (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text not null unique,
 academic_year text not null default '2026-2027',
 status public.school_status not null default 'trial',
 created_at timestamptz not null default now()
);

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 created_at timestamptz not null default now()
);

create table public.school_memberships (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role public.school_role not null default 'school_director',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(school_id,user_id)
);

create table public.classes (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 name text not null,
 level text not null check(level in ('CI','CP','CE1','CE2','CM1','CM2')),
 academic_year text not null default '2026-2027',
 created_at timestamptz not null default now(),
 unique(school_id,name,academic_year)
);

create table public.students (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 student_number text not null,
 first_name text not null,
 last_name text not null,
 gender text check(gender in ('F','M')),
 class_id uuid references public.classes(id) on delete set null,
 status text not null default 'active' check(status in ('active','transferred','graduated','inactive')),
 created_at timestamptz not null default now(),
 unique(school_id,student_number)
);

create table public.attendance (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 attendance_date date not null default current_date,
 status text not null check(status in ('present','absent','late','excused')),
 note text,
 recorded_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(school_id,student_id,attendance_date)
);

create table public.grades (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 subject text not null,
 term text not null,
 score numeric(5,2) not null check(score >= 0 and score <= 20),
 coefficient numeric(5,2) not null default 1 check(coefficient > 0),
 comment text,
 recorded_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create table public.fee_payments (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete restrict,
 receipt_number text not null,
 amount_xof bigint not null check(amount_xof > 0),
 payment_method text not null check(payment_method in ('cash','mobile_money','bank_transfer','other')),
 paid_at timestamptz not null default now(),
 note text,
 recorded_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(school_id,receipt_number)
);

create index students_school_name_idx on public.students(school_id,last_name,first_name);
create index classes_school_level_idx on public.classes(school_id,level);
create index attendance_school_date_idx on public.attendance(school_id,attendance_date);
create index grades_school_student_idx on public.grades(school_id,student_id);
create index fee_payments_school_date_idx on public.fee_payments(school_id,paid_at desc);

create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.school_memberships m
 where m.school_id=target_school and m.user_id=auth.uid() and m.active=true);
$$;

create or replace function public.has_school_role(target_school uuid, allowed_roles public.school_role[])
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.school_memberships m
 where m.school_id=target_school and m.user_id=auth.uid()
 and m.active=true and m.role=any(allowed_roles));
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,full_name)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict(id) do nothing;
 return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Un utilisateur connecté peut créer son premier établissement via cette fonction.
-- Le rôle directeur est attribué uniquement par cette fonction, pas depuis le navigateur.
create or replace function public.create_school_for_current_user(school_name text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_school_id uuid; clean_name text; new_slug text;
begin
 if auth.uid() is null then raise exception 'Connexion requise'; end if;
 clean_name := trim(school_name);
 if length(clean_name) < 3 or length(clean_name) > 120 then raise exception 'Le nom doit contenir entre 3 et 120 caractères'; end if;
 if exists(select 1 from public.school_memberships where user_id=auth.uid() and active=true) then
   raise exception 'Ce compte est déjà lié à un établissement';
 end if;
 new_slug := trim(both '-' from regexp_replace(lower(clean_name),'[^a-z0-9]+','-','g')) || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
 insert into public.schools(name,slug) values(clean_name,new_slug) returning id into new_school_id;
 insert into public.school_memberships(school_id,user_id,role) values(new_school_id,auth.uid(),'school_director');
 return new_school_id;
end;
$$;
revoke all on function public.create_school_for_current_user(text) from public;
grant execute on function public.create_school_for_current_user(text) to authenticated;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.grades enable row level security;
alter table public.fee_payments enable row level security;

create policy "members can read their school" on public.schools for select to authenticated using(public.is_school_member(id));
create policy "users can read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "users can update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "users can read own memberships" on public.school_memberships for select to authenticated using(user_id=auth.uid() or public.is_school_member(school_id));

create policy "members read classes" on public.classes for select to authenticated using(public.is_school_member(school_id));
create policy "staff manage classes" on public.classes for all to authenticated
using(public.has_school_role(school_id,array['school_director','secretary']::public.school_role[]))
with check(public.has_school_role(school_id,array['school_director','secretary']::public.school_role[]));

create policy "members read students" on public.students for select to authenticated using(public.is_school_member(school_id));
create policy "authorized staff manage students" on public.students for all to authenticated
using(public.has_school_role(school_id,array['school_director','secretary']::public.school_role[]))
with check(public.has_school_role(school_id,array['school_director','secretary']::public.school_role[]));

create policy "staff read attendance" on public.attendance for select to authenticated using(public.is_school_member(school_id));
create policy "teachers manage attendance" on public.attendance for all to authenticated
using(public.has_school_role(school_id,array['school_director','teacher','secretary']::public.school_role[]))
with check(public.has_school_role(school_id,array['school_director','teacher','secretary']::public.school_role[]));

create policy "staff read grades" on public.grades for select to authenticated using(public.is_school_member(school_id));
create policy "teachers manage grades" on public.grades for all to authenticated
using(public.has_school_role(school_id,array['school_director','teacher']::public.school_role[]))
with check(public.has_school_role(school_id,array['school_director','teacher']::public.school_role[]));

create policy "accounting read fee payments" on public.fee_payments for select to authenticated
using(public.has_school_role(school_id,array['school_director','accountant']::public.school_role[]));
create policy "accounting manage fee payments" on public.fee_payments for all to authenticated
using(public.has_school_role(school_id,array['school_director','accountant']::public.school_role[]))
with check(public.has_school_role(school_id,array['school_director','accountant']::public.school_role[]));

-- Sécurité : ne jamais exposer la clé service_role dans l'application front-end.
-- Avant lancement réel : tester l'isolation entre deux écoles, les permissions par rôle,
-- la sauvegarde, la conservation des données et les exigences applicables au Bénin.


-- Vérifications supplémentaires : empêcher d'associer des données de deux écoles.
create or replace function public.validate_student_class_school()
returns trigger language plpgsql set search_path=public
as $$
begin
 if new.class_id is not null and not exists(
   select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id
 ) then raise exception 'La classe sélectionnée appartient à un autre établissement'; end if;
 return new;
end;
$$;
create trigger students_class_school_guard before insert or update of class_id,school_id on public.students
for each row execute procedure public.validate_student_class_school();

create or replace function public.validate_related_student_school()
returns trigger language plpgsql set search_path=public
as $$
begin
 if not exists(select 1 from public.students s where s.id=new.student_id and s.school_id=new.school_id) then
   raise exception 'Cet élève appartient à un autre établissement';
 end if;
 return new;
end;
$$;
create trigger attendance_student_school_guard before insert or update of student_id,school_id on public.attendance
for each row execute procedure public.validate_related_student_school();
create trigger grades_student_school_guard before insert or update of student_id,school_id on public.grades
for each row execute procedure public.validate_related_student_school();
create trigger fee_payments_student_school_guard before insert or update of student_id,school_id on public.fee_payments
for each row execute procedure public.validate_related_student_school();
