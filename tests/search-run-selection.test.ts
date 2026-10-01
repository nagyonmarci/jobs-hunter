import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = query;
    }
  }
}));

import { listJobLeads, listJobSearchRuns } from "../scripts/db.js";

describe("saved search selection", () => {
  beforeEach(() => query.mockClear());

  it("loads all distinct searches for the scheduler's -1 limit", async () => {
    await listJobSearchRuns({ source: "linkedin", limit: -1 });
    const [sql, params] = query.mock.calls.at(-1)!;
    expect(sql).toContain("DISTINCT ON (source, url)");
    expect(sql).toContain("ORDER BY source, url, id DESC");
    expect(sql).not.toContain("LIMIT");
    expect(params).toEqual(["linkedin"]);
  });

  it("applies positive limits after selecting distinct searches", async () => {
    await listJobSearchRuns({ source: "linkedin", limit: 25 });
    const [sql, params] = query.mock.calls.at(-1)!;
    expect(sql).toContain("latest_runs ORDER BY id DESC LIMIT $2");
    expect(params).toEqual(["linkedin", 25]);
  });

  it("defaults to 25 searches and caps positive limits at 500", async () => {
    await listJobSearchRuns();
    expect(query.mock.calls.at(-1)![1]).toEqual([25]);
    await listJobSearchRuns({ limit: 1000 });
    expect(query.mock.calls.at(-1)![1]).toEqual([500]);
  });

  it("shows newest leads by default while allowing score sorting", async () => {
    await listJobLeads();
    expect(query.mock.calls.at(-1)![0]).toContain("ORDER BY id DESC");
    await listJobLeads({ sort: "-score" });
    expect(query.mock.calls.at(-1)![0]).toContain("ORDER BY score DESC NULLS LAST");
  });

  it("returns every matching lead when the UI requests the unlimited default", async () => {
    await listJobLeads({ limit: -1 });
    const [sql, params] = query.mock.calls.at(-1)!;
    expect(sql).toContain("ORDER BY id DESC");
    expect(sql).not.toContain("LIMIT");
    expect(params).toEqual([]);
  });
});
