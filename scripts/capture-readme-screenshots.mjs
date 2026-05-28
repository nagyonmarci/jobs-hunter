import fs from "node:fs/promises";

const chromePort = process.env.CHROME_DEBUG_PORT || "9223";
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:4173/admin.html";
const directusUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
const directusEmail = process.env.DIRECTUS_EMAIL || "admin@example.com";
const directusPassword = process.env.DIRECTUS_PASSWORD || "change-me-please";
const outputDir = "docs/screenshots";

await fs.mkdir(outputDir, { recursive: true });

const target = await (
  await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(baseUrl)}`, {
    method: "PUT"
  })
).json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});

await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

function command(method, params = {}) {
  const commandId = ++id;
  ws.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve, reject) => pending.set(commandId, { resolve, reject }));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluate(expression) {
  return command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
}

async function waitForText(text, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await evaluate("document.body && document.body.innerText || ''");
    if (String(result.result.value || "").includes(text)) return;
    await wait(300);
  }
  throw new Error(`Timed out waiting for "${text}"`);
}

async function screenshot(path) {
  const result = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await fs.writeFile(path, Buffer.from(result.data, "base64"));
}

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

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false
});

await command("Page.navigate", { url: baseUrl });
await waitForText("Job Search Admin");

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

await evaluate(loginScript);
await command("Page.navigate", { url: baseUrl });
await waitForText("Connected");
await wait(800);
await screenshot(`${outputDir}/admin-setup.png`);

await evaluate('localStorage.setItem("jobhunter_active_tab", "leads")');
await command("Page.navigate", { url: baseUrl });
await waitForText("Refresh leads");
await waitForText("shown", 20000);
await wait(1000);
await screenshot(`${outputDir}/job-leads-list.png`);

await evaluate(`
  document.querySelector("#leadSalaryFilter").value = "PLN";
  document.querySelector("#leadSalaryFilter").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#loadLeads").click();
`);
await waitForText("PLN", 10000);
await wait(500);
await screenshot(`${outputDir}/job-leads-salary-filter.png`);

ws.close();
console.log("Saved README screenshots.");
