import { describe, it, expect } from "vitest";
import { buildLinkedInSearchUrl } from "../scripts/linkedin-url.mjs";

const config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: {
    excludeKeywords: ["senior", "lead"],
    postedWithin: "r604800",
    experienceLevels: ["entry", "associate", "mid-senior"]
  }
};

describe("buildLinkedInSearchUrl", () => {
  it("builds a remote URL with workplace flag 2", () => {
    const url = buildLinkedInSearchUrl(
      { keyword: "backend engineer", location: "Hungary", workplace: "remote" },
      config
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(config.source.linkedin.baseUrl);
    expect(parsed.searchParams.get("f_WT")).toBe("2");
    expect(parsed.searchParams.get("location")).toBe("Hungary");
    expect(parsed.searchParams.get("keywords")).toBe("backend engineer NOT senior NOT lead");
    expect(parsed.searchParams.get("f_TPR")).toBe("r604800");
    expect(parsed.searchParams.get("f_E")).toBe("2,3,4");
  });

  it("builds a hybrid URL with workplace flag 3", () => {
    const url = buildLinkedInSearchUrl(
      { keyword: "devops", location: "Budapest", workplace: "hybrid" },
      config
    );
    expect(new URL(url).searchParams.get("f_WT")).toBe("3");
  });

  it("tolerates missing excludeKeywords", () => {
    const minimal = {
      source: { linkedin: { baseUrl: "https://example.test/jobs" } },
      filters: { postedWithin: "r86400", experienceLevels: ["entry"] }
    };
    const url = buildLinkedInSearchUrl(
      { keyword: "qa", location: "Remote", workplace: "remote" },
      minimal
    );
    expect(new URL(url).searchParams.get("keywords")).toBe("qa");
  });

  it("filters unknown experience levels silently", () => {
    const url = buildLinkedInSearchUrl(
      { keyword: "qa", location: "Remote", workplace: "remote" },
      {
        ...config,
        filters: { ...config.filters, experienceLevels: ["entry", "unknown-level", "associate"] }
      }
    );
    expect(new URL(url).searchParams.get("f_E")).toBe("2,3");
  });
});
