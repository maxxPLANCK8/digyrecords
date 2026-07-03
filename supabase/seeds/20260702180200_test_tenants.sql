insert into public.orgs (id, name, created_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kilimall Pickup Westlands', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Kilimall Pickup Rongai', now())
on conflict (id) do update
set name = excluded.name;
