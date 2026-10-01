import { describe, it, expect } from "vitest";
import { extractNoFluffJobs, extractNoFluffJobsSalary } from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

function buildCard({
  href = "/job/acme-devops",
  title = "DevOps Engineer",
  company = "Acme Co",
  location = "Warsaw",
  tags = ["B2B"],
  salaryText = "10 000 - 15 000 PLN"
}: {
  href?: string;
  title?: string | null;
  company?: string;
  location?: string;
  tags?: string[];
  salaryText?: string;
} = {}): string {
  const titleHtml = title === null ? "" : `<h3 class="posting-title__position">${title}</h3>`;
  return `<a class="posting-list-item" href="${href}">
    ${titleHtml}
    <h4 class="company-name">${company}</h4>
    <span class="tw-text-ellipsis">${location}</span>
    ${tags.map((tag) => `<span class="posting-tag">${tag}</span>`).join("")}
    <span>${salaryText}</span>
  </a>`;
}

const config: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["devops"] }
};

const baseRun: JobSearchRun = {
  source: "nofluffjobs",
  query: "DevOps",
  location: "Poland",
  workplace: "onsite",
  url: "https://nofluffjobs.com/pl/devops"
};

describe("extractNoFluffJobs", () => {
  it("maps a card into a Job with a domain-prefixed url from a relative href", () => {
    const jobs = extractNoFluffJobs(buildCard(), baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "nofluffjobs",
      source_id: "acme-devops",
      title: "DevOps Engineer",
      company: "Acme Co",
      url: "https://nofluffjobs.com/job/acme-devops"
    });
  });

  it("keeps an already-absolute href as-is", () => {
    const jobs = extractNoFluffJobs(
      buildCard({ href: "https://nofluffjobs.com/job/acme-devops" }),
      baseRun,
      config
    );
    expect(jobs[0]?.url).toBe("https://nofluffjobs.com/job/acme-devops");
  });

  it("skips cards missing a title", () => {
    const jobs = extractNoFluffJobs(buildCard({ title: null }), baseRun, config);
    expect(jobs).toHaveLength(0);
  });

  it("overrides language to english when a tag says angielski or english", () => {
    const jobs = extractNoFluffJobs(buildCard({ tags: ["angielski"] }), baseRun, config);
    expect(jobs[0]?.language).toBe("english");
  });

  it("overrides language to other when a tag says polski or Polish", () => {
    const jobs = extractNoFluffJobs(buildCard({ tags: ["Polski"] }), baseRun, config);
    expect(jobs[0]?.language).toBe("other");
  });

  it("falls through to detectLanguage when no tag matches", () => {
    const jobs = extractNoFluffJobs(buildCard({ tags: ["B2B"] }), baseRun, config);
    expect(jobs[0]?.language).toBe("unknown");
  });

  it("infers remote workplace from zdalnie/remote in the location text", () => {
    const jobs = extractNoFluffJobs(buildCard({ location: "Zdalnie" }), baseRun, config);
    expect(jobs[0]?.workplace).toBe("remote");
  });

  it("falls back to mapWorkplace(run.workplace) when location doesn't say zdalnie/remote", () => {
    const jobs = extractNoFluffJobs(buildCard({ location: "Warsaw" }), baseRun, config);
    expect(jobs[0]?.workplace).toBe("onsite");
  });

  it("computes salary via extractNoFluffJobsSalary from the card segment", () => {
    const jobs = extractNoFluffJobs(
      buildCard({ salaryText: "10 000 - 15 000 PLN" }),
      baseRun,
      config
    );
    expect(jobs[0]?.salary).toBe("10,000 - 15,000 PLN");
  });

  it("does not deduplicate cards sharing the same source id", () => {
    const html = buildCard() + buildCard();
    const jobs = extractNoFluffJobs(html, baseRun, config);
    expect(jobs).toHaveLength(2);
  });
});

describe("extractNoFluffJobsSalary", () => {
  it("returns null when no salary range is present", () => {
    expect(extractNoFluffJobsSalary("<span>no numbers here</span>")).toBeNull();
  });

  it("returns null for an unsupported currency", () => {
    expect(extractNoFluffJobsSalary("<span>10 000 - 15 000 JPY</span>")).toBeNull();
  });

  it("formats a matched range with an uppercased currency", () => {
    expect(extractNoFluffJobsSalary("<span>10 000 - 15 000 eur</span>")).toBe(
      "10,000 - 15,000 EUR"
    );
  });
});
