import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createDirectusClient, findExistingByUrl } from "./directus-client.js";
import type {
  Config,
  DirectusClient,
  ImportOptions,
  ImportSummary,
  Job,
  JobLanguage,
  JobSearchRun,
  JobSeniority,
  JobWorkplace
} from "./types.js";

const defaultConfigPath = "config/searches.json";

interface ExistingJob {
  id: string;
  url: string;
  salary: string | null;
  is_expired?: boolean;
}

interface ScoreInput {
  title: string;
  location?: string | null;
  description?: string | null;
  run: JobSearchRun;
  config: Config;
}

interface JustJoinItOffer {
  slug?: string;
  title?: string;
  guid?: string;
  companyName?: string;
  city?: string;
  street?: string;
  workplaceType?: string;
  experienceLevel?: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  employmentTypes?: SalaryEmploymentType[];
}

interface SalaryEmploymentType {
  from?: number | string | null;
  to?: number | string | null;
  fromPerUnit?: number | string | null;
  toPerUnit?: number | string | null;
  currencySource?: string;
  currency?: string;
  type?: string;
  unit?: string;
  gross?: boolean;
}

interface EuroTopTechCard {
  title: string;
  company: string;
  location: string;
  workplace: string;
  seniority: string;
  compensation: string;
}

export async function importLinkedInJobs({
  directus = null,
  configPath = defaultConfigPath,
  filters = {},
  sources = ["linkedin"],
  runLimit = 25,
  maxJobsPerRun = 25,
  dryRun = false,
  logger = () => {}
}: ImportOptions = {}): Promise<ImportSummary> {
  const config = JSON.parse(await fs.readFile(configPath, "utf8")) as Config;
  config.filters = {
    ...config.filters,
    ...filters
  };
  const client = directus || (await createDirectusClient());
  const runs = await loadSourceRuns(client, config, sources, runLimit);
  const summary: ImportSummary = {
    runs: runs.length,
    fetched: 0,
    parsed: 0,
    created: 0,
    salaryUpdated: 0,
    skippedExisting: 0,
    skippedFiltered: 0,
    markedExpired: 0,
    skippedExpired: 0,
    filterReasons: {},
    failedRuns: 0,
    dryRun,
    failures: []
  };

  for (const run of runs) {
    try {
      logger(`Fetching ${run.workplace} ${run.location}: ${run.query}`);
      const html = await fetchSourceHtml(run.url);
      summary.fetched += 1;

      const allJobs = extractJobsForRun(html, run, config);
      const jobs = maxJobsPerRun > 0 ? allJobs.slice(0, maxJobsPerRun) : allJobs;
      summary.parsed += jobs.length;

      for (const job of jobs) {
        const initialFilterReason = wantedJobFilterReason(job, config);
        if (initialFilterReason) {
          summary.skippedFiltered += 1;
          summary.filterReasons[initialFilterReason] =
            (summary.filterReasons[initialFilterReason] ?? 0) + 1;
          continue;
        }

        const enrichedJob = await enrichJob(job).catch(() => ({
          ...job,
          language: detectLanguage(`${job.title} ${job.notes || ""}`)
        }));
        enrichedJob.score = scoreJob({
          title: enrichedJob.title,
          location: enrichedJob.location,
          description: enrichedJob.notes,
          run,
          config
        });

        const enrichedFilterReason = enrichedJobFilterReason(enrichedJob, config);
        if (enrichedFilterReason) {
          summary.skippedFiltered += 1;
          summary.filterReasons[enrichedFilterReason] =
            (summary.filterReasons[enrichedFilterReason] ?? 0) + 1;
          continue;
        }

        const existing = dryRun
          ? null
          : await findExistingByUrl<ExistingJob>(
              client,
              enrichedJob.url,
              "id,url,is_expired,salary"
            );
        if (existing) {
          if (enrichedJob.no_longer_accepting && !existing.is_expired) {
            await client.request(`/items/job_leads/${encodeURIComponent(existing.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ is_expired: true })
            });
            summary.markedExpired += 1;
          }
          if (!existing.salary && enrichedJob.salary) {
            await client.request(`/items/job_leads/${encodeURIComponent(existing.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ salary: enrichedJob.salary })
            });
            summary.salaryUpdated += 1;
          }
          summary.skippedExisting += 1;
          continue;
        }

        if (enrichedJob.no_longer_accepting) {
          summary.skippedExpired += 1;
          continue;
        }

        if (!dryRun) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { no_longer_accepting: _, ...jobPayload } = enrichedJob;
          await client.request("/items/job_leads", {
            method: "POST",
            body: JSON.stringify(jobPayload)
          });
        }
        summary.created += 1;
      }
    } catch (error) {
      summary.failedRuns += 1;
      summary.failures.push({
        run: run.id || run.url,
        url: run.url,
        message: error instanceof Error ? error.message : String(error)
      });
      logger(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}

export async function loadSearchRuns(
  directus: DirectusClient,
  limit: number
): Promise<JobSearchRun[]> {
  const params = new URLSearchParams({
    sort: "-id",
    limit: String(limit),
    fields: "id,source,query,location,workplace,url,generated_at"
  });
  const response = (await directus.request(`/items/job_search_runs?${params.toString()}`)) as {
    data?: JobSearchRun[];
  };
  return (response.data || []).filter((run) => run.source === "linkedin" && run.url);
}

async function loadSourceRuns(
  directus: DirectusClient,
  config: Config,
  sources: string[],
  runLimit: number
): Promise<JobSearchRun[]> {
  const requested = new Set(sources?.length ? sources : ["linkedin"]);
  const runs: JobSearchRun[] = [];
  if (requested.has("linkedin")) {
    runs.push(...(await loadSearchRuns(directus, runLimit)));
  }
  if (requested.has("justjoinit")) {
    runs.push(
      ...(config.source?.justjoinit?.searchUrls?.length
        ? config.source.justjoinit.searchUrls
        : ["https://justjoin.it/job-offers/poland-remote/devops"]
      ).map((url, index) => ({
        id: `justjoinit-${index + 1}`,
        source: "justjoinit",
        query: "DevOps remote",
        location: "Poland",
        workplace: "remote",
        url
      }))
    );
  }
  if (requested.has("nofluffjobs")) {
    runs.push(
      ...(config.source?.nofluffjobs?.searchUrls?.length
        ? config.source.nofluffjobs.searchUrls
        : ["https://nofluffjobs.com/pl/devops/remote"]
      ).map((url, index) => ({
        id: `nofluffjobs-${index + 1}`,
        source: "nofluffjobs",
        query: "DevOps remote",
        location: "Poland",
        workplace: "remote",
        url
      }))
    );
  }
  if (requested.has("weworkremotely")) {
    runs.push(
      ...(config.source?.weworkremotely?.searchUrls?.length
        ? config.source.weworkremotely.searchUrls
        : ["https://weworkremotely.com/categories/remote-devops-sysadmin-jobs"]
      ).map((url, index) => ({
        id: `weworkremotely-${index + 1}`,
        source: "weworkremotely",
        query: "DevOps remote",
        location: "Remote",
        workplace: "remote",
        url
      }))
    );
  }
  if (requested.has("eurotoptech")) {
    runs.push(
      ...(config.source?.eurotoptech?.searchUrls?.length
        ? config.source.eurotoptech.searchUrls
        : ["https://www.eurotoptech.com/jobs/role/devops"]
      ).map((url, index) => ({
        id: `eurotoptech-${index + 1}`,
        source: "eurotoptech",
        query: "DevOps Europe",
        location: "Europe",
        workplace: "unknown",
        url
      }))
    );
  }
  return runs;
}

export async function fetchSourceHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,hu;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`Source returned ${response.status} for ${url}`);
  }
  return response.text();
}

