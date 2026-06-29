import { importLinkedInJobs } from "./import-linkedin-jobs.js";

const dryRun = process.argv.includes("--dry-run");
const runLimit = readNumberArg("--run-limit", 25);
const maxJobsPerRun = readNumberArg("--max-jobs-per-run", 25);

const summary = await importLinkedInJobs({
  dryRun,
  runLimit,
  maxJobsPerRun,
  logger: (message) => console.log(message)
});

console.log(JSON.stringify(summary, null, 2));

function readNumberArg(name: string, fallback: number): number {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return Number(inline.slice(name.length + 1));

  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return Number(process.argv[index + 1]);

  return fallback;
}
