import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceHtml, rotateRuns, SourceFetchError } from "../scripts/import-linkedin-jobs.js";

describe("import throttling helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("selects a wrapping window so scheduled batches rotate through every search", () => {
    expect(rotateRuns(["a", "b", "c", "d", "e"], 3, 4)).toEqual(["e", "a", "b"]);
    expect(rotateRuns(["a", "b", "c", "d", "e"], 3, 2)).toEqual(["c", "d", "e"]);
  });

  it("returns all searches for an unlimited batch", () => {
    expect(rotateRuns(["a", "b", "c"], -1, 2)).toEqual(["a", "b", "c"]);
  });

  it("exposes HTTP 429 as a typed error so the importer can stop that source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })));
    await expect(fetchSourceHtml("https://example.test/jobs")).rejects.toMatchObject({
      name: "SourceFetchError",
      status: 429
    } satisfies Partial<SourceFetchError>);
  });
});
