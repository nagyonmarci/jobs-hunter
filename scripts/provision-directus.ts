import { createDirectusClient } from "./directus-client.js";

interface FieldDefinitionOptions {
  interface?: string;
  special?: string;
  required?: boolean;
  note?: string;
  options?: Record<string, unknown>;
  unique?: boolean;
  maxLength?: number;
}

const directus = await createDirectusClient();

async function ensureCollection(collection: string, note: string): Promise<void> {
  try {
    await directus.request(`/collections/${collection}`);
    console.log(`exists collection ${collection}`);
  } catch {
    await directus.request("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection,
        meta: {
          note,
          singleton: false,
          hidden: false
        },
        schema: {}
      })
    });
    console.log(`created collection ${collection}`);
  }
}

async function ensureField(
  collection: string,
  field: string,
  type: string,
  options: FieldDefinitionOptions = {}
): Promise<void> {
  const payload = {
    field,
    type,
    meta: {
      interface: options.interface || null,
      special: options.special || null,
      required: Boolean(options.required),
      note: options.note || null,
      options: options.options || null
    },
    schema: {
      is_nullable: !options.required,
      is_unique: Boolean(options.unique),
      max_length: options.maxLength || null
    }
  };

  try {
    await directus.request(`/fields/${collection}/${field}`);
    await directus.request(`/fields/${collection}/${field}`, {
      method: "PATCH",
      body: JSON.stringify({
        meta: payload.meta,
        schema: payload.schema
      })
    });
    console.log(`exists field ${collection}.${field}`);
  } catch {
    await directus.request(`/fields/${collection}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    console.log(`created field ${collection}.${field}`);
  }
}

await ensureCollection("job_leads", "Normalized job leads from LinkedIn/manual sources.");
await ensureField("job_leads", "source", "string", { required: true, maxLength: 50 });
await ensureField("job_leads", "source_id", "string", { required: true, maxLength: 100 });
await ensureField("job_leads", "title", "string", { required: true, maxLength: 255 });
await ensureField("job_leads", "company", "string", { maxLength: 255 });
await ensureField("job_leads", "location", "string", { maxLength: 255 });
await ensureField("job_leads", "workplace", "string", {
  maxLength: 30,
  note: "remote, hybrid, onsite"
});
await ensureField("job_leads", "seniority", "string", {
  maxLength: 30,
  note: "junior, medior, senior, unknown"
});
await ensureField("job_leads", "language", "string", {
  maxLength: 50,
  note: "english, hungarian, mixed, unknown"
});
await ensureField("job_leads", "url", "string", { required: true, unique: true, maxLength: 500 });
await ensureField("job_leads", "apply_url", "string", { maxLength: 500 });
await ensureField("job_leads", "status", "string", {
  required: true,
  maxLength: 30,
  note: "new, shortlisted, applied, rejected, ignored"
});
await ensureField("job_leads", "score", "integer");
await ensureField("job_leads", "salary", "string", {
  maxLength: 255,
  note: "Public salary or compensation text when available."
});
await ensureField("job_leads", "is_read", "boolean", {
  note: "Whether the lead was reviewed in the admin UI."
});
await ensureField("job_leads", "notes", "text");

await ensureCollection("job_search_runs", "Generated search URLs and run metadata.");
await ensureField("job_search_runs", "source", "string", { required: true, maxLength: 50 });
await ensureField("job_search_runs", "query", "string", { required: true, maxLength: 255 });
await ensureField("job_search_runs", "location", "string", { required: true, maxLength: 255 });
await ensureField("job_search_runs", "workplace", "string", { required: true, maxLength: 30 });
await ensureField("job_search_runs", "url", "string", { required: true, maxLength: 800 });
await ensureField("job_search_runs", "generated_at", "dateTime");

console.log("Directus provisioning finished.");