async function enrichJob(job: Job): Promise<Job> {
  if (job.source === "linkedin") return enrichLinkedInJob(job);
  if (job.source === "justjoinit") return enrichJustJoinItJob(job);
  return {
    ...job,
    language: job.language || detectLanguage(`${job.title} ${job.notes || ""}`)
  };
}

async function enrichJustJoinItJob(job: Job): Promise<Job> {
  const html = await fetchSourceHtml(job.url);
  return {
    ...job,
    no_longer_accepting: html.includes("Offer expired")
  };
}

export async function enrichLinkedInJob(job: Job): Promise<Job> {
  const html = await fetchSourceHtml(job.url);
  const title =
    firstText(html, [
      /class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
      /class="[^"]*topcard__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
    ]) || job.title;
  const company =
    firstText(html, [
      /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /class="[^"]*topcard__flavor[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    ]) || job.company;
  const description = firstText(html, [
    /class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  ]);
  const language = detectLanguage(`${title} ${description}`);

  return {
    ...job,
    title,
    company: company || job.company || null,
    language,
    notes: description ? description.slice(0, 600) : job.notes,
    no_longer_accepting: html.includes("No longer accepting applications")
  };
}

export function extractLinkedInJobs(html: string, run: JobSearchRun, config: Config): Job[] {
  const segments = extractJobCardSegments(html);
  const jobs: Job[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const sourceId = extractJobId(segment);
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const title =
      firstText(segment, [
        /class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
        /class="[^"]*job-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
        /aria-label="([^"]+)"/i
      ]) || `LinkedIn job ${sourceId}`;

    const company = firstText(segment, [
      /class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i,
      /class="[^"]*job-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i
    ]);

    const location =
      firstText(segment, [
        /class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
        /class="[^"]*job-search-card__metadata-item[^"]*"[^>]*>([\s\S]*?)<\/span>/i
      ]) ||
      run.location ||
      null;

    jobs.push({
      source: "linkedin",
      source_id: sourceId,
      title,
      company: company || null,
      location,
      workplace: mapWorkplace(run.workplace, inferWorkplace(run.location)),
      seniority: inferSeniority(title, run.query),
      language: "unknown",
      url: `https://www.linkedin.com/jobs/view/${sourceId}/`,
      apply_url: `https://www.linkedin.com/jobs/view/${sourceId}/`,
      status: "new",
      score: scoreJob({ title, location, run, config }),
      salary: null,
      is_read: false,
      notes: null
    });
  }

  return jobs;
}

