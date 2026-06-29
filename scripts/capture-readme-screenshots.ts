import fs from "node:fs/promises";
import puppeteer from "puppeteer";

const chromePort = process.env.CHROME_DEBUG_PORT || "9223";
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:4173/admin.html";
const directusUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
const directusEmail = process.env.DIRECTUS_EMAIL || "admin@example.com";
const directusPassword = process.env.DIRECTUS_PASSWORD || "change-me-please";
const outputDir = "docs/screenshots";

await fs.mkdir(outputDir, { recursive: true });

const searchConfig = JSON.parse(await fs.readFile("config/searches.json", "utf-8")) as {
  filters: Record<string, unknown>;
};
const settings = { directusUrl, directusToken: "", directusEmail, ...searchConfig.filters };

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chromePort}` });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const waitForText = (text: string, timeout = 15000) =>
  page.waitForFunction(`(t) => document.body?.innerText?.includes(t)`, { timeout }, text);

const loginScript = `
  (async () => {
    localStorage.setItem("job-search-admin-settings", ${JSON.stringify(JSON.stringify(settings))});
    const response = await fetch(${JSON.stringify(`${directusUrl}/auth/login`)}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ${JSON.stringify(directusEmail)},
        password: ${JSON.stringify(directusPassword)},
        mode: "json"
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    const data = body.data;
    localStorage.setItem("job-search-admin-auth-session", JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires: data.expires,
      persistent: true
    }));
    localStorage.setItem("jobhunter_active_tab", "setup");
    localStorage.setItem("jobhunter_lead_view", "list");
  })()
`;

await page.goto(baseUrl);
await waitForText("Job Search Admin");
await page.evaluate(loginScript);
await page.goto(baseUrl);
await waitForText("Connected");
await wait(800);
await page.screenshot({ path: `${outputDir}/admin-setup.png` });

await page.evaluate('localStorage.setItem("jobhunter_active_tab", "leads")');
await page.goto(baseUrl);
await waitForText("Refresh leads");
await waitForText("shown", 20000);
await wait(1000);
await page.screenshot({ path: `${outputDir}/job-leads-list.png` });

await page.evaluate(`
  document.querySelector("#leadSalaryFilter").value = "PLN";
  document.querySelector("#leadSalaryFilter").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#loadLeads").click();
`);
await waitForText("PLN", 10000);
await wait(500);
await page.screenshot({ path: `${outputDir}/job-leads-salary-filter.png` });

await browser.disconnect();
console.log("Saved README screenshots.");
