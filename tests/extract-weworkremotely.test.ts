import { describe, it, expect } from "vitest";
import { extractWeWorkRemotelyJobs } from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

function buildCard({
  href = "/remote-jobs/acme-devops",
  title,
  company = "Acme Co",
  location,
  tags = ["Full-Time"]
}: {
  href?: string;
  title?: string | null;
  company?: string;
  location?: string | null;
  tags?: string[];
} = {}): string {
  const titleHtml =
    title === null
      ? ""
      : `<span class="new-listing__header__title__text">${title ?? "DevOps Engineer"}</span>`;
  const locationHtml =
    location === null
      ? ""
      : `<p class="new-listing__company-headquarters">${location ?? "Warsaw, Poland"}</p>`;
  return `<li class="new-listing-container">
    <a class="listing-link--unlocked" href="${href}">
      ${titleHtml}
    </a>
    <p class="new-listing__company-name">${company}</p>
    ${locationHtml}
    ${tags.map((tag) => `<p class="new-listing__categories__category">${tag}</p>`).join("")}
  </li>`;
}

const config: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["devops"] }
};

const baseRun: JobSearchRun = {
  source: "weworkremotely",
  query: "DevOps",
  location: "Poland",
  workplace: "onsite",
  url: "https://weworkremotely.com/categories/remote-devops-jobs"
};

describe("extractWeWorkRemotelyJobs", () => {
  it("maps a card with a domain-prefixed url from a relative href", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard(), baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "weworkremotely",
      source_id: "acme-devops",
      title: "DevOps Engineer",
      company: "Acme Co",
      url: "https://weworkremotely.com/remote-jobs/acme-devops"
    });
  });

  it("keeps an already-absolute href as-is", () => {
    const jobs = extractWeWorkRemotelyJobs(
      buildCard({ href: "https://weworkremotely.com/remote-jobs/acme-devops" }),
      baseRun,
      config
    );
    expect(jobs[0]?.url).toBe("https://weworkremotely.com/remote-jobs/acme-devops");
  });

  it("skips listings whose href doesn't contain /remote-jobs/", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard({ href: "/other-jobs/foo" }), baseRun, config);
    expect(jobs).toHaveLength(0);
  });

  it("skips cards missing a title", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard({ title: null }), baseRun, config);
    expect(jobs).toHaveLength(0);
  });

  it("deduplicates cards sharing the same source id", () => {
    const html = buildCard() + buildCard();
    const jobs = extractWeWorkRemotelyJobs(html, baseRun, config);
    expect(jobs).toHaveLength(1);
  });

  it("falls back to run.location when the card has no headquarters location", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard({ location: null }), baseRun, config);
    expect(jobs[0]?.location).toBe(baseRun.location);
  });

  it("hardcodes workplace to remote regardless of run.workplace", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard(), baseRun, config);
    expect(jobs[0]?.workplace).toBe("remote");
  });

  it("always sets salary to null", () => {
    const jobs = extractWeWorkRemotelyJobs(buildCard(), baseRun, config);
    expect(jobs[0]?.salary).toBeNull();
  });
});