function extractJobsForRun(html: string, run: JobSearchRun, config: Config): Job[] {
  if (run.source === "justjoinit") return extractJustJoinItJobs(html, run, config);
  if (run.source === "nofluffjobs") return extractNoFluffJobs(html, run, config);
  if (run.source === "weworkremotely") return extractWeWorkRemotelyJobs(html, run, config);
  if (run.source === "eurotoptech") return extractEuroTopTechJobs(html, run, config);
  return extractLinkedInJobs(html, run, config);
}

function extractJustJoinItJobs(html: string, run: JobSearchRun, config: Config): Job[] {
  const offers = extractJustJoinItOffers(html);
  const seen = new Set<string>();
  return offers
    .filter((offer) => offer?.slug && offer?.title && !seen.has(offer.slug) && seen.add(offer.slug))
    .map((offer) => {
      const notes = [...(offer.requiredSkills || []), ...(offer.niceToHaveSkills || [])]
        .filter(Boolean)
        .join(", ");
      const salary = formatJustJoinItSalary(offer.employmentTypes);
      const location = [offer.city, offer.street].filter(Boolean).join(", ") || run.location;
      return {
        source: "justjoinit",
        source_id: offer.guid || offer.slug || "",
        title: offer.title || "",
        company: offer.companyName || null,
        location,
        workplace: mapWorkplace(offer.workplaceType, run.workplace),
        seniority: mapSeniority(offer.experienceLevel, offer.title),
        language: detectLanguage(`${offer.title} ${notes}`),
        url: `https://justjoin.it/job-offer/${offer.slug}`,
        apply_url: `https://justjoin.it/job-offer/${offer.slug}`,
        status: "new",
        score: scoreJob({ title: offer.title || "", location, description: notes, run, config }),
        salary,
        is_read: false,
        notes: notes || null
      };
    });
}

