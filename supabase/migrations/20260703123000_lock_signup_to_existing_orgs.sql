drop policy if exists "authenticated users create orgs" on public.orgs;
drop policy if exists "users join orgs as themselves" on public.org_members;

revoke insert on public.orgs from authenticated;
revoke insert on public.org_members from authenticated;

create or replace function public.handle_new_auth_user_org_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_org_id uuid;
  requested_org_id_text text;
  requested_display_name text;
begin
  requested_org_id_text := nullif(trim(new.raw_user_meta_data ->> 'org_id'), '');
  requested_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    new.email,
    'Staff member'
  );

  if requested_org_id_text is null then
    raise exception 'org_id invite code is required';
  end if;

  requested_org_id := requested_org_id_text::uuid;

  if not exists (select 1 from public.orgs where id = requested_org_id) then
    raise exception 'org invite code was not found';
  end if;

  insert into public.org_members (org_id, user_id, display_name)
  values (requested_org_id, new.id, requested_display_name);

  return new;
end;
$$;
