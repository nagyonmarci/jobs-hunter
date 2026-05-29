import http from "node:http";
import { importLinkedInJobs } from "./import-linkedin-jobs.js";
import type { ImportOptions } from "./types.js";

const port = Number(process.env.IMPORT_SERVER_PORT || 4180);

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
      const body = (await readJsonBody(request)) as ImportOptions;
      const summary = await importLinkedInJobs({
        sources: body.sources || ["linkedin"],
        runLimit: numberOrDefault(body.runLimit, 25),
        maxJobsPerRun: numberOrDefault(body.maxJobsPerRun, 25),
        filters: body.filters || {},
        dryRun: Boolean(body.dryRun)
      });
      sendJson(response, 200, summary);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`LinkedIn importer listening on http://0.0.0.0:${port}`);
});

function setCorsHeaders(response: http.ServerResponse): void {
  response.setHeader("access-control-allow-origin", "http://localhost:4173");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += String(chunk);
  return raw ? JSON.parse(raw) : {};
}

function numberOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
