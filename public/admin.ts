const storageKey = "job-search-admin-settings";
const authSessionKey = "job-search-admin-auth-session";
const importerUrl = "http://localhost:4180";

interface Defaults {
  directusUrl: string;
  directusToken: string;
  directusEmail: string;
  keywords: string[];
  excludeKeywords: string[];
  positiveTech: string[];
  negativeSignals: string[];
  minimumScore: number;
  allowedLanguages: string[];
  blockedLanguages: string[];
  hybridLocations: string[];
  remoteLocations: string[];
  experienceLevels: string[];
  postedWithin: string;
}

interface Settings extends Defaults {
  preferredLlm?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires: number;
  persistent: boolean;
}

interface JobLead {
  id: string | number;
  status: string;
  score: number | null;
  title: string;
  company: string | null;
  location: string;
  workplace: string;
  seniority: string;
  language: string;
  url: string;
  apply_url?: string;
  is_read: boolean;
  salary: string | null;
  notes: string | null;
  is_expired?: boolean;
}

interface SearchRow {
  source: string;
  query: string;
  location: string;
  workplace: string;
  url: string;
  generated_at: string;
}

const defaults: Defaults = {
  directusUrl: "http://localhost:8055",
  directusToken: "",
  directusEmail: "admin@example.com",
  keywords: [
    "\"DevOps Engineer\"",
    "\"Site Reliability Engineer\"",
    "SRE",
    "\"Platform Engineer\"",
    "\"Cloud Engineer\"",
    "\"Azure DevOps Engineer\"",
    "\"Infrastructure Engineer\""
  ],
  excludeKeywords: [
    "\"Security Engineer\"",
    "\"Cybersecurity\"",
    "\"Application Security\"",
    "\"Product Security\"",
    "\"Security Architect\"",
    "\"IT Security\""
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

const experienceMap: Record<string, string> = {
  internship: "1",
  entry: "2",
  associate: "3",
  "mid-senior": "4"
};

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const $input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

const tabKey = "jobhunter_active_tab";
const viewKey = "jobhunter_lead_view";

let generatedRows: SearchRow[] = [];
let leadRows: JobLead[] = [];
let currentView = localStorage.getItem(viewKey) || "list";

function showToast(message: string): void {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 3000);
}

function readLines(id: string): string[] {
  return $input(id).value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeLines(id: string, values: string[]): void {
  $input(id).value = values.join("\n");
}

function loadSettings(): Settings {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<Settings>;
  return { ...defaults, ...saved };
}

function saveSettingsToStorage(): void {
  const settings = readSettingsFromForm();
  localStorage.setItem(storageKey, JSON.stringify(settings)); // codeql[js/clear-text-storage-of-sensitive-data] -- intentional: self-hosted tool, user-owned keys

  // Also save LLM settings to Directus so the backend can use them
  if (hasConnectionCredential()) {
    directusRequest("/items/app_settings", {
      method: "PATCH",
      body: JSON.stringify({
        preferred_llm: settings.preferredLlm,
        openai_api_key: settings.openaiApiKey,
        anthropic_api_key: settings.anthropicApiKey,
        gemini_api_key: settings.geminiApiKey
      })
    }).catch(console.error);
  }

  showToast("Settings saved locally & to Directus.");
}

function applySettings(settings: Settings): void {
  $input("directusUrl").value = settings.directusUrl || "";
  $input("directusToken").value = settings.directusToken || "";
  $input("directusEmail").value = settings.directusEmail || defaults.directusEmail;
  $input("directusPassword").value = "";

  const llmEl = document.getElementById("preferredLlm") as HTMLSelectElement | null;
  if (llmEl) llmEl.value = settings.preferredLlm || "openai";
  const openaiEl = document.getElementById("openaiApiKey") as HTMLInputElement | null;
  if (openaiEl) openaiEl.value = settings.openaiApiKey || "";
  const anthropicEl = document.getElementById("anthropicApiKey") as HTMLInputElement | null;
  if (anthropicEl) anthropicEl.value = settings.anthropicApiKey || "";
  const geminiEl = document.getElementById("geminiApiKey") as HTMLInputElement | null;
  if (geminiEl) geminiEl.value = settings.geminiApiKey || "";

  writeLines("keywords", settings.keywords || defaults.keywords);
  writeLines("excludeKeywords", settings.excludeKeywords || defaults.excludeKeywords);
  writeLines("positiveTech", settings.positiveTech || defaults.positiveTech);
  writeLines("negativeSignals", settings.negativeSignals || defaults.negativeSignals);
  writeLines("hybridLocations", settings.hybridLocations || defaults.hybridLocations);
  writeLines("remoteLocations", settings.remoteLocations || defaults.remoteLocations);
  $input("minimumScore").value = String(settings.minimumScore ?? defaults.minimumScore);
  $input("postedWithinHours").value = String(postedWithinToHours(settings.postedWithin));

  document.querySelectorAll<HTMLInputElement>("input[name='allowedLanguage']").forEach((input) => {
    input.checked = (settings.allowedLanguages || defaults.allowedLanguages).includes(input.value);
  });
  document.querySelectorAll<HTMLInputElement>("input[name='blockedLanguage']").forEach((input) => {
    input.checked = (settings.blockedLanguages || defaults.blockedLanguages).includes(input.value);
  });

  document.querySelectorAll<HTMLInputElement>("input[name='experience']").forEach((input) => {
    input.checked = (settings.experienceLevels || defaults.experienceLevels).includes(input.value);
  });

  updateInitialConnectionStatus();
  syncRememberLoginCheckbox();
  if (hasConnectionCredential()) {
    setTimeout(() => testConnection(), 0);
  }
}

function updateInitialConnectionStatus(): void {
  const status = $("connectionStatus");
  if (hasConnectionCredential()) {
    status.className = "status";
    status.textContent = "Test needed";
  } else {
    status.className = "status";
    status.textContent = "Login required";
  }
}

function hasConnectionCredential(): boolean {
  const { directusToken } = readSettingsFromForm();
  const auth = getStoredAuthSession();
  return Boolean(directusToken || auth?.access_token);
}

function syncRememberLoginCheckbox(): void {
  const remember = document.getElementById("rememberLogin") as HTMLInputElement | null;
  if (!remember) return;
  remember.checked = Boolean(getStoredAuthSession()?.persistent);
}

function readSettingsFromForm(): Settings {
  const llmEl = document.getElementById("preferredLlm") as HTMLSelectElement | null;
  const openaiEl = document.getElementById("openaiApiKey") as HTMLInputElement | null;
  const anthropicEl = document.getElementById("anthropicApiKey") as HTMLInputElement | null;
  const geminiEl = document.getElementById("geminiApiKey") as HTMLInputElement | null;
  return {
    directusUrl: $input("directusUrl").value.trim().replace(/\/$/, ""),
    directusToken: $input("directusToken").value.trim(),
    directusEmail: $input("directusEmail").value.trim(),
    preferredLlm: llmEl ? llmEl.value : "openai",
    openaiApiKey: openaiEl ? openaiEl.value.trim() : "",
    anthropicApiKey: anthropicEl ? anthropicEl.value.trim() : "",
    geminiApiKey: geminiEl ? geminiEl.value.trim() : "",
    keywords: readLines("keywords"),
    excludeKeywords: readLines("excludeKeywords"),
    positiveTech: readLines("positiveTech"),
    negativeSignals: readLines("negativeSignals"),
    minimumScore: Number($input("minimumScore").value) || defaults.minimumScore,
    allowedLanguages: [...document.querySelectorAll<HTMLInputElement>("input[name='allowedLanguage']:checked")].map((input) => input.value),
    blockedLanguages: [...document.querySelectorAll<HTMLInputElement>("input[name='blockedLanguage']:checked")].map((input) => input.value),
    hybridLocations: readLines("hybridLocations"),
    remoteLocations: readLines("remoteLocations"),
    experienceLevels: [...document.querySelectorAll<HTMLInputElement>("input[name='experience']:checked")].map((input) => input.value),
    postedWithin: hoursToPostedWithin($input("postedWithinHours").value)
  };
}

function postedWithinToHours(value: string): number {
  const seconds = Number(String(value || "").replace(/^r/, ""));
  if (!Number.isFinite(seconds) || seconds <= 0) return 168;
  return Math.max(1, Math.round(seconds / 3600));
}

function hoursToPostedWithin(value: string): string {
  const hours = Math.min(720, Math.max(1, Math.round(Number(value) || 168)));
  return `r${hours * 3600}`;
}

async function directusRequest(path: string, options: RequestInit = {}, retry = true): Promise<unknown> {
  const { directusUrl, directusToken } = readSettingsFromForm();
  const accessToken = directusToken || getStoredAuthSession()?.access_token || "";
  if (!directusUrl || !accessToken) {
    throw new Error("Directus URL and token/login are required.");
  }

  const response = await fetch(`${directusUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...((options.headers as Record<string, string>) || {})
    }
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;

  if (response.status === 401 && retry && !directusToken && getStoredAuthSession()?.refresh_token) {
    await refreshDirectusToken();
    return directusRequest(path, options, false);
  }

  if (!response.ok) {
    const errors = body?.errors as Array<{ message: string }> | undefined;
    const message = errors?.[0]?.message || response.statusText;
    throw new Error(`${response.status}: ${message}`);
  }

  return body;
}

async function loginDirectus(): Promise<void> {
  const status = $("connectionStatus");
  status.className = "status";
  status.textContent = "Logging in...";

  const { directusUrl, directusEmail } = readSettingsFromForm();
  const password = $input("directusPassword").value;

  if (!directusUrl || !directusEmail || !password) {
    throw new Error("Directus URL, email, and password are required for login.");
  }

  const response = await fetch(`${directusUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: directusEmail,
      password,
      mode: "json"
    })
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { data?: AuthSession; errors?: Array<{ message: string }> }) : null;
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || response.statusText;
    throw new Error(`${response.status}: ${message}`);
  }

  const remember = document.getElementById("rememberLogin") as HTMLInputElement | null;
  saveAuthSession(body!.data!, remember?.checked || false);
  $input("directusPassword").value = "";
  status.className = "status ok";
  status.textContent = "Logged in";
  showToast("Directus login OK.");
  await testConnection();
}

