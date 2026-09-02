import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FILTERS,
  buildMatrix,
  buildSearch,
  codeMatchApplies,
  companiesCoveringAllCodes,
  companyCodeCoverage,
  filtersFromParams,
  filtersToParams,
  isNoMatches,
  matrixCompanyCount,
  normalizeCode,
  productCodeClause,
  recordProductCodes,
} from "../app/fda-shared.ts";

/**
 * One openFDA registration-listing result: a single device listing filed by one
 * establishment, normally carrying exactly one product code.
 */
function listing(company, codes, extra = {}) {
  return {
    proprietary_name: extra.names ?? [`${company} ${codes.join("/")} device`],
    registration: {
      registration_number: extra.reg ?? `${company}-${codes.join("-")}`,
      name: extra.plant ?? `${company} plant`,
      iso_country_code: "US",
      owner_operator: { firm_name: company },
    },
    products: codes.map((code) => ({
      product_code: code,
      created_date: "2026-01-01",
      openfda: { device_name: `${code} device`, device_class: extra.deviceClass ?? "2" },
    })),
  };
}

// Acme files KSW and OSM on two separate listings — the normal FDA shape.
const ACME_KSW = listing("Acme Corp", ["KSW"]);
const ACME_OSM = listing("Acme Corp", ["OSM"]);
// Beta carries both codes on one listing (the rare multi-code filing).
const BETA_BOTH = listing("Beta Ltd", ["KSW", "OSM"]);
// Gamma covers KSW, OSM and a third code across three listings.
const GAMMA_KSW = listing("Gamma GmbH", ["KSW"]);
const GAMMA_OSM = listing("Gamma GmbH", ["OSM"]);
const GAMMA_QUH = listing("Gamma GmbH", ["QUH"]);
// Epsilon only ever filed KSW; Delta filed something unrelated.
const EPSILON_KSW = listing("Epsilon Inc", ["KSW"]);
const DELTA_QDD = listing("Delta Inc", ["QDD"]);
const RECORDS = [ACME_KSW, ACME_OSM, BETA_BOTH, GAMMA_KSW, GAMMA_OSM, GAMMA_QUH, EPSILON_KSW, DELTA_QDD];

const withCodes = (productCodes, codeMatch = "any", rest = {}) => ({ ...EMPTY_FILTERS, ...rest, productCodes, codeMatch });
const companies = (rows) => [...new Set(rows.map((row) => row.company))].sort();
const codeCompanyPairs = (rows) => rows.map((row) => `${row.productCode}:${row.company}`).sort();

test("one selected code: ANY and ALL produce the same Company + devices rows", () => {
  const any = buildMatrix(RECORDS, withCodes(["KSW"], "any"));
  const all = buildMatrix(RECORDS, withCodes(["KSW"], "all"));
  assert.deepEqual(companies(any), ["Acme Corp", "Beta Ltd", "Epsilon Inc", "Gamma GmbH"]);
  assert.deepEqual(all, any);
  assert.equal(codeMatchApplies(withCodes(["KSW"], "all")), false);
});

test("KSW + OSM with ANY lists every company holding at least one code", () => {
  const rows = buildMatrix(RECORDS, withCodes(["KSW", "OSM"], "any"));
  assert.deepEqual(companies(rows), ["Acme Corp", "Beta Ltd", "Epsilon Inc", "Gamma GmbH"]);
  assert.deepEqual(codeCompanyPairs(rows), [
    "KSW:Acme Corp", "KSW:Beta Ltd", "KSW:Epsilon Inc", "KSW:Gamma GmbH",
    "OSM:Acme Corp", "OSM:Beta Ltd", "OSM:Gamma GmbH",
  ]);
  assert.equal(matrixCompanyCount(rows), 4);
});

test("KSW + OSM with ALL keeps only companies whose listings cover both codes", () => {
  const rows = buildMatrix(RECORDS, withCodes(["KSW", "OSM"], "all"));
  // Acme qualifies through two separate listings; Beta through one multi-code listing; Gamma through separate listings plus an extra code.
  assert.deepEqual(companies(rows), ["Acme Corp", "Beta Ltd", "Gamma GmbH"]);
  assert.deepEqual(codeCompanyPairs(rows), [
    "KSW:Acme Corp", "KSW:Beta Ltd", "KSW:Gamma GmbH",
    "OSM:Acme Corp", "OSM:Beta Ltd", "OSM:Gamma GmbH",
  ]);
  assert.deepEqual([...companiesCoveringAllCodes(RECORDS, withCodes(["KSW", "OSM"], "all"))].sort(), ["acme corp", "beta ltd", "gamma gmbh"]);
  assert.equal(matrixCompanyCount(rows), 3);
});

test("three selected codes with ALL require every code across the company's listings", () => {
  const rows = buildMatrix(RECORDS, withCodes(["KSW", "OSM", "QUH"], "all"));
  assert.deepEqual(companies(rows), ["Gamma GmbH"]);
  assert.deepEqual(codeCompanyPairs(rows), ["KSW:Gamma GmbH", "OSM:Gamma GmbH", "QUH:Gamma GmbH"]);
  const any = buildMatrix(RECORDS, withCodes(["KSW", "OSM", "QUH"], "any"));
  assert.deepEqual(companies(any), ["Acme Corp", "Beta Ltd", "Epsilon Inc", "Gamma GmbH"]);
});

