import assert from "node:assert/strict";
import test from "node:test";
import { compareValues, parseColumnWidths, parseRecentEntries, recentSearchParams, rememberEntry, toggleSort } from "../app/explorer-tools-core.ts";

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
  assert.deepEqual(parseColumnWidths('{"fccId":246,"grantee":"wide","tiny":10,"open":48}'), { fccId: 246 });
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