async function refreshDirectusToken(): Promise<void> {
  const { directusUrl } = readSettingsFromForm();
  const auth = getStoredAuthSession();
  if (!auth?.refresh_token) throw new Error("No refresh token available. Login again.");

  const response = await fetch(`${directusUrl}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refresh_token: auth.refresh_token,
      mode: "json"
    })
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { data?: AuthSession; errors?: Array<{ message: string }> }) : null;
  if (!response.ok) {
    clearAuthSession();
    const message = body?.errors?.[0]?.message || response.statusText;
    throw new Error(`${response.status}: ${message}. Login again.`);
  }

  saveAuthSession(body!.data!, auth.persistent);
}

function saveAuthSession(data: AuthSession, persistent: boolean): void {
  const payload = JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires: data.expires,
    persistent
  });
  sessionStorage.setItem(authSessionKey, payload); // codeql[js/clear-text-storage-of-sensitive-data] -- intentional: self-hosted tool, user-owned session
  if (persistent) {
    localStorage.setItem(authSessionKey, payload); // codeql[js/clear-text-storage-of-sensitive-data] -- intentional: self-hosted tool, user-owned session
  } else {
    localStorage.removeItem(authSessionKey);
  }
}

function getStoredAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(authSessionKey) || localStorage.getItem(authSessionKey);
  return raw ? (JSON.parse(raw) as AuthSession) : null;
}

function clearAuthSession(): void {
  sessionStorage.removeItem(authSessionKey);
  localStorage.removeItem(authSessionKey);
}

function buildLinkedInUrl({ keyword, location, workplace, settings }: { keyword: string; location: string; workplace: string; settings: Settings }): string {
  const query = [keyword, ...settings.excludeKeywords.map((term) => `NOT ${term}`)].join(" ");
  const params = new URLSearchParams({
    keywords: query,
    location,
    f_WT: workplace === "remote" ? "2" : "3",
    f_TPR: settings.postedWithin,
    f_E: settings.experienceLevels.map((level) => experienceMap[level]).filter(Boolean).join(",")
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function generateSearchRows(): void {
  const settings = readSettingsFromForm();
  const now = new Date().toISOString();
  const rows: SearchRow[] = [];

  for (const keyword of settings.keywords) {
    const query = [keyword, ...settings.excludeKeywords.map((term) => `NOT ${term}`)].join(" ");
    for (const location of settings.hybridLocations) {
      rows.push({
        source: "linkedin",
        query,
        location,
        workplace: "hybrid",
        url: buildLinkedInUrl({ keyword, location, workplace: "hybrid", settings }),
        generated_at: now
      });
    }

    for (const location of settings.remoteLocations) {
      rows.push({
        source: "linkedin",
        query,
        location,
        workplace: "remote",
        url: buildLinkedInUrl({ keyword, location, workplace: "remote", settings }),
        generated_at: now
      });
    }
  }

  generatedRows = rows;
  renderGeneratedRows();
}

function renderGeneratedRows(): void {
  $("generatedCount").textContent = `${generatedRows.length} URLs generated.`;
  $("generatedRows").innerHTML = generatedRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.workplace)}</td>
      <td>${escapeHtml(row.location)}</td>
      <td>${escapeHtml(row.query)}</td>
      <td><a href="${escapeAttribute(row.url)}" target="_blank" rel="noreferrer">Open</a></td>
    </tr>
  `).join("");
}