function extractJustJoinItOffers(html: string): JustJoinItOffer[] {
  const offers: JustJoinItOffer[] = [];
  let searchFrom = 0;
  const marker = '\\"data\\":[';
  while (true) {
    const markerIndex = html.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
    const start = html.indexOf("[", markerIndex);
    const end = findBalancedEnd(html, start, "[", "]");
    if (start === -1 || end === -1) break;
    const raw = html.slice(start, end);
    searchFrom = end;
    try {
      const decoded = JSON.parse(`"${raw.replace(/\n/g, "\\n")}"`);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed) && parsed.some((item) => item?.slug && item?.companyName)) {
        offers.push(...parsed);
      }
    } catch {
      // Ignore non-offer data arrays embedded in the page stream.
    }
  }
  return offers;
}

function formatJustJoinItSalary(employmentTypes: SalaryEmploymentType[] = []): string | null {
  const paidTypes = employmentTypes.filter(
    (item) =>
      item &&
      (Number.isFinite(Number(item.from)) ||
        Number.isFinite(Number(item.to)) ||
        Number.isFinite(Number(item.fromPerUnit)) ||
        Number.isFinite(Number(item.toPerUnit)))
  );
  if (!paidTypes.length) return null;

  const preferred = paidTypes.filter((item) => item.currencySource === "original");
  const items = preferred.length ? preferred : paidTypes.filter((item) => item.currency === "EUR");
  const source = items.length ? items : paidTypes;
  const seen = new Set();
  const formatted = source
    .map((item) => {
      const from = item.from ?? item.fromPerUnit;
      const to = item.to ?? item.toPerUnit;
      const amount = formatSalaryRange(from, to);
      if (!amount) return "";
      const key = `${item.type}|${amount}|${item.currency}|${item.unit}|${item.gross}`;
      if (seen.has(key)) return "";
      seen.add(key);
      const type = item.type ? `${item.type}: ` : "";
      const unit = item.unit ? `/${item.unit}` : "";
      const gross = typeof item.gross === "boolean" ? ` ${item.gross ? "gross" : "net"}` : "";
      return `${type}${amount} ${item.currency || ""}${unit}${gross}`.trim();
    })
    .filter(Boolean);

  return formatted.slice(0, 3).join("; ") || null;
}

