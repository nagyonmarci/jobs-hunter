import { parseArgs } from "node:util";
import { importLinkedInJobs } from "./import-linkedin-jobs.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "run-limit": { type: "string", default: "25" },
    "max-jobs-per-run": { type: "string", default: "25" }
  }
});

const summary = await importLinkedInJobs({
  dryRun: values["dry-run"],
  runLimit: Number(values["run-limit"]),
  maxJobsPerRun: Number(values["max-jobs-per-run"]),
  logger: (message) => console.log(message)
});

console.log(JSON.stringify(summary, null, 2));