async function saveRuns(): Promise<void> {
  if (!generatedRows.length) generateSearchRows();
  for (const row of generatedRows) {
    await directusRequest("/items/job_search_runs", {
      method: "POST",
      body: JSON.stringify(row)
    });
  }
  showToast(`Saved ${generatedRows.length} search runs to Directus.`);
}

async function testConnection(): Promise<void> {
  const status = $("connectionStatus");
  status.className = "status";
  status.textContent = "Testing...";
  try {
    await directusRequest("/items/job_leads?limit=1&fields=id");
    await directusRequest("/items/job_search_runs?limit=1&fields=id");
    status.classList.add("ok");
    status.textContent = "Connected";
    showToast("Directus collection access OK.");
  } catch (error) {
    status.classList.add("error");
    status.textContent = "Failed";
    showToast((error as Error).message);
  }
}

async function loadLeads(): Promise<void> {
  const params = new URLSearchParams({
    sort: ($("leadSort") as HTMLSelectElement).value || "-score",
    limit: String(Number($input("leadLimit").value) || 100),
    fields: "id,status,score,title,company,location,workplace,seniority,language,url,apply_url,is_read,salary,notes,is_expired"
  });
  appendLeadFilters(params);

  const response = await directusRequest(`/items/job_leads?${params.toString()}`) as { data?: JobLead[] };
  leadRows = response.data || [];
  renderLeads();
}

