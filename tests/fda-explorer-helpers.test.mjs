import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FILTERS,
  RECENT_SEARCHES_MAX,
  RECORD_SORT_OPTIONS,
  asRecordSort,
  cachedCodeInfo,
  describeFilters,
  fdaPremarketUrl,
  fdaProductCodeUrl,
  fetchCodeInfo,
  fetchListingPages,
  parseRecentSearches,
  pendingFilterChanges,
  recordSortParam,
  rememberSearch,
  seedCodeInfo,
} from "../app/fda-shared.ts";

function withMockFetch(bodyFor, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = bodyFor(String(url));
    return new Response(JSON.stringify(body), { status: body.error ? 404 : 200, headers: { "content-type": "application/json" } });
  };
  return run(calls).finally(() => { globalThis.fetch = original; });
}

test("record sorting only exposes fields openFDA can sort on, and falls back to relevance", () => {
  assert.equal(asRecordSort("newest"), "newest");
  assert.equal(asRecordSort("bogus"), "relevance");
  assert.equal(asRecordSort(null), "relevance");
  assert.equal(recordSortParam("relevance"), "");
  assert.equal(recordSortParam("newest"), "products.created_date:desc");
  assert.equal(recordSortParam("oldest"), "products.created_date:asc");
  assert.equal(recordSortParam("expiry"), "registration.reg_expiry_date_year:desc");
  assert.ok(RECORD_SORT_OPTIONS.every((option) => !option.openFda.includes("registration.name")), "text fields cannot be sorted");
});

test("FDA deep links recognise 510(k), De Novo and PMA numbers", () => {
  assert.match(fdaPremarketUrl("K233464"), /cfpmn\/pmn\.cfm\?ID=K233464$/);
  assert.match(fdaPremarketUrl(" k233464 "), /ID=K233464$/);
  assert.match(fdaPremarketUrl("DEN200023"), /cfpmn\/denovo\.cfm\?ID=DEN200023$/);
  assert.match(fdaPremarketUrl("P970029"), /cfpma\/pma\.cfm\?id=P970029$/);
  assert.equal(fdaPremarketUrl("EXEMPT"), "");
  assert.equal(fdaPremarketUrl(""), "");
  assert.match(fdaProductCodeUrl("osm"), /cfpcd\/classification\.cfm\?id=OSM$/);
});

test("recent searches are labelled, de-duplicated, capped and parsed defensively", () => {
  const codes = { ...EMPTY_FILTERS, productCodes: ["OSM", "ESD"], codeMatch: "all" };
  assert.equal(describeFilters(codes, "matrix"), "OSM + ESD · All codes · Company + devices");
  assert.equal(describeFilters({ ...EMPTY_FILTERS, keyword: "Sonova", country: "us" }, "records"), "“Sonova” · US");
  assert.equal(describeFilters(EMPTY_FILTERS, "records"), "All records");

  let list = rememberSearch([], codes, "matrix", "2026-09-02T00:00:00.000Z");
  assert.equal(list.length, 1);
  list = rememberSearch(list, { ...EMPTY_FILTERS, keyword: "Sonova" }, "records", "2026-09-02T00:01:00.000Z");
  list = rememberSearch(list, codes, "matrix", "2026-09-02T00:02:00.000Z");
  assert.equal(list.length, 2, "same parameters collapse into one entry");
  assert.equal(list[0].label, "OSM + ESD · All codes · Company + devices");
  assert.equal(list[0].at, "2026-09-02T00:02:00.000Z");
  assert.deepEqual(rememberSearch(list, EMPTY_FILTERS, "records"), list, "an empty search is not remembered");

  for (let index = 0; index < RECENT_SEARCHES_MAX + 3; index += 1) {
    list = rememberSearch(list, { ...EMPTY_FILTERS, keyword: `company ${index}` }, "records");
  }
  assert.equal(list.length, RECENT_SEARCHES_MAX);

  assert.deepEqual(parseRecentSearches(null), []);
  assert.deepEqual(parseRecentSearches("not json"), []);
  assert.deepEqual(parseRecentSearches(JSON.stringify({ nope: true })), []);
  assert.deepEqual(parseRecentSearches(JSON.stringify([{ params: "codes=OSM", label: "OSM" }, { junk: 1 }])), [{ params: "codes=OSM", label: "OSM", at: "" }]);
});

