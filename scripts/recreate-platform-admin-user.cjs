/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { URL } = require("url");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const [, , email, password] = process.argv;

if (!email || !password) {
  throw new Error(
    "Usage: node scripts/recreate-platform-admin-user.cjs <email> <password>",
  );
}

function readEnvFile() {
  const text = fs.readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }
  return env;
}

const poolerUrl = new URL(
  fs.readFileSync("supabase/.temp/pooler-url", "utf8").trim(),
);
const db = new Client({
  host: poolerUrl.hostname,
  port: Number(poolerUrl.port),
  database: poolerUrl.pathname.slice(1),
  user: poolerUrl.username,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const env = readEnvFile();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  await db.connect();

  const org = await db.query(
    "select id from public.orgs order by created_at asc limit 1",
  );
  const orgId = org.rows[0]?.id;
  if (!orgId) {
    throw new Error("Cannot create user because no orgs exist.");
  }

  await db.query("begin");
  try {
    const existing = await db.query(
      "select id from auth.users where lower(email) = lower($1)",
      [email],
    );
    const existingIds = existing.rows.map((row) => row.id);

    if (existingIds.length) {
      await db.query("delete from public.platform_admins where user_id = any($1)", [
        existingIds,
      ]);
      await db.query("delete from public.org_members where user_id = any($1)", [
        existingIds,
      ]);
      await db.query("delete from auth.identities where user_id = any($1)", [
        existingIds,
      ]);
      await db.query("delete from auth.users where id = any($1)", [existingIds]);
    }
    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: email.split("@")[0],
        org_mode: "join",
        org_id: orgId,
      },
    },
  });

  if (error) {
    throw new Error(`Signup failed: ${error.message}`);
  }

  if (!data.user?.id) {
    throw new Error("Signup did not return a user id.");
  }

  await db.query(
    `
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = $1
    `,
    [data.user.id],
  );

  await db.query(
    `
      insert into public.platform_admins (user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [data.user.id],
  );

  console.log(
    JSON.stringify(
      {
        status: "recreated_platform_admin_user",
        email,
        user_id: data.user.id,
        has_session: Boolean(data.session),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end().catch(() => {});
  });
