grant usage on schema public to authenticated;

grant select on public.orgs to authenticated;
grant select on public.org_members to authenticated;
grant select, insert on public.pickups to authenticated;

grant execute on function public.current_org_ids() to authenticated;
grant execute on function public.current_org_member_ids() to authenticated;
