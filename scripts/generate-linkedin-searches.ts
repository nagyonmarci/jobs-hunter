import fs from "node:fs/promises";
import { createDirectusClient } from "./directus-client.js";
import { buildLinkedInSearchUrl } from "./linkedin-url.js";
import type { Config, JobSearchRun } from "./types.js";

const config = JSON.parse(await fs.readFile("config/searches.json", "utf8")) as Config;
const dryRun = process.argv.includes("--dry-run");
const directus = dryRun ? null : await createDirectusClient();

const rows: JobSearchRun[] = [];

for (const keyword of config.filters.keywords) {
  const query = [
    keyword,
    ...(config.filters.excludeKeywords || []).map((term) => `NOT ${term}`)
  ].join(" ");
  for (const location of config.filters.hybridLocations || []) {
    rows.push({
      source: "linkedin",
      query,
      location,
      workplace: "hybrid",
      url: buildLinkedInSearchUrl({ keyword, location, workplace: "hybrid" }, config),
      generated_at: new Date().toISOString()
    });
  }

  for (const location of config.filters.remoteLocations || []) {
    rows.push({
      source: "linkedin",
      query,
      location,
      workplace: "remote",
      url: buildLinkedInSearchUrl({ keyword, location, workplace: "remote" }, config),
      generated_at: new Date().toISOString()
    });
  }
}

if (!dryRun) {
  if (!directus) throw new Error("Directus client unavailable.");
  for (const row of rows) {
    await directus.request("/items/job_search_runs", {
      method: "POST",
      body: JSON.stringify(row)
    });
  }
}

console.log(
  dryRun
    ? `Generated ${rows.length} LinkedIn search URLs. Dry run: not stored in Directus.`
    : `Generated and stored ${rows.length} LinkedIn search URLs.`
);
for (const row of rows)
  console.log(`${row.workplace.padEnd(6)} ${row.location.padEnd(28)} ${row.query} ${row.url}`);
