import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{js,mjs,ts}"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["scripts/**/*.ts"],
      exclude: ["scripts/provision-directus.ts", "scripts/directus-client.ts"]
    }
  }
});