test("paged listing fetches forward the sort parameter and stop at the cap", async () => {
  await withMockFetch(
    () => ({ meta: { results: { total: 2500 } }, results: Array.from({ length: 1000 }, (_, index) => ({ index })) }),
    async (calls) => {
      const { results, total } = await fetchListingPages("https://example.test/listing.json", 'products.product_code:"OSM"', 1500, undefined, "products.created_date:desc");
      assert.equal(total, 2500);
      assert.equal(results.length, 2000, "two pages are needed to pass a 1,500 cap");
      assert.equal(calls.length, 2);
      assert.ok(calls.every((url) => url.includes("sort=products.created_date%3Adesc")));
      assert.ok(calls[1].includes("skip=1000"));
    },
  );
});

test("product-code lookup names known codes, flags unknown ones and caches both", async () => {
  seedCodeInfo([{ code: "qdd", name: "Self-Fitting Air-Conduction Hearing Aid, Prescription", deviceClass: "2", regulation: "874.3325", specialty: "Ear Nose & Throat" }]);
  assert.equal(cachedCodeInfo("QDD")?.regulation, "874.3325");
  assert.equal(cachedCodeInfo("OSM")?.name.startsWith("Hearing Aid"), true, "preset codes are pre-seeded");

  await withMockFetch(
    (url) => (url.includes("KLW")
      ? { results: [{ product_code: "KLW", device_name: "Masker, Tinnitus", device_class: "2", regulation_number: "874.3400" }] }
      : { error: { code: "NOT_FOUND", message: "No matches found!" } }),
    async (calls) => {
      const resolved = await fetchCodeInfo(["klw", "ZZZZ", "QDD"]);
      assert.equal(resolved.get("KLW")?.name, "Masker, Tinnitus");
      assert.equal(resolved.get("ZZZZ"), null, "codes openFDA does not know resolve to null");
      assert.equal(resolved.get("QDD")?.deviceClass, "2", "seeded codes are served from cache");
      assert.equal(calls.length, 1, "one batched classification request");
      assert.ok(calls[0].includes("classification.json"));
      assert.ok(!calls[0].includes("QDD"), "cached codes are not re-requested");

      const again = await fetchCodeInfo(["KLW", "ZZZZ"]);
      assert.equal(again.get("ZZZZ"), null);
      assert.equal(calls.length, 1, "misses are cached too");
      assert.equal(cachedCodeInfo("ZZZZ"), null);
      assert.equal(cachedCodeInfo("NEVER"), undefined);
    },
  );
});

test("pending filter changes compare draft and applied filters per view", () => {
  const applied = { ...EMPTY_FILTERS, productCodes: ["OSM", "KLW"], country: "us", codeMatch: "any" };
  assert.deepEqual(pendingFilterChanges({ ...applied, productCodes: ["KLW", "OSM"], country: "US" }, applied, "records"), [], "order and case do not count as changes");
  assert.deepEqual(pendingFilterChanges({ ...applied, keyword: "Sonova" }, applied, "records"), ["keywords"]);
  assert.deepEqual(pendingFilterChanges(applied, applied, "records", "QDD"), ["product codes"], "a typed but uncommitted code counts");
  assert.deepEqual(pendingFilterChanges({ ...applied, productCodes: ["OSM"] }, applied, "records"), ["product codes"]);
  assert.deepEqual(pendingFilterChanges({ ...applied, codeMatch: "all" }, applied, "records"), [], "match mode is irrelevant in Records");
  assert.deepEqual(pendingFilterChanges({ ...applied, codeMatch: "all" }, applied, "matrix"), ["match mode"]);
  assert.deepEqual(pendingFilterChanges({ ...applied, country: "CH", state: "ZH", establishment: "Manufacture Medical Device" }, applied, "udi"), [], "GUDID ignores location and role");
  assert.deepEqual(pendingFilterChanges({ ...applied, country: "CH", deviceClass: "2" }, applied, "records"), ["device class", "country"]);
});
