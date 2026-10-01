import { describe, it, expect } from "vitest";
import { extractLinkedInJobs } from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

const config: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["backend engineer"] }
};

const baseRun: JobSearchRun = {
  source: "linkedin",
  query: "backend engineer",
  location: "Remote",
  workplace: "remote",
  url: "https://www.linkedin.com/jobs/search?keywords=backend+engineer"
};

describe("extractLinkedInJobs", () => {
  it("extracts a job from a <li> card with title, company, and location", () => {
    const html = `
      <li>
        <div class="base-card">
          <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/3812345678"></a>
          <h3 class="base-search-card__title">Backend Engineer</h3>
          <h4 class="base-search-card__subtitle">Acme Corp</h4>
          <span class="job-search-card__location">Budapest, Hungary</span>
        </div>
      </li>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "linkedin",
      source_id: "3812345678",
      title: "Backend Engineer",
      company: "Acme Corp",
      location: "Budapest, Hungary"
    });
  });

  it("falls back to the aria-label attribute for the title when no title tag matches", () => {
    const html = `
      <li>
        <div class="base-card" data-entity-urn="urn:li:jobPosting:1112223334">
          <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/1112223334"
             aria-label="Platform Engineer at Globex"></a>
        </div>
      </li>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.title).toBe("Platform Engineer at Globex");
  });

  it("falls back to a generated title when nothing matches", () => {
    const html = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:5556667778"></div></li>`;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.title).toBe("LinkedIn job 5556667778");
  });

  it("extracts the job id from data-entity-urn when the href has no numeric id", () => {
    const html = `
      <li>
        <div class="base-card" data-entity-urn="urn:li:jobPosting:2223334445">
          <a href="https://www.linkedin.com/jobs/view/qa-engineer-at-acme"></a>
          <h3 class="base-search-card__title">QA Engineer</h3>
        </div>
      </li>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.source_id).toBe("2223334445");
  });

  it("extracts the job id from data-job-id when neither href nor urn has a numeric id", () => {
    const html = `
      <li>
        <div class="base-card">
          <a href="https://www.linkedin.com/jobs/view/sre-at-acme" data-job-id="9998887776"></a>
          <h3 class="base-search-card__title">SRE</h3>
        </div>
      </li>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.source_id).toBe("9998887776");
  });

  it("deduplicates cards that share the same job id", () => {
    const html = `
      <li><div class="base-card" data-entity-urn="urn:li:jobPosting:4441112220">
        <h3 class="base-search-card__title">First Listing</h3>
      </div></li>
      <li><div class="base-card" data-entity-urn="urn:li:jobPosting:4441112220">
        <h3 class="base-search-card__title">Duplicate Listing</h3>
      </div></li>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("First Listing");
  });

  it("falls back to run.location when no location tag matches", () => {
    const html = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:6667778889"></div></li>`;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.location).toBe(baseRun.location);
  });

  it("uses the tier-2 div-card pattern when no <li> cards are present", () => {
    const html = `
      <div class="job-search-card" data-entity-urn="urn:li:jobPosting:4443332221">
        <h3 class="job-search-card__title">Data Engineer</h3>
        <h4 class="job-search-card__subtitle">Initech</h4>
      </div>
      </body>
    `;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]).toMatchObject({
      source_id: "4443332221",
      title: "Data Engineer",
      company: "Initech"
    });
  });

  it("uses the tier-3 bare-anchor fallback when neither <li> nor card <div>s are present", () => {
    const html = `<p>Check out this role: <a href="https://www.linkedin.com/jobs/view/7778889990">Growth Engineer</a></p>`;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.source_id).toBe("7778889990");
  });

  it("sets language to unknown and computes a numeric score", () => {
    const html = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:1231231230"></div></li>`;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.language).toBe("unknown");
    expect(typeof jobs[0]?.score).toBe("number");
  });

  it("builds a canonical linkedin url and apply_url from the job id", () => {
    const html = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:3812345678"></div></li>`;
    const jobs = extractLinkedInJobs(html, baseRun, config);
    expect(jobs[0]?.url).toBe("https://www.linkedin.com/jobs/view/3812345678/");
    expect(jobs[0]?.apply_url).toBe("https://www.linkedin.com/jobs/view/3812345678/");
  });

  it("resolves workplace from run.location when run.workplace itself is unrecognized", () => {
    const html = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:8889990001"></div></li>`;
    const run: JobSearchRun = { ...baseRun, workplace: "unknown", location: "Remote Europe" };
    const jobs = extractLinkedInJobs(html, run, config);
    expect(jobs[0]?.workplace).toBe("remote");
  });
});
