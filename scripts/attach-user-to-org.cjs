/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const [, , userId, orgId, displayName] = process.argv;
  if (!userId || !orgId || !displayName) {
    throw new Error("Usage: node scripts/attach-user-to-org.cjs <userId> <orgId> <displayName>");
  }

  await client.connect();
  const result = await client.query(
    `
      insert into public.org_members (org_id, user_id, display_name)
      values ($1, $2, $3)
      on conflict (org_id, user_id) do update
      set display_name = excluded.display_name
      returning id, org_id, user_id, display_name
    `,
    [orgId, userId, displayName],
  );

  console.table(result.rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
