alter table public.conductors
  drop column if exists profile_note,
  drop column if exists rating;

create table if not exists public.conductor_account_notes (
  conductor_id uuid primary key references public.conductors(id) on delete cascade,
  message text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint conductor_account_notes_length_check check (char_length(message) <= 500)
);

create table if not exists public.conductor_ratings (
  conductor_id uuid primary key references public.conductors(id) on delete cascade,
  rating smallint not null default 0 check (rating between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.conductor_account_notes enable row level security;
alter table public.conductor_ratings enable row level security;

grant select, insert, update, delete on public.conductor_account_notes to authenticated;
grant select, insert, update, delete on public.conductor_ratings to authenticated;

drop policy if exists "lnp and own conductor read account notes" on public.conductor_account_notes;
create policy "lnp and own conductor read account notes"
  on public.conductor_account_notes for select to authenticated
  using (
    app_private.is_lnp()
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.conductor_id = conductor_account_notes.conductor_id
    )
  );

drop policy if exists "lnp insert account notes" on public.conductor_account_notes;
create policy "lnp insert account notes"
  on public.conductor_account_notes for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update account notes" on public.conductor_account_notes;
create policy "lnp update account notes"
  on public.conductor_account_notes for update to authenticated
  using (app_private.is_lnp()) with check (app_private.is_lnp());

drop policy if exists "lnp delete account notes" on public.conductor_account_notes;
create policy "lnp delete account notes"
  on public.conductor_account_notes for delete to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp read all conductor ratings" on public.conductor_ratings;
create policy "lnp read all conductor ratings"
  on public.conductor_ratings for select to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp insert conductor ratings" on public.conductor_ratings;
create policy "lnp insert conductor ratings"
  on public.conductor_ratings for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update conductor ratings" on public.conductor_ratings;
create policy "lnp update conductor ratings"
  on public.conductor_ratings for update to authenticated
  using (app_private.is_lnp()) with check (app_private.is_lnp());

drop policy if exists "lnp delete conductor ratings" on public.conductor_ratings;
create policy "lnp delete conductor ratings"
  on public.conductor_ratings for delete to authenticated
  using (app_private.is_lnp());
