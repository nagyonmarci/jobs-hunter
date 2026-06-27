const optional = (name) => {
  const value = process.env[name];
  return value ? value.replace(/\/$/, "") : "";
};

export async function createDirectusClient() {
  const baseUrl = optional("DIRECTUS_URL") || "http://localhost:8055";
  let token = optional("DIRECTUS_TOKEN");

  if (!token) {
    const email = optional("DIRECTUS_EMAIL") || "admin@example.com";
    const password = optional("DIRECTUS_PASSWORD") || "change-me-please";
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await response.json();
    if (!response.ok) {
      const message = body?.errors?.[0]?.message || response.statusText;
      throw new Error(`Directus login failed: ${response.status} ${message}`);
    }
    token = body.data.access_token;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = body?.errors?.[0]?.message || response.statusText;
      throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${message}`);
    }

    return body;
  }

  return { request };
}

export async function findExistingByUrl(directus, url, fields = "id,url") {
  const params = new URLSearchParams({ "filter[url][_eq]": url, limit: "1", fields });
  const { data } = await directus.request(`/items/job_leads?${params.toString()}`);
  return data?.[0] || null;
}
