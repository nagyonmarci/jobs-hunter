import { describe, it, expect } from "vitest";
import { scoreJob } from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

const baseConfig: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["backend engineer"] }
};

const baseRun: JobSearchRun = {
  source: "linkedin",
  query: "backend engineer",
  location: "Any",
  workplace: "unknown",
  url: "https://example.test/search"
};

describe("scoreJob", () => {
  it("returns the base score of 55 for a neutral job", () => {
    expect(
      scoreJob({ title: "Backend Engineer", location: "Berlin", run: baseRun, config: baseConfig })
    ).toBe(55);
  });

  it("adds a junior bonus for junior-signaling text", () => {
    expect(
      scoreJob({
        title: "Junior Backend Engineer",
        location: "Berlin",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55 + 15);
  });

  it("adds a medior bonus for mid-signaling text", () => {
    expect(
      scoreJob({
        title: "Mid Backend Engineer",
        location: "Berlin",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55 + 10);
  });

  it("adds both junior and medior bonuses when both signals are present (independent ifs)", () => {
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        description: "junior to mid level role",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55 + 15 + 10);
  });

  it("adds a remote bonus based on run.workplace, not job text", () => {
    const remoteRun: JobSearchRun = { ...baseRun, workplace: "remote" };
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        run: remoteRun,
        config: baseConfig
      })
    ).toBe(55 + 10);
  });

  it("does not add a remote bonus when only the job text mentions remote", () => {
    expect(
      scoreJob({
        title: "Remote Backend Engineer",
        location: "Berlin",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55);
  });

  it("adds a region bonus for target locations mentioned anywhere in the combined text", () => {
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Budapest, Hungary",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55 + 8);
  });

  it("adds 4 points per matched positive tech term", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, positiveTech: ["docker", "kubernetes"] }
    };
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        description: "You'll use docker and kubernetes daily",
        run: baseRun,
        config
      })
    ).toBe(55 + 4 * 2);
  });

  it("subtracts 15 points per matched negative signal", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["php"] }
    };
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        description: "Legacy PHP codebase",
        run: baseRun,
        config
      })
    ).toBe(55 - 15);
  });

  it("subtracts 40 points for a senior-level title", () => {
    expect(
      scoreJob({
        title: "Senior Backend Engineer",
        location: "Berlin",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55 - 40);
  });

  it("does not match 'senior' as a substring of another word (word boundary)", () => {
    expect(
      scoreJob({
        title: "Senioritis Engineer",
        location: "Berlin",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55);
  });

  it("only checks title and location for the senior penalty, not description", () => {
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        description: "You will report to a senior architect",
        run: baseRun,
        config: baseConfig
      })
    ).toBe(55);
  });

  it("applies a flat 40-point penalty for excludeKeywords regardless of match count", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, excludeKeywords: ["php", "legacy"] }
    };
    expect(
      scoreJob({
        title: "Backend Engineer",
        location: "Berlin",
        description: "Legacy PHP codebase, legacy PHP tooling",
        run: baseRun,
        config
      })
    ).toBe(55 - 40);
  });

  it("clamps the score to a minimum of 0", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["php", "legacy", "cobol"] }
    };
    expect(
      scoreJob({
        title: "Senior Backend Engineer",
        location: "Berlin",
        description: "Legacy PHP and COBOL maintenance",
        run: baseRun,
        config
      })
    ).toBe(0);
  });

  it("clamps the score to a maximum of 100", () => {
    const config: Config = {
      ...baseConfig,
      filters: {
        ...baseConfig.filters,
        positiveTech: [
          "docker",
          "kubernetes",
          "typescript",
          "react",
          "postgres",
          "aws",
          "node",
          "graphql"
        ]
      }
    };
    const remoteRun: JobSearchRun = { ...baseRun, workplace: "remote" };
    expect(
      scoreJob({
        title: "Junior Backend Engineer",
        location: "Budapest, Hungary",
        description: "docker kubernetes typescript react postgres aws node graphql",
        run: remoteRun,
        config
      })
    ).toBe(100);
  });
});
