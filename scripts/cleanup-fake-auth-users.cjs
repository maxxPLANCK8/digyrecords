/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

const fakeUserIds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];
const fakeEmails = ["patricia@example.com", "samuel@example.com"];

async function main() {
  await client.connect();
  await client.query("begin");

  await client.query(
    `
      delete from auth.identities
      where user_id = any($1)
        or provider_id = any($2)
    `,
    [fakeUserIds, fakeEmails],
  );
  await client.query(
    `
      update auth.users
      set
        email = case
          when id = '11111111-1111-1111-1111-111111111111' then 'seed-westlands-member@parcellog.invalid'
          when id = '22222222-2222-2222-2222-222222222222' then 'seed-rongai-member@parcellog.invalid'
          else email
        end,
        encrypted_password = null,
        raw_app_meta_data = '{"provider":"seed","providers":[]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('display_name', 'Seed scanner'),
        updated_at = now()
      where id = any($1)
        or email = any($2)
    `,
    [fakeUserIds, fakeEmails],
  );
  await client.query(
    `
      update public.org_members
      set display_name = case
        when user_id = '11111111-1111-1111-1111-111111111111' then 'Westlands seed scanner'
        when user_id = '22222222-2222-2222-2222-222222222222' then 'Rongai seed scanner'
        else display_name
      end
      where user_id = any($1)
    `,
    [fakeUserIds],
  );

  await client.query("commit");
  console.log("fake Patricia/Samuel identities removed and seed users renamed");
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
