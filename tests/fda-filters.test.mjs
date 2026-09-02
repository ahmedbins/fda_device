import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FILTERS,
  applyCodeMatch,
  buildMatrix,
  buildSearch,
  filtersFromParams,
  filtersToParams,
  isNoMatches,
  normalizeCode,
  productCodeClause,
  recordMatchesCodes,
  recordProductCodes,
} from "../app/fda-shared.ts";

/**
 * One openFDA registration-listing result: a single device listing filed by one
 * establishment, with one `products[]` entry per product code on that listing.
 */
function listing(company, codes, extra = {}) {
  return {
    proprietary_name: extra.names ?? [`${company} device`],
    registration: {
      registration_number: extra.reg ?? `${company}-reg`,
      name: `${company} plant`,
      iso_country_code: "US",
      owner_operator: { firm_name: company },
    },
    k_number: extra.kNumber,
    products: codes.map((code) => ({
      product_code: code,
      created_date: "2026-01-01",
      openfda: { device_name: `${code} device`, device_class: "2" },
    })),
  };
}

const KSW_ONLY = listing("Acme Corp", ["KSW"]);
const OSM_ONLY = listing("Acme Corp", ["OSM"], { reg: "Acme Corp-reg-2" });
const BOTH = listing("Beta Ltd", ["KSW", "OSM"]);
const BOTH_PLUS_OTHER = listing("Gamma GmbH", ["KSW", "OSM", "QUH"]);
const UNRELATED = listing("Delta Inc", ["QDD"]);
const RECORDS = [KSW_ONLY, OSM_ONLY, BOTH, BOTH_PLUS_OTHER, UNRELATED];

const withCodes = (productCodes, codeMatch = "any", rest = {}) => ({ ...EMPTY_FILTERS, ...rest, productCodes, codeMatch });

test("one selected code: ANY and ALL return the same results and the same query", () => {
  const any = applyCodeMatch(RECORDS, ["KSW"], "any");
  const all = applyCodeMatch(RECORDS, ["KSW"], "all");
  assert.deepEqual(any, [KSW_ONLY, BOTH, BOTH_PLUS_OTHER]);
  assert.deepEqual(all, any);
  assert.equal(productCodeClause(["KSW"], "any"), 'products.product_code:"KSW"');
  assert.equal(productCodeClause(["KSW"], "all"), productCodeClause(["KSW"], "any"));
});

test("KSW + OSM with ANY matches listings carrying at least one code", () => {
  assert.deepEqual(applyCodeMatch(RECORDS, ["KSW", "OSM"], "any"), [KSW_ONLY, OSM_ONLY, BOTH, BOTH_PLUS_OTHER]);
  assert.equal(productCodeClause(["KSW", "OSM"], "any"), 'products.product_code:("KSW" OR "OSM")');
  assert.equal(buildSearch(withCodes(["KSW", "OSM"])), 'products.product_code:("KSW" OR "OSM")');
});

test("KSW + OSM with ALL matches only listings carrying both codes on the same record", () => {
  assert.deepEqual(applyCodeMatch(RECORDS, ["KSW", "OSM"], "all"), [BOTH, BOTH_PLUS_OTHER]);
  assert.equal(productCodeClause(["KSW", "OSM"], "all"), '(products.product_code:"KSW" AND products.product_code:"OSM")');
  assert.equal(
    buildSearch(withCodes(["KSW", "OSM"], "all", { country: "us" })),
    '(products.product_code:"KSW" AND products.product_code:"OSM") AND registration.iso_country_code:"US"',
  );
});

test("three selected codes with ALL require every code on the listing", () => {
  assert.deepEqual(applyCodeMatch(RECORDS, ["KSW", "OSM", "QUH"], "all"), [BOTH_PLUS_OTHER]);
  assert.equal(
    productCodeClause(["KSW", "OSM", "QUH"], "all"),
    '(products.product_code:"KSW" AND products.product_code:"OSM" AND products.product_code:"QUH")',
  );
  assert.deepEqual(applyCodeMatch(RECORDS, ["KSW", "OSM", "QUH"], "any"), [KSW_ONLY, OSM_ONLY, BOTH, BOTH_PLUS_OTHER]);
});

test("a listing containing KSW + OSM + another code still matches ALL", () => {
  assert.equal(recordMatchesCodes(BOTH_PLUS_OTHER, ["KSW", "OSM"], "all"), true);
  assert.deepEqual([...recordProductCodes(BOTH_PLUS_OTHER)], ["KSW", "OSM", "QUH"]);
});

