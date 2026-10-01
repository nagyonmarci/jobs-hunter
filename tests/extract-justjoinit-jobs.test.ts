import { describe, it, expect } from "vitest";
import { extractJustJoinItOffers, extractJustJoinItJobs } from "../scripts/import-linkedin-jobs.js";
import type { Config, JobSearchRun } from "../scripts/types.js";

// justjoin.it embeds its offers as a JSON blob that's itself been JSON-stringified
// once more into the page payload, so the raw HTML contains an escaped `\"data\":[...]`
// marker. Reproduce that one level of escaping here.
function buildOffersHtml(offers: unknown[]): string {
  const inner = JSON.stringify({ data: offers });
  const escaped = JSON.stringify(inner);
  return `<script>${escaped}</script>`;
}

const validOffer = {
  slug: "acme-co-1",
  title: "DevOps Engineer",
  guid: "guid-1",
  companyName: "Acme Co",
  city: "Warsaw",
  street: "Main St",
  workplaceType: "remote",
  experienceLevel: "mid",
  requiredSkills: ["Docker"],
  niceToHaveSkills: ["Kubernetes"],
  employmentTypes: [
    { from: 15000, to: 20000, currency: "PLN", type: "b2b", currencySource: "original" }
  ]
};

const config: Config = {
  source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
  filters: { keywords: ["devops"] }
};

const baseRun: JobSearchRun = {
  source: "justjoinit",
  query: "DevOps remote",
  location: "Poland",
  workplace: "remote",
  url: "https://justjoin.it/job-offers/poland-remote/devops"
};

describe("extractJustJoinItOffers", () => {
  it("parses offers embedded as escaped JSON in the page", () => {
    const offers = extractJustJoinItOffers(buildOffersHtml([validOffer]));
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ slug: "acme-co-1", companyName: "Acme Co" });
  });

  it("ignores decoy data arrays and malformed bracket content without throwing", () => {
    const decoyHtml = buildOffersHtml([{ foo: "bar" }]);
    const malformedHtml = `<script>\\"data\\":[\\q]</script>`;
    const html = `${decoyHtml}${malformedHtml}${buildOffersHtml([validOffer])}`;
    const offers = extractJustJoinItOffers(html);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.slug).toBe("acme-co-1");
  });
});

describe("extractJustJoinItJobs", () => {
  it("builds location from city and street", () => {
    const jobs = extractJustJoinItJobs(buildOffersHtml([validOffer]), baseRun, config);
    expect(jobs[0]?.location).toBe("Warsaw, Main St");
  });

  it("falls back to run.location when the offer has neither city nor street", () => {
    const offer = { ...validOffer, city: undefined, street: undefined };
    const jobs = extractJustJoinItJobs(buildOffersHtml([offer]), baseRun, config);
    expect(jobs[0]?.location).toBe(baseRun.location);
  });

  it("deduplicates offers that share the same slug", () => {
    const duplicate = { ...validOffer, title: "Duplicate Listing" };
    const jobs = extractJustJoinItJobs(buildOffersHtml([validOffer, duplicate]), baseRun, config);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe(validOffer.title);
  });

  it("builds notes from combined requiredSkills and niceToHaveSkills", () => {
    const jobs = extractJustJoinItJobs(buildOffersHtml([validOffer]), baseRun, config);
    expect(jobs[0]?.notes).toBe("Docker, Kubernetes");
  });

  it("uses guid as source_id when present, falling back to slug otherwise", () => {
    const withGuid = extractJustJoinItJobs(buildOffersHtml([validOffer]), baseRun, config);
    expect(withGuid[0]?.source_id).toBe("guid-1");

    const { guid: _guid, ...withoutGuid } = validOffer;
    const jobs = extractJustJoinItJobs(buildOffersHtml([withoutGuid]), baseRun, config);
    expect(jobs[0]?.source_id).toBe("acme-co-1");
  });

  it("computes salary via formatJustJoinItSalary from employmentTypes", () => {
    const jobs = extractJustJoinItJobs(buildOffersHtml([validOffer]), baseRun, config);
    expect(jobs[0]?.salary).toBe("b2b: 15,000 - 20,000 PLN");
  });

  it("filters out offers missing a slug or a title before mapping", () => {
    const missingTitle = { ...validOffer, slug: "no-title-co", title: undefined };
    const jobs = extractJustJoinItJobs(
      buildOffersHtml([validOffer, missingTitle]),
      baseRun,
      config
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source_id).toBe("guid-1");
  });
});
