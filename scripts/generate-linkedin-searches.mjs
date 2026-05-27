import fs from "node:fs/promises";
import { createDirectusClient } from "./directus-client.mjs";

const config = JSON.parse(await fs.readFile("config/searches.json", "utf8"));
const dryRun = process.argv.includes("--dry-run");
const directus = dryRun ? null : await createDirectusClient();

const experienceMap = {
  internship: "1",
  entry: "2",
  associate: "3",
  "mid-senior": "4"
};

function linkedInSearchUrl({ keyword, location, workplace }) {
  const excludeKeywords = config.filters.excludeKeywords || [];
  const searchQuery = [keyword, ...excludeKeywords.map((term) => `NOT ${term}`)].join(" ");
  const params = new URLSearchParams({
    keywords: searchQuery,
    location,
    f_WT: workplace === "remote" ? "2" : "3",
    f_TPR: config.filters.postedWithin,
    f_E: config.filters.experienceLevels.map((level) => experienceMap[level]).filter(Boolean).join(",")
  });

  return `${config.source.linkedin.baseUrl}?${params.toString()}`;
}

const rows = [];

for (const keyword of config.filters.keywords) {
  const query = [keyword, ...(config.filters.excludeKeywords || []).map((term) => `NOT ${term}`)].join(" ");
  for (const location of config.filters.hybridLocations) {
    rows.push({
      source: "linkedin",
      query,
      location,
      workplace: "hybrid",
      url: linkedInSearchUrl({ keyword, location, workplace: "hybrid" }),
      generated_at: new Date().toISOString()
    });
  }

  for (const location of config.filters.remoteLocations) {
    rows.push({
      source: "linkedin",
      query,
      location,
      workplace: "remote",
      url: linkedInSearchUrl({ keyword, location, workplace: "remote" }),
      generated_at: new Date().toISOString()
    });
  }
}

if (!dryRun) {
  for (const row of rows) {
    await directus.request("/items/job_search_runs", {
      method: "POST",
      body: JSON.stringify(row)
    });
  }
}

console.log(dryRun
  ? `Generated ${rows.length} LinkedIn search URLs. Dry run: not stored in Directus.`
  : `Generated and stored ${rows.length} LinkedIn search URLs.`
);
for (const row of rows) console.log(`${row.workplace.padEnd(6)} ${row.location.padEnd(28)} ${row.query} ${row.url}`);
