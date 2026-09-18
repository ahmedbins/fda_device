import assert from "node:assert/strict";
import test from "node:test";
import { columnNaturalKey, columnShare, columnSharesKey, fitShares, measureNaturalWidths, parseNaturalWidths, spreadShares, compareValues, parseColumnWidths, parseRecentEntries, recentSearchParams, rememberEntry, toggleSort } from "../app/explorer-tools-core.ts";

test("header clicks cycle sort direction and start numeric columns descending", () => {
  assert.deepEqual(toggleSort({ key: "issued", dir: "desc" }, "issued"), { key: "issued", dir: "asc" });
  assert.deepEqual(toggleSort({ key: "issued", dir: "asc" }, "issued"), { key: "issued", dir: "desc" });
  assert.deepEqual(toggleSort({ key: "issued", dir: "desc" }, "company"), { key: "company", dir: "asc" });
  assert.deepEqual(toggleSort({ key: "issued", dir: "desc" }, "deviceCount", ["deviceCount"]), { key: "deviceCount", dir: "desc" });
});

test("compares strings naturally, numbers numerically, and keeps blanks last in both directions", () => {
  const rows = ["KWC-10", "KWC-9", undefined, "kwc-1"];
  assert.deepEqual([...rows].sort((a, b) => compareValues(a, b, "asc")), ["kwc-1", "KWC-9", "KWC-10", undefined]);
  assert.deepEqual([...rows].sort((a, b) => compareValues(a, b, "desc")), ["KWC-10", "KWC-9", "kwc-1", undefined]);
  assert.deepEqual([3, undefined, 10, 2].sort((a, b) => compareValues(a, b, "desc")), [10, 3, 2, undefined]);
  assert.equal(compareValues("", null, "asc"), 0);
});

test("only keeps usable stored column widths", () => {
  // Widths are stored as a share of the pane; the old pixel values are dropped so a table dragged
  // wide on one monitor does not stay too wide on every other one.
  assert.deepEqual(parseColumnWidths('{"fccId":32,"grantee":"wide","tiny":0.5,"legacyPixels":246}'), { fccId: 32 });

  // A drag is clamped so the columns it is taking room from keep a readable share each.
  assert.equal(columnShare(500, 1000, 3), 50);
  assert.equal(columnShare(2000, 1000, 3), 88);
  assert.equal(columnShare(10, 1000, 3), 4);

  // Shares live under their own key: a stored 48 meant 48 pixels under the old one and 48% under
  // this one, which turned a 48px arrow column into half the table.
  assert.equal(columnSharesKey("fda-records"), "fda-records-col-shares");

  // However many columns get pinned, the ones nobody dragged keep room to share.
  assert.deepEqual(fitShares({ a: 40, b: 30 }), { a: 40, b: 30 });
  assert.deepEqual(fitShares({ a: 60, b: 60 }), { a: 44, b: 44 });
  assert.deepEqual(parseColumnWidths("not json"), {});
  assert.deepEqual(parseColumnWidths(null), {});
});

test("remembers searches by their filter parameters only", () => {
  assert.equal(recentSearchParams("?q=sonova&sort=grantee-asc&rows=50&page=2&view=grantees&preset=sonova"), "q=sonova&preset=sonova");
  assert.equal(recentSearchParams("sort=issued-asc"), "");
  const list = rememberEntry([], "q=sonova", "“sonova”", "2026-09-17T00:00:00Z");
  const again = rememberEntry(list, "q=phonak", "“phonak”", "2026-09-17T00:01:00Z");
  const deduped = rememberEntry(again, "q=sonova", "“sonova”", "2026-09-17T00:02:00Z");
  assert.deepEqual(deduped.map((entry) => entry.params), ["q=sonova", "q=phonak"]);
  assert.equal(deduped[0].at, "2026-09-17T00:02:00Z");
  assert.deepEqual(rememberEntry(list, "", "empty"), list);
  const many = Array.from({ length: 8 }, (_, index) => `q=${index}`).reduce((current, params) => rememberEntry(current, params, params), []);
  assert.equal(many.length, 6);
  assert.deepEqual(parseRecentEntries(JSON.stringify(deduped)), deduped);
  assert.deepEqual(parseRecentEntries('[{"params":1},{"params":"q=a","label":"a"}]'), [{ params: "q=a", label: "a", at: "" }]);
  assert.deepEqual(parseRecentEntries("nope"), []);
});

test("columns nobody dragged share the remainder in their content-sized proportions", () => {
  const keys = ["name", "device", "date", "open"];
  // Nothing measured yet: only the dragged share is emitted and the browser splits the rest equally.
  assert.deepEqual(spreadShares(keys, { name: 30 }, {}), { name: 30 });
  // Measured: 70% is split 300 : 100 : 50 between the three free columns.
  assert.deepEqual(spreadShares(keys, { name: 30 }, { name: 400, device: 300, date: 100, open: 50 }), { name: 30, device: 46.7, date: 15.6, open: 7.8 });
  // A column added after the measurement takes the average weight of the measured free columns.
  assert.deepEqual(spreadShares(["name", "device", "extra"], { name: 40 }, { device: 200 }), { name: 40, device: 30, extra: 30 });
  // Hidden columns are ignored, and every free column keeps the minimum share.
  assert.deepEqual(spreadShares(["a", "b"], { a: 88, gone: 10 }, { b: 1 }), { a: 88, b: 12 });
  assert.equal(spreadShares(["a", "b", "c"], { a: 88 }, { b: 1000, c: 1 }).c, 4);
});

test("content-sized widths are measured per column and parsed defensively", () => {
  assert.equal(columnNaturalKey("fda-records-col-shares"), "fda-records-col-shares-col-natural");
  assert.deepEqual(measureNaturalWidths(["a", "b", "c"], [120.4, 0, 80.6]), { a: 120, c: 81 });
  assert.deepEqual(parseNaturalWidths('{"a":120,"b":-1,"c":"x"}'), { a: 120 });
  assert.deepEqual(parseNaturalWidths("not json"), {});
});
