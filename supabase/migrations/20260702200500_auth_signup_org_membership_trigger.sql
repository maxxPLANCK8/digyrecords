create or replace function public.handle_new_auth_user_org_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_mode text;
  requested_org_id uuid;
  created_org_id uuid;
  requested_org_name text;
  requested_display_name text;
begin
  requested_mode := coalesce(new.raw_user_meta_data ->> 'org_mode', 'join');
  requested_org_name := nullif(trim(new.raw_user_meta_data ->> 'org_name'), '');
  requested_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    new.email,
    'Staff member'
  );

  if requested_mode = 'create' then
    if requested_org_name is null then
      raise exception 'org_name is required to create an org';
    end if;

    insert into public.orgs (name)
    values (requested_org_name)
    returning id into created_org_id;

    insert into public.org_members (org_id, user_id, display_name)
    values (created_org_id, new.id, requested_display_name);

    return new;
  end if;

  requested_org_id := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  insert into public.org_members (org_id, user_id, display_name)
  values (requested_org_id, new.id, requested_display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_org_membership on auth.users;

create trigger on_auth_user_created_org_membership
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user_org_membership();
