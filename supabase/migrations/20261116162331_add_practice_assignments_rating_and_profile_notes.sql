alter table public.conductors
  add column if not exists rating smallint not null default 0,
  add column if not exists profile_note text not null default '';

alter table public.conductors
  drop constraint if exists conductors_rating_range_check;
alter table public.conductors
  add constraint conductors_rating_range_check check (rating between 0 and 100);

alter table public.conductors
  drop constraint if exists conductors_profile_note_length_check;
alter table public.conductors
  add constraint conductors_profile_note_length_check check (char_length(profile_note) <= 500);

create table if not exists public.practice_days (
  id uuid primary key default gen_random_uuid(),
  practice_date date not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_assignments (
  id uuid primary key default gen_random_uuid(),
  practice_day_id uuid not null references public.practice_days(id) on delete cascade,
  wagon_no smallint not null check (wagon_no between 1 and 7),
  slot smallint not null check (slot between 1 and 2),
  conductor_id uuid not null references public.conductors(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint practice_assignments_slot_unique unique (practice_day_id, wagon_no, slot),
  constraint practice_assignments_conductor_unique unique (practice_day_id, conductor_id)
);

create index if not exists practice_assignments_day_idx
  on public.practice_assignments (practice_day_id, wagon_no, slot);
create index if not exists practice_assignments_conductor_idx
  on public.practice_assignments (conductor_id, practice_day_id);

alter table public.practice_days enable row level security;
alter table public.practice_assignments enable row level security;

grant select, insert, update, delete on public.practice_days to authenticated;
grant select, insert, update, delete on public.practice_assignments to authenticated;

drop policy if exists "practice days read authenticated" on public.practice_days;
create policy "practice days read authenticated"
  on public.practice_days for select to authenticated using (true);

drop policy if exists "lnp insert practice days" on public.practice_days;
create policy "lnp insert practice days"
  on public.practice_days for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update practice days" on public.practice_days;
create policy "lnp update practice days"
  on public.practice_days for update to authenticated
  using (app_private.is_lnp()) with check (app_private.is_lnp());

drop policy if exists "lnp delete practice days" on public.practice_days;
create policy "lnp delete practice days"
  on public.practice_days for delete to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp and assigned conductor read practice assignments" on public.practice_assignments;
create policy "lnp and assigned conductor read practice assignments"
  on public.practice_assignments for select to authenticated
  using (
    app_private.is_lnp()
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.conductor_id = practice_assignments.conductor_id
    )
  );

drop policy if exists "lnp insert practice assignments" on public.practice_assignments;
create policy "lnp insert practice assignments"
  on public.practice_assignments for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update practice assignments" on public.practice_assignments;
create policy "lnp update practice assignments"
  on public.practice_assignments for update to authenticated
  using (app_private.is_lnp()) with check (app_private.is_lnp());

drop policy if exists "lnp delete practice assignments" on public.practice_assignments;
create policy "lnp delete practice assignments"
  on public.practice_assignments for delete to authenticated
  using (app_private.is_lnp());
