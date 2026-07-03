create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

drop policy if exists "platform admins read own row" on public.platform_admins;
create policy "platform admins read own row"
  on public.platform_admins
  for select
  using (user_id = auth.uid());

grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.orgs to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;
grant select on public.pickups to authenticated;

drop policy if exists "admin full access to orgs" on public.orgs;
create policy "admin full access to orgs"
  on public.orgs
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admin full access to org_members" on public.org_members;
create policy "admin full access to org_members"
  on public.org_members
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admin read all pickups" on public.pickups;
create policy "admin read all pickups"
  on public.pickups
  for select
  using (public.is_platform_admin());
