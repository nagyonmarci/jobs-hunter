import fs from "node:fs";
import type { DirectusClient } from "./types.js";

interface DirectusErrorBody {
  errors?: Array<{ message?: string }>;
}

interface LoginBody extends DirectusErrorBody {
  data?: { access_token?: string };
}

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return env;
}

function loadDotEnv(): void {
  if (!fs.existsSync(".env")) return;
  const env = parseEnvFile(fs.readFileSync(".env", "utf8"));
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const optional = (name: string): string => {
  const value = process.env[name];
  return value ? value.replace(/\/$/, "") : "";
};

export async function createDirectusClient(): Promise<DirectusClient> {
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
    const body = (await response.json()) as LoginBody;
    if (!response.ok) {
      const message = body?.errors?.[0]?.message || response.statusText;
      throw new Error(`Directus login failed: ${response.status} ${message}`);
    }
    token = body.data?.access_token || "";
  }

  async function request(path: string, options: RequestInit = {}): Promise<unknown> {
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
      const message =
        (body as DirectusErrorBody | null)?.errors?.[0]?.message || response.statusText;
      throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${message}`);
    }

    return body;
  }

  return { request };
}
