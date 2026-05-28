import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{js,mjs}"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["scripts/**/*.mjs"],
      exclude: ["scripts/provision-directus.mjs", "scripts/directus-client.mjs"]
    }
  }
});