function extractNoFluffJobs(html: string, run: JobSearchRun, config: Config): Job[] {
  const cards: Job[] = [];
  const cardPattern =
    /<a\b[^>]*class="[^"]*posting-list-item[^"]*"[^>]*href="([^"]+)"[\s\S]*?<\/a>/gi;
  for (const match of html.matchAll(cardPattern)) {
    const href = decodeHtml(match[1] || "");
    const segment = match[0];
    const sourceId = href.split("/").filter(Boolean).pop();
    const title = firstText(segment, [
      /class="[^"]*posting-title__position[^"]*"[^>]*>([\s\S]*?)<\/h3>/i
    ]);
    if (!sourceId || !title) continue;
    const company = firstText(segment, [/class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/h4>/i]);
    const tags = [...segment.matchAll(/class="[^"]*posting-tag[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((tag) => cleanText(tag[1] || ""))
      .filter(Boolean);
    const language = tags.some((tag) => /angielski|english/i.test(tag))
      ? "english"
      : tags.some((tag) => /polski|polish/i.test(tag))
        ? "other"
        : detectLanguage(`${title} ${tags.join(" ")}`);
    const location =
      firstText(segment, [/class="[^"]*tw-text-ellipsis[^"]*"[^>]*>([\s\S]*?)<\/span>/i]) ||
      run.location;
    const url = href.startsWith("http") ? href : `https://nofluffjobs.com${href}`;
    const notes = tags.join(", ");
    const salary = extractNoFluffJobsSalary(segment);
    cards.push({
      source: "nofluffjobs",
      source_id: sourceId,
      title,
      company: company || null,
      location,
      workplace: /zdalnie|remote/i.test(location) ? "remote" : mapWorkplace(run.workplace),
      seniority: inferSeniority(title, run.query),
      language,
      url,
      apply_url: url,
      status: "new",
      score: scoreJob({ title, location, description: notes, run, config }),
      salary,
      is_read: false,
      notes: notes || null
    });
  }
  return cards;
}

function extractNoFluffJobsSalary(segment: string): string | null {
  const text = cleanText(segment).replace(/\u00a0/g, " ");
  const match = /(\d[\d\s]{1,12})\s*[–-]\s*(\d[\d\s]{1,12})\s*(PLN|EUR|USD|GBP|CHF)\b/i.exec(text);
  if (!match) return null;
  return `${formatSalaryNumber(match[1] || "")} - ${formatSalaryNumber(match[2] || "")} ${(
    match[3] || ""
  ).toUpperCase()}`;
}

function extractWeWorkRemotelyJobs(html: string, run: JobSearchRun, config: Config): Job[] {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  const cardPattern = /<li\b[^>]*new-listing-container[\s\S]*?<\/li>/gi;
  for (const match of html.matchAll(cardPattern)) {
    const segment = match[0];
    const href = decodeHtml(
      /<a\b[^>]*class="[^"]*listing-link--unlocked[^"]*"[^>]*href="([^"]+)"/i.exec(segment)?.[1] ||
        ""
    );
    if (!href || !href.includes("/remote-jobs/")) continue;
    const sourceId = href.split("/").filter(Boolean).pop();
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const title = firstText(segment, [
      /class="[^"]*new-listing__header__title__text[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    ]);
    if (!title) continue;

    const company = firstText(segment, [
      /class="[^"]*new-listing__company-name[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    ]);
    const location =
      firstText(segment, [
        /class="[^"]*new-listing__company-headquarters[^"]*"[^>]*>([\s\S]*?)<\/p>/i
      ]) || run.location;
    const tags = [
      ...segment.matchAll(
        /class="[^"]*new-listing__categories__category[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
      )
    ]
      .map((tag) => cleanText(tag[1] || ""))
      .filter(Boolean);
    const url = href.startsWith("http") ? href : `https://weworkremotely.com${href}`;
    const notes = tags.join(", ");

    jobs.push({
      source: "weworkremotely",
      source_id: sourceId,
      title,
      company: company || null,
      location,
      workplace: "remote",
      seniority: inferSeniority(title, run.query),
      language: detectLanguage(`${title} ${notes}`),
      url,
      apply_url: url,
      status: "new",
      score: scoreJob({ title, location, description: notes, run, config }),
      salary: null,
      is_read: false,
      notes: notes || null
    });
  }
  return jobs;
}

function extractEuroTopTechJobs(html: string, run: JobSearchRun, config: Config): Job[] {
  const cards = extractEuroTopTechCards(html);
  const seen = new Set<string>();
  return cards
    .map((card) => {
      const sourceId = stableId(
        `${card.company}|${card.title}|${card.location}|${card.compensation}`
      );
      return { ...card, sourceId };
    })
    .filter((card) => card.title && !seen.has(card.sourceId) && seen.add(card.sourceId))
    .map((card) => {
      const notes = [
        card.workplace ? `Workplace: ${card.workplace}` : "",
        card.seniority ? `Seniority: ${card.seniority}` : ""
      ]
        .filter(Boolean)
        .join(", ");
      const url = `${run.url}#${card.sourceId}`;
      return {
        source: "eurotoptech",
        source_id: card.sourceId,
        title: card.title,
        company: card.company || null,
        location: card.location || run.location,
        workplace: mapWorkplace(card.workplace, inferWorkplace(card.location) || run.workplace),
        seniority: mapSeniority(card.seniority, card.title),
        language: detectLanguage(`${card.title} ${notes}`),
        url,
        apply_url: run.url,
        status: "new",
        score: scoreJob({
          title: card.title,
          location: card.location,
          description: notes,
          run,
          config
        }),
        salary: card.compensation || null,
        is_read: false,
        notes: notes || null
      };
    });
}

