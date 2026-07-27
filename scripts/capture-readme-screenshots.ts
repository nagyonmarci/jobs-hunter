import fs from "node:fs/promises";
import puppeteer from "puppeteer";

const chromePort = process.env.CHROME_DEBUG_PORT || "9223";
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:4180/admin.html";
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "change-me-please";
const outputDir = "docs/screenshots";

await fs.mkdir(outputDir, { recursive: true });

const searchConfig = JSON.parse(await fs.readFile("config/searches.json", "utf-8")) as {
  filters: Record<string, unknown>;
};
const settings = { ...searchConfig.filters };

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chromePort}` });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.authenticate({ username: adminUser, password: adminPassword });

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const waitForText = (text: string, timeout = 15000) =>
  page.waitForFunction(`(t) => document.body?.innerText?.includes(t)`, { timeout }, text);

const settingsScript = `
  (async () => {
    localStorage.setItem("job-search-admin-settings", ${JSON.stringify(JSON.stringify(settings))});
    localStorage.setItem("jobhunter_active_tab", "setup");
    localStorage.setItem("jobhunter_lead_view", "list");
  })()
`;

await page.goto(baseUrl);
await waitForText("Job Search Admin");
await page.evaluate(settingsScript);
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
