grant insert on public.orgs to authenticated;
grant insert on public.org_members to authenticated;

create policy "authenticated users create orgs"
  on public.orgs
  for insert
  to authenticated
  with check (true);

create policy "users join orgs as themselves"
  on public.org_members
  for insert
  to authenticated
  with check (user_id = auth.uid());
