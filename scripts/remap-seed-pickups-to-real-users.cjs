/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

const westlandsOrgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const rongaiOrgId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const patriciaUserId = "a2bddb4f-f406-4b56-acf4-343123c5a8cf";
const samuelUserId = "ab82378d-044d-4e9c-baeb-f2b495249bc6";
const fakeUserIds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];

async function upsertMember(orgId, userId, displayName) {
  const result = await client.query(
    `
      insert into public.org_members (org_id, user_id, display_name)
      values ($1, $2, $3)
      on conflict (org_id, user_id) do update
      set display_name = excluded.display_name
      returning id
    `,
    [orgId, userId, displayName],
  );
  return result.rows[0].id;
}

async function main() {
  await client.connect();
  await client.query("begin");

  const patriciaMemberId = await upsertMember(
    westlandsOrgId,
    patriciaUserId,
    "Patricia",
  );
  const samuelMemberId = await upsertMember(rongaiOrgId, samuelUserId, "Samuel");

  await client.query(
    "update public.pickups set scanned_by = $1 where org_id = $2",
    [patriciaMemberId, westlandsOrgId],
  );
  await client.query(
    "update public.pickups set scanned_by = $1 where org_id = $2",
    [samuelMemberId, rongaiOrgId],
  );

  await client.query("delete from public.org_members where user_id = any($1)", [
    fakeUserIds,
  ]);
  await client.query("delete from auth.identities where user_id = any($1)", [
    fakeUserIds,
  ]);
  await client.query("delete from auth.users where id = any($1)", [fakeUserIds]);

  await client.query("commit");
  console.log("seed pickups now point to real Auth users; fake users removed");
}

main()
  .catch(async (error) => {
    await client.query("rollback").catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
