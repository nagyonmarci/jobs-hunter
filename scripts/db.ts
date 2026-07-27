import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || "directus",
  user: process.env.POSTGRES_USER || "directus",
  password: process.env.POSTGRES_PASSWORD || "directus-local-password"
});

let migrated: Promise<void> | null = null;

function migrate(): Promise<void> {
  migrated ??= pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS job_leads (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        company VARCHAR(255), location VARCHAR(255), workplace VARCHAR(30),
        seniority VARCHAR(30), language VARCHAR(50),
        url VARCHAR(500) NOT NULL UNIQUE, apply_url VARCHAR(500),
        status VARCHAR(30) NOT NULL, score INTEGER, salary VARCHAR(255),
        is_read BOOLEAN DEFAULT false, date_created TIMESTAMPTZ DEFAULT now(),
        is_expired BOOLEAN, notes TEXT, description TEXT,
        generated_cv TEXT, generated_cv_pdf TEXT
      );
      ALTER TABLE job_leads ALTER COLUMN date_created SET DEFAULT now();

      CREATE TABLE IF NOT EXISTS job_search_runs (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL, query VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL, workplace VARCHAR(30) NOT NULL,
        url VARCHAR(800) NOT NULL, generated_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS base_cv (id SERIAL PRIMARY KEY, content TEXT);
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY, preferred_llm VARCHAR(50),
        openai_api_key VARCHAR(255), anthropic_api_key VARCHAR(255), gemini_api_key VARCHAR(255)
      );

      -- One-time fix: this column used to be a Directus file (uuid) reference;
      -- it now stores a plain local filename.
      DO $migration$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='job_leads' AND column_name='generated_cv_pdf' AND data_type='uuid') THEN
          ALTER TABLE job_leads ALTER COLUMN generated_cv_pdf TYPE text USING generated_cv_pdf::text;
        END IF;
      END $migration$;
      `
    )
    .then(() => undefined);
  return migrated;
}

export interface JobLeadRow {
  id: number;
  source: string;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  workplace: string | null;
  seniority: string | null;
  language: string | null;
  url: string;
  apply_url: string | null;
  status: string;
  score: number | null;
  salary: string | null;
  is_read: boolean;
  date_created: Date | null;
  is_expired: boolean | null;
  notes: string | null;
  description: string | null;
  generated_cv: string | null;
  generated_cv_pdf: string | null;
}

export type NewJobLead = Omit<
  JobLeadRow,
  "id" | "date_created" | "is_expired" | "description" | "generated_cv" | "generated_cv_pdf"
> &
  Partial<Pick<JobLeadRow, "is_expired" | "description" | "generated_cv" | "generated_cv_pdf">>;

export type JobLeadPatch = Partial<Omit<JobLeadRow, "id" | "date_created">>;

export interface JobLeadFilters {
  title?: string;
  company?: string;
  location?: string;
  notes?: string;
  salary?: string;
  url?: string;
  status?: string;
  workplace?: string;
  seniority?: string;
  language?: string;
  is_read?: boolean;
  expired?: "hide" | "show";
  score_min?: number;
  score_max?: number;
  sort?: string;
  limit?: number;
}

const JOB_LEAD_COLUMNS = new Set([
  "source",
  "source_id",
  "title",
  "company",
  "location",
  "workplace",
  "seniority",
  "language",
  "url",
  "apply_url",
  "status",
  "score",
  "salary",
  "is_read",
  "is_expired",
  "notes",
  "description",
  "generated_cv",
  "generated_cv_pdf"
]);

const ICONTAINS_FIELDS = ["title", "company", "location", "notes", "salary", "url"] as const;
const EXACT_FIELDS = ["status", "workplace", "seniority", "language"] as const;
const SORT_MAP: Record<string, string> = {
  "-score": "score DESC NULLS LAST",
  score: "score ASC NULLS LAST",
  "-id": "id DESC",
  id: "id ASC",
  title: "title ASC",
  company: "company ASC",
  salary: "salary ASC"
};

export async function listJobLeads(filters: JobLeadFilters = {}): Promise<JobLeadRow[]> {
  await migrate();
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const field of ICONTAINS_FIELDS) {
    const value = filters[field];
    if (value) {
      params.push(`%${value}%`);
      clauses.push(`${field} ILIKE $${params.length}`);
    }
  }
  for (const field of EXACT_FIELDS) {
    const value = filters[field];
    if (value) {
      params.push(value);
      clauses.push(`${field} = $${params.length}`);
    }
  }
  if (filters.is_read !== undefined) {
    params.push(filters.is_read);
    clauses.push(`is_read = $${params.length}`);
  }
  if (filters.expired === "hide") {
    clauses.push(`is_expired IS NOT TRUE`);
  } else if (filters.expired === "show") {
    clauses.push(`is_expired = TRUE`);
  }
  if (filters.score_min !== undefined) {
    params.push(filters.score_min);
    clauses.push(`score >= $${params.length}`);
  }
  if (filters.score_max !== undefined) {
    params.push(filters.score_max);
    clauses.push(`score <= $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const order = (filters.sort && SORT_MAP[filters.sort]) || "score DESC NULLS LAST";
  params.push(Math.min(Math.max(Number(filters.limit) || 100, 1), 500));

  const { rows } = await pool.query<JobLeadRow>(
    `SELECT * FROM job_leads ${where} ORDER BY ${order} LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getJobLead(id: number): Promise<JobLeadRow | null> {
  await migrate();
  const { rows } = await pool.query<JobLeadRow>(`SELECT * FROM job_leads WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createJobLead(job: NewJobLead): Promise<JobLeadRow> {
  await migrate();
  const { rows } = await pool.query<JobLeadRow>(
    `INSERT INTO job_leads
      (source, source_id, title, company, location, workplace, seniority, language,
       url, apply_url, status, score, salary, is_read, is_expired, notes, description,
       generated_cv, generated_cv_pdf)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      job.source,
      job.source_id,
      job.title,
      job.company ?? null,
      job.location ?? null,
      job.workplace ?? null,
      job.seniority ?? null,
      job.language ?? null,
      job.url,
      job.apply_url ?? null,
      job.status,
      job.score ?? null,
      job.salary ?? null,
      job.is_read,
      job.is_expired ?? null,
      job.notes ?? null,
      job.description ?? null,
      job.generated_cv ?? null,
      job.generated_cv_pdf ?? null
    ]
  );
  const row = rows[0];
  if (!row) throw new Error("Insert did not return a row");
  return row;
}

export async function updateJobLead(id: number, patch: JobLeadPatch): Promise<JobLeadRow | null> {
  await migrate();
  const keys = Object.keys(patch).filter((key) => JOB_LEAD_COLUMNS.has(key));
  if (keys.length === 0) return getJobLead(id);

  const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
  const values: unknown[] = keys.map((key) => (patch as Record<string, unknown>)[key]);
  values.push(id);
  const { rows } = await pool.query<JobLeadRow>(
    `UPDATE job_leads SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function findJobLeadByUrl(
  url: string
): Promise<Pick<JobLeadRow, "id" | "url" | "is_expired" | "salary"> | null> {
  await migrate();
  const { rows } = await pool.query<Pick<JobLeadRow, "id" | "url" | "is_expired" | "salary">>(
    `SELECT id, url, is_expired, salary FROM job_leads WHERE url = $1 LIMIT 1`,
    [url]
  );
  return rows[0] ?? null;
}

export interface ExpirableJobLead {
  id: number;
  source: string;
  url: string;
  date_created: Date | null;
}

export async function listExpirableJobLeads(): Promise<ExpirableJobLead[]> {
  await migrate();
  const { rows } = await pool.query<ExpirableJobLead>(
    `SELECT id, source, url, date_created FROM job_leads WHERE is_expired IS NOT TRUE`
  );
  return rows;
}

export async function bulkMarkExpired(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await migrate();
  await pool.query(`UPDATE job_leads SET is_expired = TRUE WHERE id = ANY($1::int[])`, [ids]);
}

export interface JobSearchRunRow {
  id: number;
  source: string;
  query: string;
  location: string;
  workplace: string;
  url: string;
  generated_at: Date | null;
}

export interface NewJobSearchRun {
  source: string;
  query: string;
  location: string;
  workplace: string;
  url: string;
  generated_at?: string | Date | null;
}

export async function listJobSearchRuns(
  options: { source?: string; limit?: number } = {}
): Promise<JobSearchRunRow[]> {
  await migrate();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.source) {
    params.push(options.source);
    clauses.push(`source = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(Math.min(Math.max(Number(options.limit) || 25, 1), 500));

  const { rows } = await pool.query<JobSearchRunRow>(
    `SELECT * FROM job_search_runs ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function createJobSearchRun(run: NewJobSearchRun): Promise<JobSearchRunRow> {
  await migrate();
  const { rows } = await pool.query<JobSearchRunRow>(
    `INSERT INTO job_search_runs (source, query, location, workplace, url, generated_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [run.source, run.query, run.location, run.workplace, run.url, run.generated_at ?? null]
  );
  const row = rows[0];
  if (!row) throw new Error("Insert did not return a row");
  return row;
}

export interface AppSettingsRow {
  id: number;
  preferred_llm: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  gemini_api_key: string | null;
}

const APP_SETTINGS_COLUMNS = new Set([
  "preferred_llm",
  "openai_api_key",
  "anthropic_api_key",
  "gemini_api_key"
]);

export async function getAppSettings(): Promise<AppSettingsRow | null> {
  await migrate();
  const { rows } = await pool.query<AppSettingsRow>(
    `SELECT * FROM app_settings ORDER BY id LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function updateAppSettings(
  patch: Partial<Omit<AppSettingsRow, "id">>
): Promise<AppSettingsRow> {
  await migrate();
  const existing = await getAppSettings();
  const keys = Object.keys(patch).filter((key) => APP_SETTINGS_COLUMNS.has(key));

  if (!existing) {
    const columns = keys.length ? keys : [...APP_SETTINGS_COLUMNS];
    const values = columns.map((key) => (patch as Record<string, unknown>)[key] ?? null);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const { rows } = await pool.query<AppSettingsRow>(
      `INSERT INTO app_settings (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values
    );
    const row = rows[0];
    if (!row) throw new Error("Insert did not return a row");
    return row;
  }

  if (keys.length === 0) return existing;
  const setClauses = keys.map((key, index) => `${key} = $${index + 1}`);
  const values: unknown[] = keys.map((key) => (patch as Record<string, unknown>)[key]);
  values.push(existing.id);
  const { rows } = await pool.query<AppSettingsRow>(
    `UPDATE app_settings SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  const row = rows[0];
  if (!row) throw new Error("Update did not return a row");
  return row;
}

export interface BaseCvRow {
  id: number;
  content: string | null;
}

export async function getBaseCv(): Promise<BaseCvRow | null> {
  await migrate();
  const { rows } = await pool.query<BaseCvRow>(`SELECT * FROM base_cv ORDER BY id LIMIT 1`);
  return rows[0] ?? null;
}

export async function updateBaseCv(content: string): Promise<BaseCvRow> {
  await migrate();
  const existing = await getBaseCv();
  if (!existing) {
    const { rows } = await pool.query<BaseCvRow>(
      `INSERT INTO base_cv (content) VALUES ($1) RETURNING *`,
      [content]
    );
    const row = rows[0];
    if (!row) throw new Error("Insert did not return a row");
    return row;
  }
  const { rows } = await pool.query<BaseCvRow>(
    `UPDATE base_cv SET content = $1 WHERE id = $2 RETURNING *`,
    [content, existing.id]
  );
  const row = rows[0];
  if (!row) throw new Error("Update did not return a row");
  return row;
}
