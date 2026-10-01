import { describe, it, expect } from "vitest";
import {
  extractEuroTopTechCards,
  extractEuroTopTechJobs
} from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

function buildCardFragment({
  company = "Acme Co",
  title = "DevOps Engineer",
  location = "Warsaw, Poland",
  workplace = "Remote",
  seniority = "Senior",
  compensation = "€5,000 - €7,000"
}: {
  company?: string;
  title?: string;
  location?: string;
  workplace?: string;
  seniority?: string;
  compensation?: string;
} = {}): string {
  const chipHtml = company ? `<span class="MuiChip-label">${company}</span>` : "";
  const workplaceHtml = workplace ? `<p class="MuiTypography-body1">${workplace}</p>` : "";
  const seniorityHtml = seniority ? `<p class="MuiTypography-body2">${seniority}</p>` : "";
  const compensationHtml = compensation ? `<p class="MuiTypography-body1">${compensation}</p>` : "";
  return `
    ${chipHtml}
    <h2>${title}</h2>
    <div data-testid="LocationOnOutlinedIcon"></div>
    <p>${location}</p>
    ${workplaceHtml}
    ${seniorityHtml}
    ${compensationHtml}
  `;
}

const config: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["devops"] }
};

const baseRun: JobSearchRun = {
  source: "eurotoptech",
  query: "DevOps",
  location: "Poland",
  workplace: "onsite",
  url: "https://eurotoptech.com/jobs/devops"
};

describe("extractEuroTopTechCards", () => {
  it("parses title, company, location, workplace, seniority, and compensation from a card", () => {
    const cards = extractEuroTopTechCards(buildCardFragment());
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "DevOps Engineer",
      company: "Acme Co",
      location: "Warsaw, Poland",
      workplace: "Remote",
      seniority: "Senior",
      compensation: "€5,000 - €7,000"
    });
  });

  it("excludes the decoy 'Explore devops opportunities' heading", () => {
    const cards = extractEuroTopTechCards("<h2>Explore devops opportunities</h2>");
    expect(cards).toHaveLength(0);
  });

  it("falls back to empty strings when company/workplace/seniority/compensation are absent", () => {
    const cards = extractEuroTopTechCards(
      buildCardFragment({ company: "", workplace: "", seniority: "", compensation: "" })
    );
    expect(cards[0]).toMatchObject({
      company: "",
      workplace: "",
      seniority: "",
      compensation: ""
    });
  });
});

describe("extractEuroTopTechJobs", () => {
  it("builds the job url from run.url and the card's stableId", () => {
    const jobs = extractEuroTopTechJobs(buildCardFragment(), baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.url).toBe(`${baseRun.url}#${jobs[0]?.source_id}`);
  });

  it("deduplicates cards with identical company/title/location/compensation", () => {
    const html = buildCardFragment() + buildCardFragment();
    const jobs = extractEuroTopTechJobs(html, baseRun, config);
    expect(jobs).toHaveLength(1);
  });

  it("builds notes from Workplace and Seniority labels", () => {
    const jobs = extractEuroTopTechJobs(buildCardFragment(), baseRun, config);
    expect(jobs[0]?.notes).toBe("Workplace: Remote, Seniority: Senior");
  });

  it("ignores run.workplace once inferWorkplace has already resolved a value from location", () => {
    // inferWorkplace() always returns a truthy string ("remote" or "unknown"), so the
    // `inferWorkplace(card.location) || run.workplace` fallback never actually reaches
    // run.workplace - it's dead code.
    const jobs = extractEuroTopTechJobs(
      buildCardFragment({ workplace: "", location: "Warsaw" }),
      baseRun,
      config
    );
    expect(jobs[0]?.workplace).toBe("unknown");
  });

  it("uses card.compensation as the salary field, or null when absent", () => {
    const withComp = extractEuroTopTechJobs(buildCardFragment(), baseRun, config);
    expect(withComp[0]?.salary).toBe("€5,000 - €7,000");

    const withoutComp = extractEuroTopTechJobs(
      buildCardFragment({ compensation: "" }),
      baseRun,
      config
    );
    expect(withoutComp[0]?.salary).toBeNull();
  });

  it("filters out cards with an empty title", () => {
    const jobs = extractEuroTopTechJobs(buildCardFragment({ title: "" }), baseRun, config);
    expect(jobs).toHaveLength(0);
  });
});
