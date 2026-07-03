/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");
const { Client } = require("pg");

const westlandsOrgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function signup(page, values) {
  await page.goto("http://localhost:3000/signup");
  await page.fill("input[name=display_name]", values.displayName);
  await page.fill("input[name=email]", values.email);
  await page.fill("input[name=password]", values.password);

  if (values.mode === "create") {
    await page.check("input[name=org_mode][value=create]");
    await page.fill("input[name=org_name]", values.orgName);
  } else {
    await page.check("input[name=org_mode][value=join]");
    await page.fill("input[name=org_id]", values.orgId);
  }

  await page.click("button:has-text('Create account')");
  await page.waitForLoadState("networkidle");

  const body = await page.locator("body").innerText();
  console.log(`\n${values.label}`);
  console.log("email", values.email);
  console.log("url", page.url());
  console.log(body.slice(0, 1200));

  if (!page.url().includes("/dashboard")) {
    throw new Error(`${values.label} did not land on /dashboard`);
  }

  return body;
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const stamp = Date.now();

  const joinUser = {
    label: "join existing org signup",
    mode: "join",
    displayName: "Westlands Join Tester",
    email: `westlandsjoin${stamp}@gmail.com`,
    password: "Password123!",
    orgId: westlandsOrgId,
  };

  const createUser = {
    label: "create new org signup",
    mode: "create",
    displayName: "New Org Tester",
    email: `neworg${stamp}@gmail.com`,
    password: "Password123!",
    orgName: `ParcelLog Test Org ${stamp}`,
  };

  try {
    const joinBody = await signup(page, joinUser);
    if (!joinBody.includes("Kilimall Pickup Westlands")) {
      throw new Error("Join signup did not show Westlands membership");
    }
    if (!joinBody.includes("KM-WST-0001")) {
      throw new Error("Join signup did not show Westlands pickup");
    }
    if (joinBody.includes("KM-RNG-0001") || joinBody.includes("Kilimall Pickup Rongai")) {
      throw new Error("Join signup leaked Rongai data");
    }

    const joinMembership = await getMembership(joinUser.email);
    console.log("join membership");
    console.table(joinMembership);
    if (
      joinMembership.length !== 1 ||
      joinMembership[0].org_id !== westlandsOrgId
    ) {
      throw new Error("Join signup created the wrong org_members row");
    }

    await page.click("button:has-text('Log out')");
    await page.waitForLoadState("networkidle");

    const createBody = await signup(page, createUser);
    if (!createBody.includes(createUser.orgName)) {
      throw new Error("Create signup did not show new org membership");
    }
    if (createBody.includes("KM-WST-0001") || createBody.includes("KM-RNG-0001")) {
      throw new Error("Create signup leaked existing org pickup data");
    }

    const createMembership = await getMembership(createUser.email);
    console.log("create membership");
    console.table(createMembership);
    if (
      createMembership.length !== 1 ||
      createMembership[0].org_name !== createUser.orgName
    ) {
      throw new Error("Create signup did not create the expected org_members row");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
