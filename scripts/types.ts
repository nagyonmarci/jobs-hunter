export type JobSource =
  "linkedin" | "justjoinit" | "nofluffjobs" | "weworkremotely" | "eurotoptech";
export type JobWorkplace = "remote" | "hybrid" | "onsite" | "unknown";
export type JobSeniority = "junior" | "medior" | "senior" | "unknown";
export type JobLanguage = "english" | "hungarian" | "mixed" | "other" | "unknown";
export type JobStatus = "new" | "shortlisted" | "applied" | "rejected" | "ignored";

export interface Job {
  source: JobSource;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  workplace: JobWorkplace;
  seniority: JobSeniority;
  language: JobLanguage;
  url: string;
  apply_url: string;
  status: JobStatus;
  score: number | null;
  salary: string | null;
  is_read: boolean;
  notes: string | null;
  no_longer_accepting?: boolean;
}

export interface JobSearchRun {
  id?: string;
  source: JobSource | string;
  query: string;
  location: string;
  workplace: JobWorkplace | string;
  url: string;
  generated_at?: string;
}

export interface Config {
  filters: {
    keywords: string[];
    excludeKeywords?: string[];
    positiveTech?: string[];
    negativeSignals?: string[];
    minimumScore?: number;
    allowedLanguages?: string[];
    blockedLanguages?: string[];
    hybridLocations?: string[];
    remoteLocations?: string[];
    experienceLevels?: string[];
    postedWithin?: string;
  };
  source: {
    linkedin: { baseUrl: string };
    justjoinit?: { searchUrls: string[] };
    nofluffjobs?: { searchUrls: string[] };
    weworkremotely?: { searchUrls: string[] };
    eurotoptech?: { searchUrls: string[] };
  };
}

export interface ImportOptions {
  directus?: DirectusClient | null;
  configPath?: string;
  filters?: Partial<Config["filters"]>;
  sources?: string[];
  runLimit?: number;
  maxJobsPerRun?: number;
  dryRun?: boolean;
  logger?: (message: string) => void;
}

export interface ImportSummary {
  runs: number;
  fetched: number;
  parsed: number;
  created: number;
  salaryUpdated: number;
  skippedExisting: number;
  skippedFiltered: number;
  markedExpired: number;
  skippedExpired: number;
  filterReasons: Record<string, number>;
  failedRuns: number;
  dryRun: boolean;
  failures: Array<{ run: string; url: string; message: string }>;
}

export interface DirectusClient {
  request(path: string, options?: RequestInit): Promise<unknown>;
}
