/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        password: process.env.PGPASSWORD,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: "db.cgsogetqdnfnxvholzgk.supabase.co",
        port: 5432,
        database: "postgres",
        user: "postgres",
        password: process.env.PGPASSWORD,
        ssl: { rejectUnauthorized: false },
      },
);

async function main() {
  await client.connect();

  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('orgs', 'org_members', 'pickups')
    order by table_name
  `);
  console.log("tables:", tables.rows.map((row) => row.table_name).join(", "));

  const columns = await client.query(`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('orgs', 'org_members', 'pickups')
    order by table_name, ordinal_position
  `);
  for (const row of columns.rows) {
    console.log(
      `${row.table_name}.${row.column_name} ${row.data_type} nullable=${row.is_nullable}`,
    );
  }

  const rls = await client.query(`
    select relname, relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where nspname = 'public'
      and relname in ('orgs', 'org_members', 'pickups')
    order by relname
  `);
  for (const row of rls.rows) {
    console.log(`rls ${row.relname}=${row.relrowsecurity}`);
  }

  const policies = await client.query(`
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orgs', 'org_members', 'pickups')
    order by tablename, policyname
  `);
  for (const row of policies.rows) {
    console.log(`policy ${row.tablename}: ${row.policyname} (${row.cmd})`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
