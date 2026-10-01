import { describe, it, expect } from "vitest";
import {
  wantedJobFilterReason,
  enrichedJobFilterReason,
  isAllowedLanguage,
  hasNegativeSignal,
  minimumScore
} from "../scripts/import-linkedin-jobs.js";
import type { Config, Job } from "../scripts/types.js";

const baseConfig: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["backend engineer"] }
};

const baseJob: Job = {
  source: "linkedin",
  source_id: "abc123",
  title: "Backend Engineer",
  company: "Acme",
  location: "Berlin",
  workplace: "unknown",
  seniority: "unknown",
  language: "english",
  url: "https://example.test/job/abc123",
  apply_url: "https://example.test/job/abc123/apply",
  status: "new",
  score: 80,
  salary: null,
  is_read: false,
  notes: null
};

describe("wantedJobFilterReason", () => {
  it("returns excluded_keyword when the title matches a configured exclude keyword", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, excludeKeywords: ["contractor"] }
    };
    expect(wantedJobFilterReason({ ...baseJob, title: "Contractor Engineer" }, config)).toBe(
      "excluded_keyword"
    );
  });

  it("strips quotes from configured exclude keywords before matching", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, excludeKeywords: ['"Security Engineer"'] }
    };
    expect(wantedJobFilterReason({ ...baseJob, title: "Security Engineer" }, config)).toBe(
      "excluded_keyword"
    );
  });

  it("returns senior_title when the title matches the senior-role regex", () => {
    expect(wantedJobFilterReason({ ...baseJob, title: "Senior Java Developer" }, baseConfig)).toBe(
      "senior_title"
    );
  });

  it("checks excludeKeywords before the senior-title regex", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, excludeKeywords: ["java"] }
    };
    expect(wantedJobFilterReason({ ...baseJob, title: "Senior Java Developer" }, config)).toBe(
      "excluded_keyword"
    );
  });

  it("returns null when the title matches one of the hard-coded wanted role terms", () => {
    expect(wantedJobFilterReason({ ...baseJob, title: "DevOps Engineer" }, baseConfig)).toBe(null);
  });

  it("returns role_title_not_matched when the title matches no wanted term", () => {
    expect(wantedJobFilterReason({ ...baseJob, title: "Business Analyst" }, baseConfig)).toBe(
      "role_title_not_matched"
    );
  });

  it("ignores config.filters.keywords — the wanted-term list is hard-coded, not config-driven", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, keywords: ["business analyst"] }
    };
    expect(wantedJobFilterReason({ ...baseJob, title: "Business Analyst" }, config)).toBe(
      "role_title_not_matched"
    );
  });
});

describe("enrichedJobFilterReason", () => {
  it("returns a language-blocked reason when the job's language is not allowed", () => {
    expect(enrichedJobFilterReason({ ...baseJob, language: "other" }, baseConfig)).toBe(
      "language_other_blocked"
    );
  });

  it("returns negative_signal when the language is allowed but a negative signal matches", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["php"] }
    };
    expect(enrichedJobFilterReason({ ...baseJob, notes: "Legacy PHP codebase" }, config)).toBe(
      "negative_signal"
    );
  });

  it("returns score_below_minimum when language and negative-signal checks pass but the score is too low", () => {
    expect(enrichedJobFilterReason({ ...baseJob, score: 10 }, baseConfig)).toBe(
      "score_below_minimum"
    );
  });

  it("returns null when the job passes all three checks", () => {
    expect(enrichedJobFilterReason({ ...baseJob, score: 80 }, baseConfig)).toBe(null);
  });

  it("checks language before negative signals or score", () => {
    expect(enrichedJobFilterReason({ ...baseJob, language: "other", score: 0 }, baseConfig)).toBe(
      "language_other_blocked"
    );
  });
});

describe("isAllowedLanguage", () => {
  it("defaults to allowing english, hungarian, mixed, and unknown", () => {
    expect(isAllowedLanguage({ ...baseJob, language: "english" }, baseConfig)).toBe(true);
    expect(isAllowedLanguage({ ...baseJob, language: "hungarian" }, baseConfig)).toBe(true);
    expect(isAllowedLanguage({ ...baseJob, language: "mixed" }, baseConfig)).toBe(true);
    expect(isAllowedLanguage({ ...baseJob, language: "unknown" }, baseConfig)).toBe(true);
  });

  it("defaults to blocking 'other'", () => {
    expect(isAllowedLanguage({ ...baseJob, language: "other" }, baseConfig)).toBe(false);
  });

  it("respects custom allowedLanguages and blockedLanguages, with blocked taking precedence", () => {
    const config: Config = {
      ...baseConfig,
      filters: {
        ...baseConfig.filters,
        allowedLanguages: ["hungarian", "english"],
        blockedLanguages: ["hungarian"]
      }
    };
    expect(isAllowedLanguage({ ...baseJob, language: "hungarian" }, config)).toBe(false);
  });
});

describe("hasNegativeSignal", () => {
  it("matches hard-coded senior-role terms only against the title, not location or notes", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["manager"] }
    };
    const job: Job = {
      ...baseJob,
      title: "DevOps Engineer",
      notes: "Reports to the engineering manager"
    };
    expect(hasNegativeSignal(job, config)).toBe(false);
  });

  it("matches hard-coded senior-role terms when present in the title", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["manager"] }
    };
    expect(hasNegativeSignal({ ...baseJob, title: "Engineering Manager" }, config)).toBe(true);
  });

  it("matches other (non hard-coded) negative signal terms anywhere in title, location, or notes", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, negativeSignals: ["php"] }
    };
    const job: Job = { ...baseJob, notes: "Legacy PHP codebase" };
    expect(hasNegativeSignal(job, config)).toBe(true);
  });
});

describe("minimumScore", () => {
  it("returns the default of 45 when no minimumScore is configured", () => {
    expect(minimumScore(baseConfig)).toBe(45);
  });

  it("returns the configured minimumScore when it is a finite number", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, minimumScore: 60 }
    };
    expect(minimumScore(config)).toBe(60);
  });

  it("falls back to the default when the configured minimumScore is not finite", () => {
    const config: Config = {
      ...baseConfig,
      filters: { ...baseConfig.filters, minimumScore: NaN }
    };
    expect(minimumScore(config)).toBe(45);
  });
});
