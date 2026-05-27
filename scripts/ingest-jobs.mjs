import fs from "node:fs/promises";
import { createDirectusClient } from "./directus-client.mjs";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node scripts/ingest-jobs.mjs data/jobs.json");
}

const directus = await createDirectusClient();
const jobs = JSON.parse(await fs.readFile(inputPath, "utf8"));

function required(value, name) {
  if (!value) throw new Error(`Job is missing required field: ${name}`);
  return value;
}

async function findExistingByUrl(url) {
  const params = new URLSearchParams({
    "filter[url][_eq]": url,
    limit: "1",
    fields: "id,url"
  });
  const response = await directus.request(`/items/job_leads?${params.toString()}`);
  return response.data?.[0] || null;
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
    is_read: Boolean(job.is_read),
    notes: job.notes || null
  };

  const existing = await findExistingByUrl(payload.url);
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
