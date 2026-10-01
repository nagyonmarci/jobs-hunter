import { describe, it, expect } from "vitest";
import {
  formatJustJoinItSalary,
  formatSalaryRange,
  formatSalaryNumber,
  extractNoFluffJobsSalary
} from "../scripts/import-linkedin-jobs.js";

describe("formatSalaryRange", () => {
  it("returns a range string when both from and to are finite", () => {
    expect(formatSalaryRange(3000, 5000)).toBe("3,000 - 5,000");
  });

  it("returns a from-only string when only from is finite", () => {
    expect(formatSalaryRange(3000, undefined)).toBe("from 3,000");
  });

  it("returns an up-to string when only to is finite", () => {
    expect(formatSalaryRange(undefined, 5000)).toBe("up to 5,000");
  });

  it("returns an empty string when both values are zero or both negative", () => {
    expect(formatSalaryRange(0, 0)).toBe("");
    expect(formatSalaryRange(-100, -50)).toBe("");
  });

  it("treats null as 0 but undefined as not-a-number (asymmetric fallback)", () => {
    // Number(null) === 0 (finite) but Number(undefined) === NaN, so an
    // omitted `to` behaves differently depending on null vs undefined.
    expect(formatSalaryRange(3000, undefined)).toBe("from 3,000");
    expect(formatSalaryRange(3000, null)).toBe("3,000 - 0");
  });
});

describe("formatSalaryNumber", () => {
  it("formats a finite number with thousands separators", () => {
    expect(formatSalaryNumber(3000)).toBe("3,000");
  });

  it("formats a numeric string the same way", () => {
    expect(formatSalaryNumber("3000")).toBe("3,000");
  });

  it("strips internal whitespace before parsing", () => {
    expect(formatSalaryNumber("3 000")).toBe("3,000");
  });

  it("passes non-numeric strings through trimmed, without throwing", () => {
    expect(formatSalaryNumber("N/A")).toBe("N/A");
  });
});

describe("extractNoFluffJobsSalary", () => {
  it("extracts and formats a recognized-currency range from a card segment", () => {
    expect(extractNoFluffJobsSalary("<span>8 000 - 12 000 PLN</span> per month")).toBe(
      "8,000 - 12,000 PLN"
    );
  });

  it("returns null when the currency is not in the allowlist", () => {
    expect(extractNoFluffJobsSalary("Salary: 8000 - 12000 JPY")).toBe(null);
  });

  it("returns null when there is no salary range at all", () => {
    expect(extractNoFluffJobsSalary("No salary listed")).toBe(null);
  });

  it("handles non-breaking spaces between digit groups", () => {
    expect(extractNoFluffJobsSalary("8 000 - 12 000 EUR")).toBe("8,000 - 12,000 EUR");
  });
});

describe("formatJustJoinItSalary", () => {
  it("returns null for the default empty array", () => {
    expect(formatJustJoinItSalary()).toBe(null);
  });

  it("returns null when every entry formats to an empty range", () => {
    expect(formatJustJoinItSalary([{ from: 0, to: 0, currency: "EUR", type: "permanent" }])).toBe(
      null
    );
  });

  it("prefers currencySource 'original' entries over any others", () => {
    const result = formatJustJoinItSalary([
      { type: "b2b", from: 1000, to: 2000, currency: "USD", currencySource: "converted" },
      { type: "permanent", from: 5000, to: 6000, currency: "PLN", currencySource: "original" }
    ]);
    expect(result).toBe("permanent: 5,000 - 6,000 PLN");
  });

  it("falls back to EUR entries when no entry has currencySource 'original'", () => {
    const result = formatJustJoinItSalary([
      { type: "b2b", from: 1000, to: 2000, currency: "USD" },
      { type: "permanent", from: 800, to: 1200, currency: "EUR" }
    ]);
    expect(result).toBe("permanent: 800 - 1,200 EUR");
  });

  it("falls back to all paid types when neither original nor EUR entries exist", () => {
    const result = formatJustJoinItSalary([{ type: "b2b", from: 1000, to: 2000, currency: "USD" }]);
    expect(result).toBe("b2b: 1,000 - 2,000 USD");
  });

  it("deduplicates entries with an identical type/amount/currency/unit/gross key", () => {
    const entry = {
      type: "b2b",
      from: 5000,
      to: 7000,
      currency: "EUR",
      currencySource: "original"
    };
    const result = formatJustJoinItSalary([entry, { ...entry }]);
    expect(result).toBe("b2b: 5,000 - 7,000 EUR");
  });

  it("caps the output at the first 3 formatted entries", () => {
    const result = formatJustJoinItSalary([
      { type: "b2b", from: 5000, to: 7000, currency: "PLN", currencySource: "original" },
      { type: "permanent", from: 6000, to: 8000, currency: "PLN", currencySource: "original" },
      { type: "contract", from: 4000, to: 6000, currency: "PLN", currencySource: "original" },
      { type: "mandate", from: 3000, to: 5000, currency: "PLN", currencySource: "original" }
    ]);
    expect(result).toBe(
      "b2b: 5,000 - 7,000 PLN; permanent: 6,000 - 8,000 PLN; contract: 4,000 - 6,000 PLN"
    );
  });

  it("falls back to fromPerUnit/toPerUnit via nullish coalescing, preserving an explicit 0", () => {
    const result = formatJustJoinItSalary([
      {
        type: "b2b",
        fromPerUnit: 0,
        toPerUnit: 50,
        currency: "EUR",
        unit: "hour",
        currencySource: "original"
      }
    ]);
    expect(result).toBe("b2b: 0 - 50 EUR/hour");
  });
});
