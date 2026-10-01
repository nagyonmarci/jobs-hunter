import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectLanguage } from "../scripts/import-linkedin-jobs.js";

const validLanguages = new Set(["english", "hungarian", "mixed", "other", "unknown"]);

describe("detectLanguage fuzzing", () => {
  it("never throws and always returns a valid JobLanguage", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (value) => {
        expect(validLanguages.has(detectLanguage(value))).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it("returns unknown for whitespace-only input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(" ", "\t", "\n"), { minLength: 0, maxLength: 20 }),
        (chars) => {
          expect(detectLanguage(chars.join(""))).toBe("unknown");
        }
      ),
      { numRuns: 200 }
    );
  });
});
