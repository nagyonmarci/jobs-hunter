import fs from "node:fs/promises";
import { createDirectusClient, findExistingByUrl } from "./directus-client.js";
import type { Job } from "./types.js";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node --import tsx/esm scripts/ingest-jobs.ts data/jobs.json");
}

const directus = await createDirectusClient();
const jobs = JSON.parse(await fs.readFile(inputPath, "utf8")) as Job[];

function required(value: string | null | undefined, name: string): string {
  if (!value) throw new Error(`Job is missing required field: ${name}`);
  return value;
}

let created = 0;
let skipped = 0;

for (const job of jobs) {
  const payload = {
    source: required(job.source, "source"),
    source_id: required(job.source_id, "source_id"),
    title: required(job.title, "title"),
    company: job.company || null,
    location: job.location || null,
    workplace: job.workplace || "unknown",
    seniority: job.seniority || "unknown",
    language: job.language || "unknown",
    url: required(job.url, "url"),
    apply_url: job.apply_url || job.url,
    status: job.status || "new",
    score: Number.isInteger(job.score) ? job.score : null,
    salary: job.salary || null,
    is_read: Boolean(job.is_read),
    notes: job.notes || null
  };

  const existing = await findExistingByUrl(directus, payload.url);
  if (existing) {
    skipped += 1;
    continue;
  }

  await directus.request("/items/job_leads", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  created += 1;
}

console.log(`Ingest complete. Created: ${created}. Skipped existing: ${skipped}.`);
