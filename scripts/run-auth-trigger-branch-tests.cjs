/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");
const { Client } = require("pg");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const westlandsOrgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function adminCreateUser({ email, password, displayName, metadata }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        ...metadata,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Admin create failed for ${email}: ${text}`);
  }

  return JSON.parse(text);
}

async function getMembership(email) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const result = await client.query(
      `
        select
          users.email,
          org_members.user_id,
          org_members.org_id,
          org_members.display_name,
          orgs.name as org_name
        from auth.users
        join public.org_members on org_members.user_id = users.id
        join public.orgs on orgs.id = org_members.org_id
        where users.email = $1
        order by org_members.created_at desc
      `,
      [email],
    );

    return result.rows;
  } finally {
    await client.end();
  }
}

async function loginAndReadDashboard(page, email, password) {
  await page.goto("http://localhost:3000/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button:has-text('Log in')");
  await page.waitForLoadState("networkidle");

  const body = await page.locator("body").innerText();
  console.log(`\nlogged in ${email}`);
  console.log("url", page.url());
  console.log(body.slice(0, 1200));

  if (!page.url().includes("/dashboard")) {
    throw new Error(`${email} did not land on /dashboard`);
  }

  return body;
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const stamp = Date.now();
  const password = "Password123!";
  const joinEmail = `triggerjoin${stamp}@gmail.com`;
  const createEmail = `triggercreate${stamp}@gmail.com`;
  const createOrgName = `Trigger Test Org ${stamp}`;

  await adminCreateUser({
    email: joinEmail,
    password,
    displayName: "Trigger Join Tester",
    metadata: {
      org_mode: "join",
      org_id: westlandsOrgId,
    },
  });

  await adminCreateUser({
    email: createEmail,
    password,
    displayName: "Trigger Create Tester",
    metadata: {
      org_mode: "create",
      org_name: createOrgName,
    },
  });

  const joinMembership = await getMembership(joinEmail);
  console.log("\njoin trigger membership");
  console.table(joinMembership);
  if (joinMembership.length !== 1 || joinMembership[0].org_id !== westlandsOrgId) {
    throw new Error("Join trigger did not create the expected org_members row");
  }

  const createMembership = await getMembership(createEmail);
  console.log("\ncreate trigger membership");
  console.table(createMembership);
  if (
    createMembership.length !== 1 ||
    createMembership[0].org_name !== createOrgName
  ) {
    throw new Error("Create trigger did not create the expected org/org_members rows");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const joinBody = await loginAndReadDashboard(page, joinEmail, password);
    if (!joinBody.includes("KM-WST-0001")) {
      throw new Error("Join trigger user did not see Westlands pickup");
    }
    if (joinBody.includes("KM-RNG-0001")) {
      throw new Error("Join trigger user leaked Rongai pickup");
    }

    await page.click("button:has-text('Log out')");
    await page.waitForLoadState("networkidle");

    const createBody = await loginAndReadDashboard(page, createEmail, password);
    if (!createBody.includes(createOrgName)) {
      throw new Error("Create trigger user did not see new org membership");
    }
    if (createBody.includes("KM-WST-0001") || createBody.includes("KM-RNG-0001")) {
      throw new Error("Create trigger user leaked existing pickup data");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
