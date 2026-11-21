alter table public.conductors
  add column if not exists is_senior_conductor boolean not null default false;

comment on column public.conductors.is_senior_conductor is
  'Marks a conductor or LNP as a senior conductor for practice assignment recommendations.';