test("unrelated listings do not match in either mode", () => {
  assert.equal(recordMatchesCodes(UNRELATED, ["KSW", "OSM"], "any"), false);
  assert.equal(recordMatchesCodes(UNRELATED, ["KSW", "OSM"], "all"), false);
  assert.equal(recordMatchesCodes(KSW_ONLY, ["KSW", "OSM"], "all"), false);
  assert.equal(recordMatchesCodes({ products: [] }, ["KSW"], "any"), false);
  assert.equal(recordMatchesCodes({}, ["KSW"], "all"), false);
});

test("ALL never joins separate listings from the same company", () => {
  // Acme files KSW on one listing and OSM on another: two FDA records, not one product carrying both.
  const acme = [KSW_ONLY, OSM_ONLY];
  assert.deepEqual(applyCodeMatch(acme, ["KSW", "OSM"], "all"), []);
  assert.deepEqual(buildMatrix(applyCodeMatch(acme, ["KSW", "OSM"], "all"), withCodes(["KSW", "OSM"], "all")), []);

  const anyRows = buildMatrix(applyCodeMatch(acme, ["KSW", "OSM"], "any"), withCodes(["KSW", "OSM"], "any"));
  assert.deepEqual(anyRows.map((row) => [row.productCode, row.company]), [["KSW", "Acme Corp"], ["OSM", "Acme Corp"]]);

  // Beta carries both on one listing, so it appears under each code with the same single registration.
  const betaRows = buildMatrix(applyCodeMatch([BOTH], ["KSW", "OSM"], "all"), withCodes(["KSW", "OSM"], "all"));
  assert.deepEqual(betaRows.map((row) => [row.productCode, row.company, row.registrations]), [["KSW", "Beta Ltd", 1], ["OSM", "Beta Ltd", 1]]);
});

test("existing ANY behaviour remains the default", () => {
  assert.equal(EMPTY_FILTERS.codeMatch, "any");
  assert.equal(filtersFromParams(new URLSearchParams("codes=KSW,OSM")).filters.codeMatch, "any");
  assert.equal(filtersFromParams(new URLSearchParams("codes=KSW,OSM&match=bogus")).filters.codeMatch, "any");
  assert.equal(buildSearch(withCodes(["KSW", "OSM"])), 'products.product_code:("KSW" OR "OSM")');
  assert.equal(filtersToParams(EMPTY_FILTERS, "records").has("match"), false);
});

test("match mode round-trips through the URL and empty selections match everything", () => {
  const params = filtersToParams(withCodes(["KSW", "OSM"], "all"), "matrix");
  assert.equal(params.get("codes"), "KSW,OSM");
  assert.equal(params.get("match"), "all");
  assert.equal(params.get("view"), "matrix");
  const restored = filtersFromParams(params);
  assert.deepEqual(restored.filters.productCodes, ["KSW", "OSM"]);
  assert.equal(restored.filters.codeMatch, "all");
  assert.equal(restored.view, "matrix");
  assert.equal(restored.autorun, true);
  assert.deepEqual(applyCodeMatch(RECORDS, [], "all"), RECORDS);
  assert.equal(productCodeClause([], "all"), "");
});

test("product codes are normalized (uppercase, trimmed) before comparison", () => {
  assert.equal(normalizeCode("  ksw "), "KSW");
  const messy = { products: [{ product_code: " ksw " }, { product_code: "osm" }] };
  assert.equal(recordMatchesCodes(messy, ["KSW", " Osm"], "all"), true);
  assert.equal(productCodeClause([" ksw ", "KSW", "osm"], "all"), '(products.product_code:"KSW" AND products.product_code:"OSM")');
  assert.deepEqual(applyCodeMatch(RECORDS, ["ksw", "osm"], "all"), [BOTH, BOTH_PLUS_OTHER]);
});

test("openFDA NOT_FOUND is an empty result set, not a failure", () => {
  assert.equal(isNoMatches(404, { error: { code: "NOT_FOUND", message: "No matches found!" } }), true);
  assert.equal(isNoMatches(404, {}), true);
  assert.equal(isNoMatches(500, { error: { code: "SERVER_ERROR", message: "boom" } }), false);
  assert.equal(isNoMatches(404, { error: { code: "OTHER", message: "Route missing" } }), false);
});