function extractEuroTopTechCards(html: string): EuroTopTechCard[] {
  const titleMatches = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].filter(
    (match) => !/Explore\s+devops\s+opportunities/i.test(cleanText(match[1] || ""))
  );
  const cards: EuroTopTechCard[] = [];
  for (let index = 0; index < titleMatches.length; index += 1) {
    const current = titleMatches[index];
    if (!current) continue;
    const next = titleMatches[index + 1]?.index || html.length;
    const currentIndex = current.index || 0;
    const before = html.slice(Math.max(0, currentIndex - 2500), currentIndex);
    const after = html.slice(currentIndex, Math.min(html.length, next));
    const segment = `${before}${after}`;
    const title = cleanText(current[1] || "");
    const chipLabels = [
      ...before.matchAll(/class="[^"]*MuiChip-label[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)
    ]
      .map((chip) => cleanText(chip[1] || ""))
      .filter(Boolean);
    const values = [
      ...after.matchAll(/class="[^"]*MuiTypography-body[12][^"]*"[^>]*>([\s\S]*?)<\/p>/gi)
    ]
      .map((value) => cleanText(value[1] || ""))
      .filter(Boolean);
    const location = firstText(segment, [
      /data-testid="LocationOnOutlinedIcon"[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i
    ]);
    cards.push({
      title,
      company: chipLabels.at(-1) || "",
      location,
      workplace: values.find((value) => /remote|hybrid|onsite/i.test(value)) || "",
      seniority: values.find((value) => /junior|mid-level|middle|senior|lead/i.test(value)) || "",
      compensation: values.find((value) => /€|\$|£/.test(value)) || ""
    });
  }
  return cards;
}

function findBalancedEnd(text: string, start: number, open: string, close: string): number {
  if (start === -1) return -1;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function extractJobCardSegments(html: string): string[] {
  const segments: string[] = [];
  const listItemPattern = /<li\b[^>]*>[\s\S]*?<\/li>/gi;
  for (const match of html.matchAll(listItemPattern)) {
    if (/\/jobs\/view\//i.test(match[0]) || /urn:li:jobPosting:/i.test(match[0])) {
      segments.push(match[0]);
    }
  }

  if (segments.length) return segments;

  const cardPattern =
    /<div\b[^>]*(?:base-card|job-search-card|jobs-search-results__list-item)[^>]*>[\s\S]*?(?=<div\b[^>]*(?:base-card|job-search-card|jobs-search-results__list-item)|<\/ul>|<\/body>)/gi;
  for (const match of html.matchAll(cardPattern)) {
    if (/\/jobs\/view\//i.test(match[0]) || /urn:li:jobPosting:/i.test(match[0])) {
      segments.push(match[0]);
    }
  }

  if (segments.length) return segments;

  const fallbackPattern = /<a\b[^>]+href="[^"]*\/jobs\/view\/[^"]*\d+[^"]*"[\s\S]*?<\/a>/gi;
  return [...html.matchAll(fallbackPattern)].map((match) => match[0]);
}

function extractJobId(segment: string): string {
  return (
    /\/jobs\/view\/[^"'?#]*?(\d+)(?:[?"'#]|$)/i.exec(segment)?.[1] ||
    /data-entity-urn="urn:li:jobPosting:(\d+)"/i.exec(segment)?.[1] ||
    /data-job-id="(\d+)"/i.exec(segment)?.[1] ||
    ""
  );
}

function firstText(segment: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const value = pattern.exec(segment)?.[1];
    if (value) return cleanText(value);
  }
  return "";
}

function cleanText(value: string): string {
  return decodeHtml(value)
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ") // codeql[js/bad-tag-filter] - text extraction only, not security sanitization
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, name: string) => named[name as keyof typeof named] || `&${name};`);
}

