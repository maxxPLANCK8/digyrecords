create extension if not exists pgcrypto;

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.pickups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  tracking_number text not null,
  recipient_name text,
  recipient_phone text,
  scanned_by uuid not null references public.org_members(id),
  scanned_at timestamptz not null default now(),
  raw_barcode_payload text,
  device_note text,
  created_at timestamptz not null default now()
);

create index idx_pickups_org_tracking
  on public.pickups (org_id, tracking_number);

create index idx_pickups_org_scanned_at
  on public.pickups (org_id, scanned_at desc);

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
  from public.org_members
  where user_id = auth.uid()
$$;

create or replace function public.current_org_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.org_members
  where user_id = auth.uid()
$$;

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.pickups enable row level security;

create policy "org members read own orgs"
  on public.orgs
  for select
  using (id in (select public.current_org_ids()));

create policy "org members read members in own orgs"
  on public.org_members
  for select
  using (org_id in (select public.current_org_ids()));

create policy "org members read own org pickups"
  on public.pickups
  for select
  using (org_id in (select public.current_org_ids()));

create policy "org members insert own org pickups"
  on public.pickups
  for insert
  with check (
    org_id in (select public.current_org_ids())
    and scanned_by in (select public.current_org_member_ids())
  );
