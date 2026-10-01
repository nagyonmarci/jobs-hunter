import { describe, it, expect } from "vitest";
import {
  inferSeniority,
  mapSeniority,
  mapWorkplace,
  inferWorkplace,
  stableId
} from "../scripts/import-linkedin-jobs.js";

describe("inferSeniority", () => {
  it("returns junior when the text matches a junior-signal keyword", () => {
    expect(inferSeniority("Junior Backend Engineer")).toBe("junior");
  });

  it("returns medior when the text matches a medior-signal keyword", () => {
    expect(inferSeniority("Backend Engineer", "mid level")).toBe("medior");
  });

  it("returns senior when the text matches a senior-signal keyword", () => {
    expect(inferSeniority("Senior Backend Engineer")).toBe("senior");
  });

  it("checks the junior pattern before the senior pattern", () => {
    expect(inferSeniority("Junior to Senior Backend Engineer")).toBe("junior");
  });

  it("returns unknown when no seniority keyword matches", () => {
    expect(inferSeniority("Backend Engineer")).toBe("unknown");
  });
});

describe("mapSeniority", () => {
  it("maps 'mid', 'mid-level', and 'regular' to medior", () => {
    expect(mapSeniority("mid")).toBe("medior");
    expect(mapSeniority("mid-level")).toBe("medior");
    expect(mapSeniority("regular")).toBe("medior");
  });

  it("maps 'junior' and 'senior' directly", () => {
    expect(mapSeniority("junior")).toBe("junior");
    expect(mapSeniority("senior")).toBe("senior");
  });

  it("falls back to inferring seniority from the title when the value is unrecognized", () => {
    expect(mapSeniority("something-else", "Senior Engineer")).toBe("senior");
  });

  it("falls back to unknown when the value is unrecognized and the title has no signal", () => {
    expect(mapSeniority(undefined, "Backend Engineer")).toBe("unknown");
  });
});

describe("mapWorkplace", () => {
  it("maps values containing remote, hybrid, or office/onsite", () => {
    expect(mapWorkplace("Remote")).toBe("remote");
    expect(mapWorkplace("Hybrid")).toBe("hybrid");
    expect(mapWorkplace("On-site office")).toBe("onsite");
  });

  it("checks remote before hybrid when a value mentions both", () => {
    expect(mapWorkplace("Hybrid/Remote")).toBe("remote");
  });

  it("falls back to the provided fallback value when nothing matches", () => {
    expect(mapWorkplace("Flexible", "hybrid")).toBe("hybrid");
  });

  it("falls back to unknown when nothing matches and no fallback is given", () => {
    expect(mapWorkplace("Flexible")).toBe("unknown");
  });
});

describe("inferWorkplace", () => {
  it("returns remote when the location mentions remote", () => {
    expect(inferWorkplace("Remote, Europe")).toBe("remote");
  });

  it("returns unknown otherwise, including for null/undefined location", () => {
    expect(inferWorkplace("Budapest")).toBe("unknown");
    expect(inferWorkplace(null)).toBe("unknown");
    expect(inferWorkplace(undefined)).toBe("unknown");
  });
});

describe("stableId", () => {
  it("is deterministic and returns an 8-character lowercase hex id", () => {
    const id = stableId("Company Name | Senior Engineer");
    expect(id).toBe(stableId("Company Name | Senior Engineer"));
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("normalizes case and whitespace before hashing, so equivalent inputs collide", () => {
    expect(stableId("Company Name | Senior Engineer")).toBe(
      stableId("  company name   |   senior engineer  ")
    );
  });

  it("produces different ids for different inputs", () => {
    expect(stableId("Company A | Engineer")).not.toBe(stableId("Company B | Engineer"));
  });
});
