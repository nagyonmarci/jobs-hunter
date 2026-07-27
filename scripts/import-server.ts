import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { importLinkedInJobs } from "./import-linkedin-jobs.js";
import {
  listJobLeads,
  createJobLead,
  updateJobLead,
  listExpirableJobLeads,
  bulkMarkExpired,
  createJobSearchRun,
  getAppSettings,
  updateAppSettings,
  getBaseCv,
  updateBaseCv
} from "./db.js";
import type {
  JobLeadFilters,
  NewJobLead,
  JobLeadPatch,
  NewJobSearchRun,
  AppSettingsRow
} from "./db.js";
import type { ImportOptions } from "./types.js";

const EXPIRE_AFTER_DAYS = Number(process.env.EXPIRE_AFTER_DAYS || 30);
const EXPIRE_CHECK_MS = Number(process.env.EXPIRE_CHECK_INTERVAL_HOURS || 24) * 3_600_000;
const SCHEDULED_RUN_LIMIT = process.env.SCHEDULED_RUN_LIMIT
  ? Number(process.env.SCHEDULED_RUN_LIMIT)
  : -1;
const SCHEDULED_MAX_JOBS_PER_RUN = process.env.SCHEDULED_MAX_JOBS_PER_RUN
  ? Number(process.env.SCHEDULED_MAX_JOBS_PER_RUN)
  : -1;

const port = Number(process.env.IMPORT_SERVER_PORT || 4180);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-please";

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "admin.html", type: "text/html" },
  "/admin.html": { file: "admin.html", type: "text/html" },
  "/admin.js": { file: "admin.js", type: "text/javascript" },
  "/styles.css": { file: "styles.css", type: "text/css" }
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function isAuthorized(request: http.IncomingMessage): boolean {
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  return (
    safeEqual(decoded.slice(0, separator), ADMIN_USER) &&
    safeEqual(decoded.slice(separator + 1), ADMIN_PASSWORD)
  );
}

function requireAuth(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  if (isAuthorized(request)) return true;
  response.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": 'Basic realm="Job Search Admin"'
  });
  response.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

