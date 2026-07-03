/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function show(label, sql) {
  const result = await client.query(sql);
  console.log(`\n${label}`);
  console.table(result.rows);
}

async function main() {
  await client.connect();

  await show(
    "auth.users columns",
    `
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'users'
      order by ordinal_position
    `,
  );

  await show(
    "seed users",
    `
      select
        id,
        email,
        encrypted_password is not null as has_password,
        email_confirmed_at,
        confirmed_at,
        role,
        aud,
        raw_app_meta_data,
        raw_user_meta_data
      from auth.users
      where email in ('patricia@example.com', 'samuel@example.com')
      order by email
    `,
  );

  await show(
    "auth.identities columns",
    `
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'identities'
      order by ordinal_position
    `,
  );

  await show(
    "seed identities",
    `
      select id, user_id, provider, identity_data
      from auth.identities
      where user_id in (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
      )
    `,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