function appendLeadFilters(params: URLSearchParams): void {
  const textFilters: Array<[string, string]> = [
    ["leadTitleFilter", "title"],
    ["leadCompanyFilter", "company"],
    ["leadLocationFilter", "location"],
    ["leadNotesFilter", "notes"],
    ["leadSalaryFilter", "salary"],
    ["leadUrlFilter", "url"]
  ];
  for (const [inputId, field] of textFilters) {
    const value = $input(inputId).value.trim();
    if (value) params.set(`filter[${field}][_icontains]`, value);
  }

  const exactFilters: Array<[string, string]> = [
    ["leadStatusFilter", "status"],
    ["leadWorkplaceFilter", "workplace"],
    ["leadSeniorityFilter", "seniority"],
    ["leadLanguageFilter", "language"]
  ];
  for (const [inputId, field] of exactFilters) {
    const value = ($(`${inputId}`) as HTMLSelectElement).value;
    if (value) params.set(`filter[${field}][_eq]`, value);
  }

  const readFilter = ($("leadReadFilter") as HTMLSelectElement).value;
  if (readFilter) params.set("filter[is_read][_eq]", readFilter === "read" ? "true" : "false");

  const expiredFilter = ($("leadExpiredFilter") as HTMLSelectElement).value;
  if (expiredFilter === "hide") {
    params.set("filter[_or][0][is_expired][_neq]", "true");
    params.set("filter[_or][1][is_expired][_null]", "true");
  } else if (expiredFilter === "show") {
    params.set("filter[is_expired][_eq]", "true");
  }

  const scoreMin = $input("leadScoreMinFilter").value;
  const scoreMax = $input("leadScoreMaxFilter").value;
  if (scoreMin !== "") params.set("filter[score][_gte]", String(Number(scoreMin)));
  if (scoreMax !== "") params.set("filter[score][_lte]", String(Number(scoreMax)));
}

