import fs from "node:fs/promises";
import puppeteer from "puppeteer";

const chromePort = process.env.CHROME_DEBUG_PORT || "9223";
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:4173/admin.html";
const directusUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
const directusEmail = process.env.DIRECTUS_EMAIL || "admin@example.com";
const directusPassword = process.env.DIRECTUS_PASSWORD || "change-me-please";
const outputDir = "docs/screenshots";

await fs.mkdir(outputDir, { recursive: true });

const settings = {
  directusUrl,
  directusToken: "",
  directusEmail,
  keywords: [
    '"DevOps Engineer"',
    '"Site Reliability Engineer"',
    "SRE",
    '"Platform Engineer"',
    '"Cloud Engineer"',
    '"Azure DevOps Engineer"',
    '"Infrastructure Engineer"'
  ],
  excludeKeywords: [
    '"Security Engineer"',
    '"Cybersecurity"',
    '"Application Security"',
    '"Product Security"',
    '"Security Architect"',
    '"IT Security"'
  ],
  positiveTech: [
    "Kubernetes",
    "Docker",
    "Terraform",
    "Ansible",
    "CI/CD",
    "GitHub Actions",
    "GitLab CI",
    "Jenkins",
    "Azure DevOps",
    "Linux",
    "Bash",
    "Python",
    "AWS",
    "Azure",
    "GCP",
    "Prometheus",
    "Grafana",
    "Helm",
    "Argo CD"
  ],
  negativeSignals: [
    "senior",
    "lead",
    "principal",
    "staff",
    "manager",
    "architect",
    "security clearance",
    "10+ years",
    "8+ years",
    "7+ years",
    "5+ years"
  ],
  minimumScore: 45,
  allowedLanguages: ["english", "hungarian", "mixed", "unknown"],
  blockedLanguages: ["other"],
  hybridLocations: [
    "Hungary",
    "Krakow Metropolitan Area",
    "Katowice Metropolitan Area",
    "Wroclaw Metropolitan Area",
    "Slovakia",
    "Romania"
  ],
  remoteLocations: ["European Union"],
  experienceLevels: ["entry", "associate"],
  postedWithin: "r604800"
};

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chromePort}` });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForText = (text, timeout = 15000) =>
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
