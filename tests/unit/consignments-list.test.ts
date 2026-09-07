import { describe, expect, it } from "vitest";
import {
  buildListSearch,
  parseListParams,
  DEFAULT_SORT,
  DEFAULT_DIR,
  type ListView,
} from "@/lib/consignments-list";

/**
 * `buildListSearch` is the single serializer behind the address-bar sync, the
 * export links, and the `initialData` seed check in `consignments-client.tsx`
 * (D-065). The seed comparison comes first: if the server-rendered view and the
 * client's initial view serialize differently, the SSR page would be discarded
 * and refetched on mount — the exact regression these tests guard.
 */

const base: ListView = {
  year: 2026,
  sort: DEFAULT_SORT,
  dir: DEFAULT_DIR,
  page: 1,
};

describe("buildListSearch", () => {
  it("omits page when on page 1 so the first-page URL stays canonical", () => {
    expect(buildListSearch(base)).toBe("year=2026&sort=serial_no&dir=asc");
  });

  it("includes page when beyond the first", () => {
    expect(buildListSearch({ ...base, page: 3 })).toContain("page=3");
  });

  it("omits undefined optional filters entirely", () => {
    const s = buildListSearch(base);
    expect(s).not.toContain("client");
    expect(s).not.toContain("stage");
    expect(s).not.toContain("q");
  });

  it("includes every filter that is set", () => {
    const s = buildListSearch({
      ...base,
      client: "abc",
      stage: "stuck",
      q: "MSC",
    });
    expect(s).toContain("client=abc");
    expect(s).toContain("stage=stuck");
    expect(s).toContain("q=MSC");
  });

  it("produces a stable key for identical views (cache-key stability)", () => {
    const a = buildListSearch({ ...base, q: "x", client: "c1" });
    const b = buildListSearch({ ...base, client: "c1", q: "x" });
    expect(a).toBe(b);
  });

  it("distinguishes views that differ only by sort direction", () => {
    expect(buildListSearch({ ...base, dir: "desc" })).not.toBe(
      buildListSearch(base),
    );
  });

  it("url-encodes values with spaces and specials", () => {
    const s = buildListSearch({ ...base, q: "MSC LEO & co" });
    expect(s).not.toContain(" ");
    expect(new URLSearchParams(s).get("q")).toBe("MSC LEO & co");
  });
});

describe("buildListSearch ⇄ parseListParams round-trip", () => {
  // The server parses the URL with `parseListParams`; the client serializes with
  // `buildListSearch`. A view must survive the round-trip unchanged, else the
  // seeded cache key and the server's rendered view diverge.
  it("round-trips a fully-populated view", () => {
    const view: ListView = {
      year: 2025,
      client: "11111111-1111-1111-1111-111111111111",
      stage: "unreleased",
      q: "TZDL",
      sort: "arrival_date",
      dir: "desc",
      page: 4,
    };

    const search = new URLSearchParams(buildListSearch(view));
    const reparsed = parseListParams({
      year: search.get("year") ?? undefined,
      client: search.get("client") ?? undefined,
      stage: search.get("stage") ?? undefined,
      q: search.get("q") ?? undefined,
      sort: search.get("sort") ?? undefined,
      dir: search.get("dir") ?? undefined,
    });

    expect(reparsed).toEqual({
      year: view.year,
      client: view.client,
      stage: view.stage,
      q: view.q,
      sort: view.sort,
      dir: view.dir,
    });
    expect(Number(search.get("page"))).toBe(view.page);
  });

  it("round-trips a bare view (defaults survive)", () => {
    const search = new URLSearchParams(buildListSearch(base));
    const reparsed = parseListParams({
      year: search.get("year") ?? undefined,
      sort: search.get("sort") ?? undefined,
      dir: search.get("dir") ?? undefined,
    });
    expect(reparsed.sort).toBe(DEFAULT_SORT);
    expect(reparsed.dir).toBe(DEFAULT_DIR);
    expect(reparsed.year).toBe(2026);
  });

  it("falls back to the default sort when the param is not allowlisted", () => {
    // Guards the D-056 sort allowlist: a hand-edited URL must not reach `.order()`.
    expect(parseListParams({ sort: "amount); drop table" }).sort).toBe(
      DEFAULT_SORT,
    );
  });
});