test("a company holding KSW + OSM + another code still matches ALL for KSW + OSM", () => {
  const rows = buildMatrix(RECORDS, withCodes(["KSW", "OSM"], "all"));
  assert.ok(companies(rows).includes("Gamma GmbH"));
  // The extra code is not part of the selection, so it does not appear as a row.
  assert.equal(rows.some((row) => row.productCode === "QUH"), false);
  const coverage = companyCodeCoverage(RECORDS, withCodes(["KSW", "OSM"], "all"));
  assert.deepEqual([...coverage.get("gamma gmbh")].sort(), ["KSW", "OSM"]);
});

test("unrelated and single-code companies do not match ALL", () => {
  const rows = buildMatrix(RECORDS, withCodes(["KSW", "OSM"], "all"));
  assert.equal(companies(rows).includes("Epsilon Inc"), false);
  assert.equal(companies(rows).includes("Delta Inc"), false);
  assert.deepEqual(buildMatrix([EPSILON_KSW, DELTA_QDD], withCodes(["KSW", "OSM"], "all")), []);
  assert.deepEqual(recordProductCodes({}), new Set());
});

test("ALL is a company-level rollup: two separate listings from one firm count, from two firms they do not", () => {
  assert.deepEqual(companies(buildMatrix([ACME_KSW, ACME_OSM], withCodes(["KSW", "OSM"], "all"))), ["Acme Corp"]);
  assert.deepEqual(buildMatrix([EPSILON_KSW, listing("Zeta Co", ["OSM"])], withCodes(["KSW", "OSM"], "all")), []);
  // Owner/operator names are compared case- and whitespace-insensitively.
  const shouty = listing("ACME  CORP", ["OSM"]);
  assert.deepEqual(companies(buildMatrix([ACME_KSW, shouty], withCodes(["KSW", "OSM"], "all"))), ["ACME  CORP", "Acme Corp"]);
  assert.equal(matrixCompanyCount(buildMatrix([ACME_KSW, shouty], withCodes(["KSW", "OSM"], "all"))), 1);
});

test("the device-class filter participates in coverage", () => {
  const classOne = listing("Acme Corp", ["OSM"], { deviceClass: "1", reg: "acme-osm-class1" });
  const filters = withCodes(["KSW", "OSM"], "all", { deviceClass: "2" });
  // Acme's only OSM listing is class 1, so with a class 2 filter Acme no longer covers OSM.
  assert.deepEqual(buildMatrix([ACME_KSW, classOne], filters), []);
  assert.deepEqual(companies(buildMatrix([ACME_KSW, ACME_OSM], filters)), ["Acme Corp"]);
});

test("existing ANY behaviour remains the default and the Records query never changes with the mode", () => {
  assert.equal(EMPTY_FILTERS.codeMatch, "any");
  assert.equal(filtersFromParams(new URLSearchParams("codes=KSW,OSM")).filters.codeMatch, "any");
  assert.equal(filtersFromParams(new URLSearchParams("codes=KSW,OSM&match=bogus")).filters.codeMatch, "any");
  assert.equal(filtersToParams(EMPTY_FILTERS, "records").has("match"), false);
  assert.equal(productCodeClause(["KSW"]), 'products.product_code:"KSW"');
  assert.equal(productCodeClause(["KSW", "OSM"]), 'products.product_code:("KSW" OR "OSM")');
  assert.equal(buildSearch(withCodes(["KSW", "OSM"], "any")), 'products.product_code:("KSW" OR "OSM")');
  assert.equal(buildSearch(withCodes(["KSW", "OSM"], "all")), buildSearch(withCodes(["KSW", "OSM"], "any")));
  assert.equal(
    buildSearch(withCodes(["KSW", "OSM"], "all", { country: "us" })),
    'products.product_code:("KSW" OR "OSM") AND registration.iso_country_code:"US"',
  );
});

test("match mode round-trips through the URL and an empty selection matches everything", () => {
  const params = filtersToParams(withCodes(["KSW", "OSM"], "all"), "matrix");
  assert.equal(params.get("codes"), "KSW,OSM");
  assert.equal(params.get("match"), "all");
  assert.equal(params.get("view"), "matrix");
  const restored = filtersFromParams(params);
  assert.deepEqual(restored.filters.productCodes, ["KSW", "OSM"]);
  assert.equal(restored.filters.codeMatch, "all");
  assert.equal(restored.view, "matrix");
  assert.equal(restored.autorun, true);
  assert.equal(buildMatrix(RECORDS, withCodes([], "all")).length, buildMatrix(RECORDS, withCodes([], "any")).length);
  assert.equal(productCodeClause([]), "");
  assert.equal(companiesCoveringAllCodes(RECORDS, withCodes([], "all")).size, 0);
});

test("product codes are normalized (uppercase, trimmed) before comparison", () => {
  assert.equal(normalizeCode("  ksw "), "KSW");
  const messy = listing("Messy Co", [" ksw "]);
  const messy2 = listing("Messy Co", ["osm"]);
  assert.deepEqual(companies(buildMatrix([messy, messy2], withCodes(["KSW", " Osm"], "all"))), ["Messy Co"]);
  assert.equal(productCodeClause([" ksw ", "KSW", "osm"]), 'products.product_code:("KSW" OR "OSM")');
  assert.deepEqual([...recordProductCodes(messy)], ["KSW"]);
});

test("openFDA NOT_FOUND is an empty result set, not a failure", () => {
  assert.equal(isNoMatches(404, { error: { code: "NOT_FOUND", message: "No matches found!" } }), true);
  assert.equal(isNoMatches(404, {}), true);
  assert.equal(isNoMatches(500, { error: { code: "SERVER_ERROR", message: "boom" } }), false);
  assert.equal(isNoMatches(404, { error: { code: "OTHER", message: "Route missing" } }), false);
});
