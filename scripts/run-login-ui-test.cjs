/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("http://localhost:3000/login");
    await page.fill("input[name=email]", "patricia.auth.ui@digyrecords.co.ke");
    await page.fill("input[name=password]", "Password123!");
    await page.click("button:has-text('Log in')");
    await page.waitForLoadState("networkidle");

    console.log("after login url", page.url());
    const body = await page.locator("body").innerText();
    console.log(body.slice(0, 1200));

    if (!page.url().includes("/dashboard")) {
      throw new Error("Login did not land on /dashboard");
    }
    if (!body.includes("Kilimall Pickup Westlands")) {
      throw new Error("Patricia dashboard did not show Westlands membership");
    }
    if (!body.includes("KM-WST-0001")) {
      throw new Error("Patricia dashboard did not show Westlands pickup");
    }
    if (body.includes("KM-RNG-0001") || body.includes("Kilimall Pickup Rongai")) {
      throw new Error("Patricia dashboard leaked Rongai data");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
