/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("http://localhost:3000/scan");
    await page.waitForLoadState("networkidle");
    console.log("anonymous scan url", page.url());
    if (!page.url().includes("/login")) {
      throw new Error("Anonymous /scan request was not redirected to /login");
    }

    await page.fill("input[name=email]", "patricia.auth.ui@digyrecords.co.ke");
    await page.fill("input[name=password]", "Password123!");
    await Promise.all([
      page.waitForURL("**/dashboard", { timeout: 15000 }),
      page.click("button:has-text('Log in')"),
    ]);

    await page.goto("http://localhost:3000/scan");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    console.log("logged-in scan url", page.url());
    console.log(body.slice(0, 1200));

    if (!body.includes("Scan pickup")) {
      throw new Error("Scan page did not render");
    }
    if (!body.includes("Kilimall Pickup Westlands")) {
      throw new Error("Scan page did not show Patricia's org context");
    }
    if (!body.includes("Confirm Pickup")) {
      throw new Error("Scan page did not render the confirmation form");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
