alter table public.documents
  add column if not exists contract_received boolean not null default false;