function initTabs(): void {
  const savedTab = localStorage.getItem(tabKey) || "setup";
  activateTab(savedTab);
  if (savedTab === "leads") loadLeads().catch(() => {});
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset["tab"] as string;
      activateTab(tab);
      localStorage.setItem(tabKey, tab);
      if (tab === "leads" && leadRows.length === 0) {
        loadLeads().catch((error: Error) => showToast(error.message));
      }
    });
  });
}

function activateTab(tabName: string): void {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["tab"] === tabName);
  });
  document.querySelectorAll<HTMLElement>(".tab-content").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `tab-${tabName}`);
  });
}

function initViewToggle(): void {
  applyView(currentView);
  document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentView = btn.dataset["view"] as string;
      localStorage.setItem(viewKey, currentView);
      applyView(currentView);
      renderLeads();
    });
  });
}

function applyView(view: string): void {
  document.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset["view"] === view);
  });
  $("leadRows").classList.toggle("grid-view", view === "grid");
}

function renderCompactCard(lead: JobLead): string {
  const scoreClass = scoreClassName(lead.score);
  const readClass = lead.is_read ? "read" : "unread";
  return `
    <article class="lead-card compact ${readClass}${lead.is_expired ? " expired" : ""}" data-id="${escapeAttribute(String(lead.id))}">
      <div class="lead-title-row">
        <h3>${escapeHtml(lead.title || "Untitled role")}</h3>
        <span class="score-pill ${scoreClass}">${escapeHtml(String(lead.score ?? "-"))}</span>
      </div>
      <p class="lead-meta">
        ${escapeHtml([lead.company, lead.location].filter(Boolean).join(" · ") || "—")}
      </p>
      <div class="tag-row">
        ${lead.workplace ? `<span>${escapeHtml(lead.workplace)}</span>` : ""}
        ${lead.seniority ? `<span>${escapeHtml(lead.seniority)}</span>` : ""}
        ${lead.language ? `<span>${escapeHtml(lead.language)}</span>` : ""}
        ${lead.salary ? `<span class="salary-pill">${escapeHtml(lead.salary)}</span>` : ""}
        ${lead.is_expired ? `<span class="expired-badge">expired</span>` : ""}
        <span class="read-toggle" data-action="toggle-read" title="Toggle read/unread">${lead.is_read ? "read" : "unread"}</span>
      </div>
      <div class="compact-actions">
        <select data-action="status" aria-label="Status for ${escapeAttribute(lead.title || "lead")}">
          ${statusOptions(lead.status)}
        </select>
        <button type="button" class="secondary" data-action="generate-cv">Generate CV</button>
        ${!lead.is_expired ? `<button type="button" class="secondary" data-action="mark-expired">Mark expired</button>` : ""}
        ${lead.url ? `<a class="button-link" href="${escapeAttribute(lead.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
      </div>
    </article>
  `;
}

function renderLeads(): void {
  const query = normalizeText($input("leadSearch").value);
  const filtered = query
    ? leadRows.filter((lead) => normalizeText([
      lead.title,
      lead.company,
      lead.location,
      lead.workplace,
      lead.seniority,
      lead.language,
      lead.salary,
      lead.notes
    ].join(" ")).includes(query))
    : leadRows;

  const unreadCount = filtered.filter((lead) => !lead.is_read).length;
  $("leadCount").textContent = `${filtered.length} shown. ${unreadCount} unread.`;

  const badge = document.getElementById("leadsTabCount");
  if (badge) badge.textContent = filtered.length ? String(filtered.length) : "";

  $("leadRows").innerHTML = filtered.length
    ? filtered.map(currentView === "grid" ? renderCompactCard : renderLeadCard).join("")
    : `<div class="empty-state">No leads match the current filters.</div>`;
}

function renderLeadCard(lead: JobLead): string {
  const scoreClass = scoreClassName(lead.score);
  const readClass = lead.is_read ? "read" : "unread";
  const visibleNotes = displayLeadNotes(lead.notes);
  return `
    <article class="lead-card ${readClass}${lead.is_expired ? " expired" : ""}" data-id="${escapeAttribute(String(lead.id))}">
      <div class="lead-main">
        <div class="lead-title-row">
          <h3>${escapeHtml(lead.title || "Untitled role")}</h3>
          <span class="score-pill ${scoreClass}">${escapeHtml(String(lead.score ?? "-"))}</span>
        </div>
        <p class="lead-meta">
          ${escapeHtml([lead.company, lead.location].filter(Boolean).join(" · ") || "Company/location unknown")}
        </p>
        <div class="tag-row">
          ${lead.workplace ? `<span>${escapeHtml(lead.workplace)}</span>` : ""}
          ${lead.seniority ? `<span>${escapeHtml(lead.seniority)}</span>` : ""}
          ${lead.language ? `<span>${escapeHtml(lead.language)}</span>` : ""}
          ${lead.salary ? `<span class="salary-pill">${escapeHtml(lead.salary)}</span>` : ""}
          ${lead.is_expired ? `<span class="expired-badge">expired</span>` : ""}
          <span>${lead.is_read ? "read" : "unread"}</span>
        </div>
        ${visibleNotes ? `<p class="lead-notes">${escapeHtml(truncate(visibleNotes, 260))}</p>` : ""}
      </div>
      <div class="lead-actions">
        <select data-action="status" aria-label="Status for ${escapeAttribute(lead.title || "lead")}">
          ${statusOptions(lead.status)}
        </select>
        <button type="button" class="secondary" data-action="toggle-read">
          ${lead.is_read ? "Mark unread" : "Mark read"}
        </button>
        <button type="button" class="secondary" data-action="generate-cv">Generate CV</button>
        ${!lead.is_expired ? `<button type="button" class="secondary" data-action="mark-expired">Mark expired</button>` : ""}
        ${lead.url ? `<a class="button-link" href="${escapeAttribute(lead.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
      </div>
    </article>
  `;
}

function statusOptions(current: string): string {
  return ["new", "shortlisted", "applied", "rejected", "ignored"].map((status) => (
    `<option value="${status}"${status === current ? " selected" : ""}>${status}</option>`
  )).join("");
}

function scoreClassName(score: number | null): string {
  if (score !== null && score >= 75) return "high";
  if (score !== null && score >= 50) return "mid";
  return "low";
}

function displayLeadNotes(notes: string | null): string {
  const text = String(notes || "").trim();
  if (!text) return "";
  const marker = "Description preview:";
  const markerIndex = text.indexOf(marker);
  if (markerIndex !== -1) return text.slice(markerIndex + marker.length).trim();
  // eslint-disable-next-line security/detect-unsafe-regex
  return text.replace(/^Imported from LinkedIn search run \d+:[^\n]*(\n+)?/i, "").trim();
}

async function updateLead(id: string, patch: Partial<JobLead>): Promise<void> {
  await directusRequest(`/items/job_leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  leadRows = leadRows.map((lead) => String(lead.id) === String(id) ? { ...lead, ...patch } : lead);
  renderLeads();
}

function handleLeadListChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  if (target.dataset["action"] !== "status") return;
  const card = target.closest(".lead-card") as HTMLElement;
  updateLead(card.dataset["id"] as string, { status: target.value }).catch((error: Error) => showToast(error.message));
}

function handleLeadListClick(event: Event): void {
  const target = event.target as HTMLElement;
  const action = target.dataset["action"];
  if (!action) return;
  const card = target.closest(".lead-card") as HTMLElement;
  const id = card.dataset["id"] as string;
  const lead = leadRows.find((row) => String(row.id) === String(id));

  if (action === "toggle-read") {
    updateLead(id, { is_read: !lead?.is_read }).catch((error: Error) => showToast(error.message));
  } else if (action === "mark-expired") {
    updateLead(id, { is_expired: true }).catch((error: Error) => showToast(error.message));
  } else if (action === "generate-cv") {
    generateCv(id);
  }
}

async function generateCv(id: string): Promise<void> {
  showToast("Generating CV... This may take a minute.");
  try {
    const response = await fetch(`${importerUrl}/generate-cv`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: id })
    });
    const body = await response.json() as { markdown?: string; fileId?: string; error?: string };
    if (!response.ok) throw new Error(body.error || response.statusText);

    // Open Modal
    $input("cvMarkdown").value = body.markdown || "";
    if (body.fileId) {
      const { directusUrl } = readSettingsFromForm();
      const link = $("downloadPdfLink") as HTMLAnchorElement;
      link.href = `${directusUrl}/assets/${body.fileId}?download`; // codeql[js/xss-through-dom] -- user-configured Directus URL, not injected HTML
      link.style.display = "inline-block";
    } else {
      ($("downloadPdfLink") as HTMLAnchorElement).style.display = "none";
    }
    ($("cvModal") as HTMLDialogElement).showModal();

    showToast("CV generated successfully.");
  } catch (error) {
    console.error(error);
    showToast(`Error: ${(error as Error).message}`);
  }
}

// Modal handling
const closeCvModalBtn = document.getElementById("closeCvModal");
if (closeCvModalBtn) {
  closeCvModalBtn.addEventListener("click", () => {
    ($("cvModal") as HTMLDialogElement).close();
  });
}

async function saveLead(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  setLeadFormStatus("Saving lead...", "");
  const form = new FormData(event.currentTarget as HTMLFormElement);
  const url = String(form.get("url") || "").trim();
  const sourceId = sourceIdFromUrl(url) || sourceIdFromText(url);
  const scoreValue = String(form.get("score") || "").trim();
  const payload = {
    source: "linkedin",
    source_id: sourceId,
    title: String(form.get("title") || "").trim(),
    company: String(form.get("company") || "").trim() || null,
    location: String(form.get("location") || "").trim(),
    workplace: String(form.get("workplace") || "unknown"),
    seniority: String(form.get("seniority") || "unknown"),
    language: String(form.get("language") || "unknown"),
    url,
    apply_url: url,
    status: "new",
    score: scoreValue ? Number(scoreValue) : null,
    salary: String(form.get("salary") || "").trim() || null,
    is_read: false,
    notes: String(form.get("notes") || "").trim()
  };

  await directusRequest("/items/job_leads", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  (event.currentTarget as HTMLFormElement).reset();
  setLeadFormStatus("Lead saved.", "ok");
  showToast("Job lead saved.");
  await loadLeads();
}

async function detectExpired(): Promise<void> {
  const button = $("detectExpired") as HTMLButtonElement;
  button.disabled = true;
  showToast("Detecting expired listings...");
  try {
    const response = await fetch(`${importerUrl}/expire-stale-jobs`, { method: "POST" });
    const body = await response.json() as { expired?: number; error?: string };
    if (!response.ok) throw new Error(body.error || response.statusText);
    showToast(`Marked ${body.expired} listing(s) as expired.`);
    await loadLeads();
  } catch (error) {
    showToast((error as Error).message);
  } finally {
    button.disabled = false;
  }
}

interface ImportSummary {
  created: number;
  salaryUpdated?: number;
  markedExpired?: number;
  skippedExpired?: number;
  parsed: number;
  skippedExisting: number;
  skippedFiltered: number;
  filterReasons?: Record<string, number>;
  failedRuns?: number;
  error?: string;
}

async function importLinkedinJobs(): Promise<void> {
  const button = $("importLinkedinJobs") as HTMLButtonElement;
  const runLimit = Number($input("importRunLimit").value) || 25;
  const maxJobsPerRun = Number($input("importJobsPerRun").value) || 25;

  setImportStatus("Importing jobs...", "");
  button.disabled = true;
  try {
    const response = await fetch(`${importerUrl}/import-linkedin-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [...document.querySelectorAll<HTMLInputElement>("input[name='importSource']:checked")].map((input) => input.value),
        runLimit,
        maxJobsPerRun,
        filters: {
          positiveTech: readLines("positiveTech"),
          negativeSignals: readLines("negativeSignals"),
          minimumScore: Number($input("minimumScore").value) || defaults.minimumScore,
          allowedLanguages: [...document.querySelectorAll<HTMLInputElement>("input[name='allowedLanguage']:checked")].map((input) => input.value),
          blockedLanguages: [...document.querySelectorAll<HTMLInputElement>("input[name='blockedLanguage']:checked")].map((input) => input.value)
        }
      })
    });
    const body = await response.json() as ImportSummary;
    if (!response.ok) throw new Error(body.error || response.statusText);

    const message = [
      `Created ${body.created} job leads.`,
      body.salaryUpdated ? `Updated salaries ${body.salaryUpdated}.` : "",
      body.markedExpired ? `Marked expired ${body.markedExpired}.` : "",
      body.skippedExpired ? `Skipped already-expired ${body.skippedExpired}.` : "",
      `Parsed ${body.parsed}.`,
      `Skipped existing ${body.skippedExisting}.`,
      `Filtered ${body.skippedFiltered}.`,
      formatFilterReasons(body.filterReasons),
      body.failedRuns ? `Failed runs ${body.failedRuns}.` : ""
    ].filter(Boolean).join(" ");

    setImportStatus(message, body.failedRuns ? "error" : "ok");
    showToast(message);
    await loadLeads();
  } catch (error) {
    setImportStatus((error as Error).message, "error");
    showToast((error as Error).message);
  } finally {
    button.disabled = false;
  }
}