const server = http.createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
  }
});

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const url = new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!requireAuth(request, response)) return;

  const staticFile = request.method === "GET" ? STATIC_FILES[pathname] : undefined;
  if (staticFile) {
    await serveStatic(response, staticFile.file, staticFile.type);
    return;
  }

  if (request.method === "GET" && pathname === "/api/job-leads") {
    const rows = await listJobLeads(parseJobLeadFilters(url.searchParams));
    sendJson(response, 200, rows);
    return;
  }

  if (request.method === "POST" && pathname === "/api/job-leads") {
    const body = (await readJsonBody(request)) as NewJobLead;
    const row = await createJobLead(body);
    sendJson(response, 200, row);
    return;
  }

  const leadIdMatch = /^\/api\/job-leads\/(\d+)$/.exec(pathname);
  const leadId = leadIdMatch?.[1];
  if (request.method === "PATCH" && leadId) {
    const body = (await readJsonBody(request)) as JobLeadPatch;
    const row = await updateJobLead(Number(leadId), body);
    sendJson(response, 200, row);
    return;
  }

  if (request.method === "POST" && pathname === "/api/job-search-runs") {
    const body = (await readJsonBody(request)) as NewJobSearchRun;
    const row = await createJobSearchRun(body);
    sendJson(response, 200, row);
    return;
  }

  if (request.method === "GET" && pathname === "/api/app-settings") {
    sendJson(response, 200, await getAppSettings());
    return;
  }

  if (request.method === "PATCH" && pathname === "/api/app-settings") {
    const body = (await readJsonBody(request)) as Partial<Omit<AppSettingsRow, "id">>;
    sendJson(response, 200, await updateAppSettings(body));
    return;
  }

  if (request.method === "GET" && pathname === "/api/base-cv") {
    sendJson(response, 200, await getBaseCv());
    return;
  }

  if (request.method === "PATCH" && pathname === "/api/base-cv") {
    const body = (await readJsonBody(request)) as { content?: string };
    sendJson(response, 200, await updateBaseCv(body.content || ""));
    return;
  }

  const cvMatch = /^\/cvs\/([A-Za-z0-9_-]+\.pdf)$/.exec(pathname);
  const cvFilename = cvMatch?.[1];
  if (request.method === "GET" && cvFilename) {
    try {
      const pdf = await fs.readFile(path.resolve("data/cvs", cvFilename));
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(pdf);
    } catch {
      sendJson(response, 404, { error: "Not found" });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/import-linkedin-jobs") {
    try {
      const body = (await readJsonBody(request)) as ImportOptions;
      const summary = await importLinkedInJobs({
        sources: body.sources || ["linkedin"],
        runLimit: Number(body.runLimit) > 0 ? Number(body.runLimit) : 25,
        maxJobsPerRun: Number(body.maxJobsPerRun) > 0 ? Number(body.maxJobsPerRun) : 25,
        filters: body.filters || {},
        dryRun: Boolean(body.dryRun)
      });
      sendJson(response, 200, summary);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      sendJson(response, 500, { error: "Import failed" });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/generate-cv") {
    try {
      const body = (await readJsonBody(request)) as { jobId?: string };
      if (!body.jobId) {
        sendJson(response, 400, { error: "jobId is required" });
        return;
      }

      // Dynamic import to avoid loading Puppeteer and heavy LLM libs until needed
      const { processCvGeneration } = await import("./generate-cv.js");
      const result = await processCvGeneration(body.jobId);

      sendJson(response, 200, result);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      sendJson(response, 500, { error: "CV generation failed" });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/expire-stale-jobs") {
    try {
      const result = await expireStaleJobs();
      sendJson(response, 200, result);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      sendJson(response, 500, { error: "Expire check failed" });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function parseJobLeadFilters(params: URLSearchParams): JobLeadFilters {
  const filters: JobLeadFilters = {};
  const get = (key: string) => params.get(key) || undefined;

  filters.title = get("title");
  filters.company = get("company");
  filters.location = get("location");
  filters.notes = get("notes");
  filters.salary = get("salary");
  filters.url = get("url");
  filters.status = get("status");
  filters.workplace = get("workplace");
  filters.seniority = get("seniority");
  filters.language = get("language");
  filters.sort = get("sort");
  if (params.has("is_read")) filters.is_read = params.get("is_read") === "true";
  const expired = params.get("expired");
  if (expired === "hide" || expired === "show") filters.expired = expired;
  if (params.has("score_min")) filters.score_min = Number(params.get("score_min"));
  if (params.has("score_max")) filters.score_max = Number(params.get("score_max"));
  if (params.has("limit")) filters.limit = Number(params.get("limit"));
  return filters;
}

async function scheduledRun() {
  const summary = await importLinkedInJobs({
    runLimit: SCHEDULED_RUN_LIMIT,
    maxJobsPerRun: SCHEDULED_MAX_JOBS_PER_RUN
  });
  console.log(
    `Scheduled import: created ${summary.created}, markedExpired ${summary.markedExpired ?? 0}.`
  );
  const { expired } = await expireStaleJobs();
  console.log(`Expire check: ${expired} expired.`);
}

server.listen(port, () => {
  console.log(`Job search admin listening on http://0.0.0.0:${port}`);
  setTimeout(() => scheduledRun().catch(console.error), 60_000);
  setInterval(() => scheduledRun().catch(console.error), EXPIRE_CHECK_MS);
});

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function serveStatic(
  response: http.ServerResponse,
  file: string,
  type: string
): Promise<void> {
  try {
    const content = await fs.readFile(path.resolve("public", file));
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += String(chunk);
  return raw ? JSON.parse(raw) : {};
}

async function expireStaleJobs(): Promise<{ expired: number }> {
  const cutoff = Date.now() - EXPIRE_AFTER_DAYS * 86_400_000;
  const jobs = await listExpirableJobLeads();

  const toExpire: number[] = [];

  for (const job of jobs) {
    if (job.source !== "linkedin") {
      try {
        const r = await fetch(job.url, { method: "HEAD", redirect: "follow" });
        if (r.status === 404) {
          toExpire.push(job.id);
          continue;
        }
      } catch {
        // network error: fall through to time-based check
      }
    }

    if (job.date_created && job.date_created.getTime() < cutoff) {
      toExpire.push(job.id);
    }
  }

  await bulkMarkExpired(toExpire);

  return { expired: toExpire.length };
}
