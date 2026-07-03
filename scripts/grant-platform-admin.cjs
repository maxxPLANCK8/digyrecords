/* eslint-disable @typescript-eslint/no-require-imports */
const childProcess = require("child_process");
const fs = require("fs");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

function parseExport(name, text) {
  const match = text.match(new RegExp(`export ${name}="([^"]*)"`));
  if (!match) {
    throw new Error(`Supabase CLI did not return ${name}`);
  }

  return match[1];
}

function getRemoteConnection() {
  if (process.env.PGPASSWORD && fs.existsSync("supabase/.temp/pooler-url")) {
    const url = new URL(
      fs.readFileSync("supabase/.temp/pooler-url", "utf8").trim(),
    );
    return {
      host: url.hostname,
      port: Number(url.port),
      user: url.username,
      password: process.env.PGPASSWORD,
      database: url.pathname.slice(1),
      ssl: { rejectUnauthorized: false },
    };
  }

  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/c", "npx.cmd", "supabase", "db", "dump", "--schema", "public", "--dry-run"]]
      : ["npx", ["supabase", "db", "dump", "--schema", "public", "--dry-run"]];
  const output = childProcess.execFileSync(
    command[0],
    command[1],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return {
    host: parseExport("PGHOST", output),
    port: Number(parseExport("PGPORT", output)),
    user: parseExport("PGUSER", output),
    password: parseExport("PGPASSWORD", output),
    database: parseExport("PGDATABASE", output),
    ssl: { rejectUnauthorized: false },
  };
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

async function getUserFromAuth(email, password) {
  if (!password) {
    return null;
  }

  const env = readEnvFile();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Auth sign-in failed: ${error.message}`);
  }

  return data.user;
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email) {
    throw new Error(
      "Usage: node scripts/grant-platform-admin.cjs <email> [password]",
    );
  }

  const client = new Client(getRemoteConnection());
  await client.connect();

  try {
    let authUser = null;

    try {
      const user = await client.query(
        "select id, email from auth.users where lower(email) = lower($1) limit 1",
        [email],
      );
      authUser = user.rows[0] || null;
    } catch (error) {
      if (!/permission denied for schema auth/i.test(error.message)) {
        throw error;
      }
      authUser = await getUserFromAuth(email, password);
    }

    if (!authUser) {
      console.log(JSON.stringify({ status: "missing_user", email }, null, 2));
      return;
    }

    const userId = authUser.id;
    await client.query(
      `
        insert into public.platform_admins (user_id)
        values ($1)
        on conflict (user_id) do nothing
      `,
      [userId],
    );

    const admin = await client.query(
      "select user_id from public.platform_admins where user_id = $1",
      [userId],
    );

    console.log(
      JSON.stringify(
        {
          status: "platform_admin_ready",
          email: authUser.email || email,
          user_id: userId,
          admin_rows: admin.rowCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
