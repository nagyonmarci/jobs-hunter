import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildLinkedInSearchUrl } from "../scripts/linkedin-url.js";
import type { Config } from "../scripts/types.js";

const validExperienceCodes = new Set(["1", "2", "3", "4"]);

describe("buildLinkedInSearchUrl fuzzing", () => {
  it("builds parseable URLs while preserving search parameters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }),
        fc.string({ minLength: 1, maxLength: 80 }),
        fc.constantFrom("remote", "hybrid"),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 8 }),
        fc.array(
          fc.oneof(
            fc.constantFrom("internship", "entry", "associate", "mid-senior"),
            fc.string({ minLength: 1, maxLength: 20 })
          ),
          { maxLength: 8 }
        ),
        (keyword, location, workplace, excludeKeywords, experienceLevels) => {
          const config: Config = {
            source: { linkedin: { baseUrl: "https://www.linkedin.com/jobs/search" } },
            filters: {
              keywords: [keyword],
              excludeKeywords,
              experienceLevels,
              postedWithin: "r604800"
            }
          };

          const url = buildLinkedInSearchUrl({ keyword, location, workplace }, config);
          const parsed = new URL(url);

          expect(parsed.origin + parsed.pathname).toBe(config.source.linkedin.baseUrl);
          expect(parsed.searchParams.get("location")).toBe(location);
          expect(parsed.searchParams.get("f_WT")).toBe(workplace === "remote" ? "2" : "3");
          expect(parsed.searchParams.get("f_TPR")).toBe("r604800");
          expect(parsed.searchParams.get("keywords")).toBe(
            [keyword, ...excludeKeywords.map((term) => `NOT ${term}`)].join(" ")
          );

          const experienceCodes = parsed.searchParams.get("f_E")?.split(",").filter(Boolean) || [];
          expect(experienceCodes.every((code) => validExperienceCodes.has(code))).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