function setImportStatus(message: string, state: string): void {
  const element = $("importStatus");
  element.textContent = message;
  element.className = state ? `form-status ${state}` : "form-status";
}

function formatFilterReasons(filterReasons: Record<string, number> | undefined): string {
  const entries = Object.entries(filterReasons || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "";
  return `Reasons: ${entries.map(([reason, count]) => `${reason} ${count}`).join(", ")}.`;
}

function setLeadFormStatus(message: string, state: string): void {
  const element = $("leadFormStatus");
  element.textContent = message;
  element.className = state ? `form-status ${state}` : "form-status";
}

function sourceIdFromUrl(url: string): string {
  const match = url.match(/\/jobs\/view\/(\d+)/);
  return match?.[1] || "";
}

function sourceIdFromText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `manual-${(hash >>> 0).toString(16)}`;
}

function openAll(): void {
  if (!generatedRows.length) generateSearchRows();
  for (const row of generatedRows) window.open(row.url, "_blank", "noreferrer");
}

async function copyUrls(): Promise<void> {
  if (!generatedRows.length) generateSearchRows();
  await navigator.clipboard.writeText(generatedRows.map((row) => row.url).join("\n"));
  showToast("URLs copied to clipboard.");
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] as string));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function truncate(value: string, length: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function normalizeText(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

let leadFilterTimer: ReturnType<typeof setTimeout> | null = null;
function debounceLoadLeads(): void {
  if (leadFilterTimer !== null) clearTimeout(leadFilterTimer);
  leadFilterTimer = setTimeout(() => {
    loadLeads().catch((error: Error) => showToast(error.message));
  }, 300);
}

$("saveSettings").addEventListener("click", saveSettingsToStorage);
$("clearSettings").addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  clearAuthSession();
  applySettings(defaults);
  showToast("Settings cleared.");
});
$("resetDefaults").addEventListener("click", () => applySettings(defaults));
$("testConnection").addEventListener("click", testConnection);
$("loginDirectus").addEventListener("click", () => loginDirectus().catch((error: Error) => {
  $("connectionStatus").className = "status error";
  $("connectionStatus").textContent = "Login failed";
  showToast(error.message);
}));
$("generateSearches").addEventListener("click", generateSearchRows);
$("saveRuns").addEventListener("click", () => saveRuns().catch((error: Error) => showToast(error.message)));
$("openAll").addEventListener("click", openAll);
$("copyUrls").addEventListener("click", () => copyUrls().catch((error: Error) => showToast(error.message)));
$("importLinkedinJobs").addEventListener("click", importLinkedinJobs);
$("loadLeads").addEventListener("click", () => loadLeads().catch((error: Error) => showToast(error.message)));
$("detectExpired").addEventListener("click", () => detectExpired().catch((error: Error) => showToast(error.message)));
$("leadSearch").addEventListener("input", renderLeads);
[
  "leadTitleFilter",
  "leadCompanyFilter",
  "leadLocationFilter",
  "leadNotesFilter",
  "leadSalaryFilter",
  "leadUrlFilter",
  "leadScoreMinFilter",
  "leadScoreMaxFilter"
].forEach((id) => $(id).addEventListener("input", debounceLoadLeads));
[
  "leadStatusFilter",
  "leadReadFilter",
  "leadExpiredFilter",
  "leadWorkplaceFilter",
  "leadSeniorityFilter",
  "leadLanguageFilter",
  "leadSort",
  "leadLimit"
].forEach((id) => $(id).addEventListener("change", () => loadLeads().catch((error: Error) => showToast(error.message))));
$("leadRows").addEventListener("change", handleLeadListChange);
$("leadRows").addEventListener("click", handleLeadListClick);
$("leadForm").addEventListener("submit", (event) => saveLead(event as SubmitEvent).catch((error: Error) => {
  setLeadFormStatus(error.message, "error");
  showToast(error.message);
}));

applySettings(loadSettings());
generateSearchRows();
initTabs();
initViewToggle();
