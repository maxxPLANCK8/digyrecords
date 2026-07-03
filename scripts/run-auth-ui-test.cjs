/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const email = `patricia${Date.now()}@digyrecords.co.ke`;

  try {
    await page.goto("http://localhost:3000/signup");
    await page.fill("input[name=display_name]", "Patricia");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", "Password123!");
    await page.fill("input[name=org_id]", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    await page.click("button:has-text('Create account')");
    await page.waitForLoadState("networkidle");

    console.log("signed up email", email);
    console.log("after signup url", page.url());
    console.log((await page.locator("body").innerText()).slice(0, 1200));

    if (!page.url().includes("/dashboard")) {
      throw new Error("Signup did not land on /dashboard");
    }

    const body = await page.locator("body").innerText();
    if (!body.includes("KM-WST-0001")) {
      throw new Error("Patricia dashboard did not show Westlands pickup");
    }
    if (body.includes("KM-RNG-0001")) {
      throw new Error("Patricia dashboard leaked Rongai pickup");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