function stableId(value: string): string {
  return createHash("sha256").update(normalize(value)).digest("hex").slice(0, 8);
}

function formatSalaryRange(
  from: number | string | null | undefined,
  to: number | string | null | undefined
): string {
  const fromNumber = Number(from);
  const toNumber = Number(to);
  if (
    (Number.isFinite(fromNumber) || Number.isFinite(toNumber)) &&
    fromNumber <= 0 &&
    toNumber <= 0
  )
    return "";
  if (Number.isFinite(fromNumber) && Number.isFinite(toNumber)) {
    return `${formatSalaryNumber(fromNumber)} - ${formatSalaryNumber(toNumber)}`;
  }
  if (Number.isFinite(fromNumber)) return `from ${formatSalaryNumber(fromNumber)}`;
  if (Number.isFinite(toNumber)) return `up to ${formatSalaryNumber(toNumber)}`;
  return "";
}

function formatSalaryNumber(value: number | string): string {
  const normalized = String(value).replace(/\s+/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return normalized.trim();
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
}

function wantedJobFilterReason(job: Job, config: Config): string | null {
  const title = normalize(job.title);
  const excludes = (config.filters.excludeKeywords || []).map(normalizeKeyword).filter(Boolean);
  if (excludes.some((term) => title.includes(term))) return "excluded_keyword";
  if (/\b(senior|lead|principal|staff|manager|architect)\b/.test(title)) return "senior_title";

  const wanted = [
    "devops",
    "site reliability",
    "sre",
    "platform engineer",
    "cloud engineer",
    "azure devops",
    "infrastructure engineer"
  ];
  return wanted.some((term) => title.includes(term)) ? null : "role_title_not_matched";
}

function enrichedJobFilterReason(job: Job, config: Config): string | null {
  if (!isAllowedLanguage(job, config)) return `language_${job.language || "unknown"}_blocked`;
  if (hasNegativeSignal(job, config)) return "negative_signal";
  if ((job.score ?? 0) < minimumScore(config)) return "score_below_minimum";
  return null;
}

function isAllowedLanguage(job: Job, config: Config): boolean {
  const allowed = config.filters.allowedLanguages || ["english", "hungarian", "mixed", "unknown"];
  const blocked = config.filters.blockedLanguages || ["other"];
  if (blocked.includes(job.language)) return false;
  return allowed.includes(job.language);
}

function hasNegativeSignal(job: Job, config: Config): boolean {
  const title = normalize(job.title);
  const fullText = normalize(`${job.title} ${job.location || ""} ${job.notes || ""}`);
  return (config.filters.negativeSignals || [])
    .map(normalizeKeyword)
    .filter(Boolean)
    .some((term) => {
      if (["senior", "lead", "principal", "staff", "manager", "architect"].includes(term)) {
        return title.includes(term);
      }
      return fullText.includes(term);
    });
}

function minimumScore(config: Config): number {
  const value = Number(config.filters.minimumScore);
  return Number.isFinite(value) ? value : 45;
}

function detectLanguage(value: string): JobLanguage {
  const text = normalize(value);
  if (!text) return "unknown";

  const hungarianHits = countMatches(text, [
    "és",
    "hogy",
    "magyar",
    "tapasztalat",
    "feladat",
    "előny",
    "munkavégzés",
    "fejlesztés",
    "csapat"
  ]);
  const englishHits = countMatches(text, [
    "and",
    "the",
    "with",
    "experience",
    "required",
    "responsibilities",
    "skills",
    "team",
    "cloud",
    "infrastructure",
    "engineer"
  ]);
  const otherHits = countMatches(text, [
    "vær",
    "til",
    "vores",
    "arbejde",
    "erfaring",
    "fremtidige",
    "ansvar",
    "kompetencer",
    "stellen",
    "kenntnisse",
    "bewerbung",
    "erfahrung",
    "aufgaben",
    "praca",
    "doświadczenie",
    "umiejętności",
    "zespół",
    "wymagania",
    "experiență",
    "cerințe",
    "echipă",
    "abilități",
    "skúsenosti",
    "požiadavky",
    "tím",
    "zručnosti",
    "experiencia",
    "requisitos",
    "equipo",
    "responsabilidades",
    "expérience",
    "compétences",
    "équipe",
    "responsabilités",
    "pessoa",
    "engenheira",
    "profissional",
    "pleno",
    "remoto",
    "habilidades",
    "experiência"
  ]);

  if (/\b(pessoa|engenheir[ao]|profissional|pleno|remoto)\b/i.test(value)) return "other";
  if (/[æøåąćęłńóśźżăâîșțáéíóúüñçôûãõ]/i.test(value) || otherHits >= 2) return "other";
  if (hungarianHits >= 2 && englishHits >= 2) return "mixed";
  if (hungarianHits >= 2 || /[őű]/i.test(value)) return "hungarian";
  if (englishHits >= 2) return "english";
  return "unknown";
}

function countMatches(text: string, words: string[]): number {
  return words.reduce(
    // eslint-disable-next-line security/detect-non-literal-regexp -- word is escaped via escapeRegExp
    (count, word) => count + (new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text) ? 1 : 0),
    0
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreJob({ title, location, description = "", run, config }: ScoreInput): number {
  let score = 55;
  const titleAndLocation = normalize(`${title} ${location || ""}`);
  const fullJobText = normalize(`${title} ${location || ""} ${description || ""}`);
  const searchContext = normalize(`${run.query || ""} ${run.workplace || ""}`);
  const text = `${fullJobText} ${searchContext}`;
  if (/junior|entry|graduate|trainee/.test(text)) score += 15;
  if (/medior|mid|associate/.test(text)) score += 10;
  if (/remote/.test(normalize(run.workplace || ""))) score += 10;
  if (/hungary|budapest|romania|slovakia|krakow|katowice|wroclaw|wrocław|poland/.test(text))
    score += 8;
  score += matchedTerms(fullJobText, config.filters.positiveTech || []).length * 4;
  score -= matchedTerms(fullJobText, config.filters.negativeSignals || []).length * 15;
  if (/\b(senior|lead|principal|staff|manager|architect)\b/.test(titleAndLocation)) score -= 40;
  if (
    (config.filters.excludeKeywords || [])
      .map(normalizeKeyword)
      .some((term) => fullJobText.includes(term))
  )
    score -= 40;
  return Math.max(0, Math.min(100, score));
}

function matchedTerms(text: string, terms: string[]): string[] {
  return terms
    .map(normalizeKeyword)
    .filter(Boolean)
    .filter((term) => text.includes(term));
}

function inferSeniority(title: string, query?: string): JobSeniority {
  const text = normalize(`${title} ${query || ""}`);
  if (/junior|entry|graduate|trainee/.test(text)) return "junior";
  if (/medior|middle|mid|associate/.test(text)) return "medior";
  if (/senior|lead|principal|staff/.test(text)) return "senior";
  return "unknown";
}

function mapSeniority(value: string | undefined, title = ""): JobSeniority {
  const normalized = normalize(value);
  if (normalized === "mid" || normalized === "mid-level" || normalized === "regular")
    return "medior";
  if (normalized === "junior") return "junior";
  if (normalized === "senior") return "senior";
  return inferSeniority(title, "");
}

function mapWorkplace(
  value: string | undefined,
  fallback: JobWorkplace | string = "unknown"
): JobWorkplace {
  const normalized = normalize(value);
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("office") || normalized.includes("onsite")) return "onsite";
  return (fallback || "unknown") as JobWorkplace;
}

function inferWorkplace(location?: string | null): JobWorkplace {
  return /remote/i.test(location || "") ? "remote" : "unknown";
}

function normalizeKeyword(value: string): string {
  return normalize(String(value).replace(/^"+|"+$/g, ""));
}

function normalize(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
