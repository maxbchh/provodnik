-- Журнал ДЖД: базовая схема и права доступа.
-- Выполнить целиком в Supabase Dashboard -> SQL Editor.
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'conductor' check (role in ('owner','teacher','conductor')),
  created_at timestamptz not null default now()
);
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  details text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  subject text not null,
  score integer check (score between 1 and 10),
  mark text not null default 'grade' check (mark in ('grade','Н')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  constraint grade_value_consistent check ((mark='Н' and score is null) or (mark='grade' and score is not null))
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  marked_by uuid not null references public.profiles(id),
  status text not null check (status in ('present','absent','late')),
  created_at timestamptz not null default now(),
  unique (lesson_id,student_id)
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create or replace function private.current_role()
returns text language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) $$;
revoke all on function private.current_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), split_part(new.email,'@',1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Безопасная передача роли учителя: вызвать может только владелец.
create or replace function public.set_teacher_role(target_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if private.current_role() <> 'owner' then
    raise exception 'Только начальник поезда может назначать учителей';
  end if;
  update public.profiles set role='teacher'
  where id=target_user_id and role='conductor';
  if not found then raise exception 'Проводник не найден или уже имеет другую роль'; end if;
end;
$$;
revoke all on function public.set_teacher_role(uuid) from public, anon;
grant execute on function public.set_teacher_role(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.grades enable row level security;
alter table public.attendance enable row level security;
alter table public.notes enable row level security;

drop policy if exists "profiles read authenticated" on public.profiles;
create policy "profiles read authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "profile insert self" on public.profiles;
create policy "profile insert self" on public.profiles for insert to authenticated with check (id=(select auth.uid()) and role='conductor');
drop policy if exists "owner update profiles" on public.profiles;
create policy "owner update profiles" on public.profiles for update to authenticated using ((select private.current_role())='owner') with check ((select private.current_role()) in ('owner','teacher','conductor'));

drop policy if exists "lessons read" on public.lessons;
create policy "lessons read" on public.lessons for select to authenticated using (true);
drop policy if exists "teachers manage lessons" on public.lessons;
create policy "teachers manage lessons" on public.lessons for all to authenticated using ((select private.current_role()) in ('owner','teacher')) with check ((select private.current_role()) in ('owner','teacher') and created_by=(select auth.uid()));

drop policy if exists "grades read own or staff" on public.grades;
create policy "grades read own or staff" on public.grades for select to authenticated using (student_id=(select auth.uid()) or (select private.current_role()) in ('owner','teacher'));
drop policy if exists "staff manage grades" on public.grades;
create policy "staff manage grades" on public.grades for all to authenticated using ((select private.current_role()) in ('owner','teacher')) with check ((select private.current_role()) in ('owner','teacher') and teacher_id=(select auth.uid()));

drop policy if exists "attendance read own or staff" on public.attendance;
create policy "attendance read own or staff" on public.attendance for select to authenticated using (student_id=(select auth.uid()) or (select private.current_role()) in ('owner','teacher'));
drop policy if exists "staff manage attendance" on public.attendance;
create policy "staff manage attendance" on public.attendance for all to authenticated using ((select private.current_role()) in ('owner','teacher')) with check ((select private.current_role()) in ('owner','teacher') and marked_by=(select auth.uid()));

drop policy if exists "notes read own or staff" on public.notes;
create policy "notes read own or staff" on public.notes for select to authenticated using (student_id=(select auth.uid()) or (select private.current_role()) in ('owner','teacher'));
drop policy if exists "staff manage notes" on public.notes;
create policy "staff manage notes" on public.notes for all to authenticated using ((select private.current_role()) in ('owner','teacher')) with check ((select private.current_role()) in ('owner','teacher') and author_id=(select auth.uid()));

grant select on public.profiles,public.lessons,public.grades,public.attendance,public.notes to authenticated;
grant insert,update on public.profiles to authenticated;
grant insert,update,delete on public.lessons,public.grades,public.attendance,public.notes to authenticated;

-- После первой регистрации владельца выполнить отдельно, подставив его email:
-- update public.profiles p set role='owner'
-- from auth.users u where u.id=p.id and u.email='ВАШ_EMAIL';

-- Включить таблицы в Realtime-публикацию для живой синхронизации между устройствами.
do $$
declare t text;
begin
  foreach t in array array['profiles','lessons','grades','attendance','notes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;