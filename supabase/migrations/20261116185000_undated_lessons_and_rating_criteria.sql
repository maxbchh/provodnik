alter table public.lessons
  alter column starts_at drop not null;

create table if not exists public.conductor_rating_criteria (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conductor_rating_criteria_title_check
    check (char_length(btrim(title)) between 1 and 60)
);

create table if not exists public.conductor_metric_ratings (
  conductor_id uuid not null references public.conductors(id) on delete cascade,
  criterion_id uuid not null references public.conductor_rating_criteria(id) on delete cascade,
  score smallint not null check (score between 1 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (conductor_id, criterion_id)
);

create index if not exists conductor_metric_ratings_criterion_idx
  on public.conductor_metric_ratings (criterion_id);

alter table public.conductor_rating_criteria enable row level security;
alter table public.conductor_metric_ratings enable row level security;

grant select, insert, update, delete
  on public.conductor_rating_criteria, public.conductor_metric_ratings
  to authenticated;

drop policy if exists "lnp read rating criteria" on public.conductor_rating_criteria;
create policy "lnp read rating criteria"
  on public.conductor_rating_criteria for select to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp insert rating criteria" on public.conductor_rating_criteria;
create policy "lnp insert rating criteria"
  on public.conductor_rating_criteria for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update rating criteria" on public.conductor_rating_criteria;
create policy "lnp update rating criteria"
  on public.conductor_rating_criteria for update to authenticated
  using (app_private.is_lnp())
  with check (app_private.is_lnp());

drop policy if exists "lnp delete rating criteria" on public.conductor_rating_criteria;
create policy "lnp delete rating criteria"
  on public.conductor_rating_criteria for delete to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp read metric ratings" on public.conductor_metric_ratings;
create policy "lnp read metric ratings"
  on public.conductor_metric_ratings for select to authenticated
  using (app_private.is_lnp());

drop policy if exists "lnp insert metric ratings" on public.conductor_metric_ratings;
create policy "lnp insert metric ratings"
  on public.conductor_metric_ratings for insert to authenticated
  with check (app_private.is_lnp());

drop policy if exists "lnp update metric ratings" on public.conductor_metric_ratings;
create policy "lnp update metric ratings"
  on public.conductor_metric_ratings for update to authenticated
  using (app_private.is_lnp())
  with check (app_private.is_lnp());

drop policy if exists "lnp delete metric ratings" on public.conductor_metric_ratings;
create policy "lnp delete metric ratings"
  on public.conductor_metric_ratings for delete to authenticated
  using (app_private.is_lnp());

insert into public.conductor_rating_criteria (title, sort_order)
values
  ('Вежливость', 10),
  ('Дисциплина', 20),
  ('Знание правил', 30),
  ('Работа с пассажирами', 40),
  ('Ответственность', 50)
on conflict (title) do nothing;
