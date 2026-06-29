import http from "node:http";
import { importLinkedInJobs } from "./linkedin-importer.mjs";
import { createDirectusClient } from "./directus-client.mjs";

const EXPIRE_AFTER_DAYS = Number(process.env.EXPIRE_AFTER_DAYS || 30);
const EXPIRE_CHECK_MS = Number(process.env.EXPIRE_CHECK_INTERVAL_HOURS || 24) * 3_600_000;
const SCHEDULED_RUN_LIMIT = process.env.SCHEDULED_RUN_LIMIT
  ? Number(process.env.SCHEDULED_RUN_LIMIT)
  : -1;
const SCHEDULED_MAX_JOBS_PER_RUN = process.env.SCHEDULED_MAX_JOBS_PER_RUN
  ? Number(process.env.SCHEDULED_MAX_JOBS_PER_RUN)
  : -1;

const port = Number(process.env.IMPORT_SERVER_PORT || 4180);
let corsOrigin = "http://localhost:4173";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/import-linkedin-jobs") {
    try {
      const body = await readJsonBody(request);
      const summary = await importLinkedInJobs({
        sources: body.sources || ["linkedin"],
        runLimit: Number(body.runLimit) > 0 ? Number(body.runLimit) : 25,
        maxJobsPerRun: Number(body.maxJobsPerRun) > 0 ? Number(body.maxJobsPerRun) : 25,
        filters: body.filters || {},
        dryRun: Boolean(body.dryRun)
      });
      sendJson(response, 200, summary);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/generate-cv") {
    try {
      const body = await readJsonBody(request);
      if (!body.jobId) {
        return sendJson(response, 400, { error: "jobId is required" });
      }

      // Dynamic import to avoid loading Puppeteer and heavy LLM libs until needed
      const { processCvGeneration } = await import("./generate-cv.mjs");
      const result = await processCvGeneration(body.jobId);

      sendJson(response, 200, result);
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/expire-stale-jobs") {
    try {
      const result = await expireStaleJobs();
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

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

server.listen(port, async () => {
  console.log(`LinkedIn importer listening on http://0.0.0.0:${port}`);
  try {
    const d = await createDirectusClient();
    const { data } = await d.request("/items/app_settings");
    if (data?.cors_origin) corsOrigin = data.cors_origin;
  } catch (e) {
    console.warn("Could not load cors_origin from app_settings:", e.message);
  }
  setTimeout(() => scheduledRun().catch(console.error), 60_000);
  setInterval(() => scheduledRun().catch(console.error), EXPIRE_CHECK_MS);
});

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", corsOrigin);
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function expireStaleJobs() {
  const directus = await createDirectusClient();
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_DAYS * 86_400_000).toISOString();

  const { data: jobs } = await directus.request(
    "/items/job_leads?filter[is_expired][_neq]=true&fields=id,source,url,date_created&limit=-1"
  );

  const toExpire = [];

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

    if (job.date_created && job.date_created < cutoff) {
      toExpire.push(job.id);
    }
  }

  if (toExpire.length > 0) {
    await directus.request("/items/job_leads", {
      method: "PATCH",
      body: JSON.stringify({ keys: toExpire, data: { is_expired: true } })
    });
  }

  return { expired: toExpire.length };
}
