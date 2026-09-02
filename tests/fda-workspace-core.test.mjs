import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTERS } from "../app/fda-shared.ts";
import {
  BUILT_IN_SCOPES,
  OTHER_KEY,
  applyScopeMatch,
  asMatchLevel,
  matchLevelParam,
  buildCompanies,
  buildOverview,
  compareCompanies,
  companyKey,
  filterRows,
  newListingsWithin,
  parseSavedScopes,
  scopeCodes,
  scopeProducts,
  scopeSignature,
  scopeSummary,
  sortRows,
  timelineByYear,
} from "../app/next/fda-workspace-core.ts";

function listing({ company, operator, reg, name, country = "US", codes, names = [], k, role = "Manufacture Medical Device" }) {
  return {
    proprietary_name: names,
    establishment_type: [role],
    k_number: k,
    registration: {
      registration_number: reg,
      fei_number: `fei-${reg}`,
      name: name || `${company} plant`,
      iso_country_code: country,
      reg_expiry_date_year: "2026",
      owner_operator: { firm_name: company, owner_operator_number: operator },
    },
    products: codes.map(([code, created, cls = "2"]) => ({ product_code: code, created_date: created, openfda: { device_name: `${code} device`, device_class: cls } })),
  };
}

const NOW = new Date("2026-09-02T00:00:00Z");
const RECORDS = [
  listing({ company: "Sonova AG", operator: "9028479", reg: "R1", country: "CH", codes: [["OSM", "2011-04-01"], ["QUG", "2023-02-10"]], names: ["Audéo"], k: "K111" }),
  listing({ company: "Sonova AG", operator: "9028479", reg: "R2", country: "US", codes: [["QUF", "2026-07-01"]], names: ["Sennheiser All-Day Clear"] }),
  listing({ company: "GN Hearing A/S", operator: "2182204", reg: "R3", country: "DK", codes: [["QDD", "2022-02-10"], ["QUH", "2022-02-10"]], names: ["Enhance Plus"], k: "K213424" }),
  listing({ company: "New Entrant Co", operator: "5555", reg: "R4", country: "CN", codes: [["QUF", "2026-08-04", "1"]], names: [], role: "Export Device to the United States But Perform No Other Operation on Device" }),
  listing({ company: "Nameless Owner", operator: "", reg: "R5", country: "CN", codes: [["QUG", "2024-05-05"]] }),
];
const SCOPE = { ...EMPTY_FILTERS, productCodes: ["QUF", "QUG", "QDD", "QUH", "OSM", "SCR"] };

test("companies group by owner/operator number and keep listings, establishments, codes and dates", () => {
  const companies = buildCompanies(RECORDS, SCOPE, SCOPE.productCodes);
  assert.deepEqual(companies.map((c) => c.name), ["Sonova AG", "GN Hearing A/S", "Nameless Owner", "New Entrant Co"]);
  const sonova = companies[0];
  assert.equal(sonova.key, "op:9028479");
  assert.equal(sonova.listings, 2);
  assert.equal(sonova.establishments.length, 2);
  assert.deepEqual(sonova.countries, ["CH", "US"]);
  assert.deepEqual(sonova.codes, ["QUF", "QUG", "OSM"]); // scope order, not alphabetical
  assert.deepEqual(sonova.codeCounts, { OSM: 1, QUG: 1, QUF: 1 });
  assert.deepEqual(sonova.tradeNames, ["Audéo", "Sennheiser All-Day Clear"]);
  assert.deepEqual(sonova.premarket, ["K111"]);
  assert.equal(sonova.firstListed, "2011-04-01");
  assert.equal(sonova.latestListed, "2026-07-01");
  assert.equal(companyKey(RECORDS[4]), "name:nameless owner");
});

test("a company is never credited with a code from outside the scope", () => {
  const narrow = { ...EMPTY_FILTERS, productCodes: ["QUF"] };
  const companies = buildCompanies(RECORDS, narrow, narrow.productCodes);
  const sonova = companies.find((c) => c.name === "Sonova AG");
  assert.deepEqual(sonova.codes, ["QUF"]);
  assert.equal(sonova.firstListed, "2026-07-01");
});

test("overview counts listings, companies, establishments, countries and finds new entrants", () => {
  const companies = buildCompanies(RECORDS, SCOPE, SCOPE.productCodes);
  const overview = buildOverview(RECORDS, SCOPE, companies, { now: NOW });
  assert.equal(overview.listings, 5);
  assert.equal(overview.companies, 4);
  assert.equal(overview.establishments, 5);
  assert.equal(overview.countries, 4);
  assert.deepEqual(overview.codes, SCOPE.productCodes);
  assert.deepEqual(overview.byCode.map((d) => [d.key, d.value]), [["QUF", 2], ["QUG", 2], ["QDD", 1], ["QUH", 1], ["OSM", 1], ["SCR", 0]]);
  assert.deepEqual(overview.byCountry.map((d) => [d.key, d.value]), [["CN", 2], ["CH", 1], ["DK", 1], ["US", 1]]);
  assert.deepEqual(overview.byClass.map((d) => [d.label, d.value]), [["Class 1", 1], ["Class 2", 6]]);
  assert.deepEqual(overview.newCompanies.map((c) => c.name), ["New Entrant Co", "Sonova AG"].filter((n) => n === "New Entrant Co"));
  assert.equal(overview.latest[0].createdDate, "2026-08-04");
});

test("timeline buckets every year between first and last listing, folding unknown codes into Other", () => {
  const products = scopeProducts(RECORDS, EMPTY_FILTERS);
  const buckets = timelineByYear(products, ["QUF", "QUG"], 2026);
  assert.equal(buckets[0].year, 2011);
  assert.equal(buckets.at(-1).year, 2026);
  assert.equal(buckets.length, 16);
  const y2022 = buckets.find((b) => b.year === 2022);
  assert.deepEqual(y2022.perCode, { [OTHER_KEY]: 2 });
  const y2026 = buckets.find((b) => b.year === 2026);
  assert.deepEqual(y2026.perCode, { QUF: 2 });
  assert.equal(y2026.total, 2);
  assert.deepEqual(timelineByYear([], ["QUF"]), []);
});

test("scope codes follow the selection order, or frequency when nothing is selected", () => {
  const products = scopeProducts(RECORDS, EMPTY_FILTERS);
  assert.deepEqual(scopeCodes({ ...EMPTY_FILTERS, productCodes: ["osm", "QUF"] }, products), ["OSM", "QUF"]);
  assert.deepEqual(scopeCodes(EMPTY_FILTERS, products, 3), ["QUF", "QUG", "OSM"]);
});

test("new listings within a window are newest first", () => {
  const products = scopeProducts(RECORDS, SCOPE);
  const recent = newListingsWithin(products, 90, NOW);
  assert.deepEqual(recent.map((entry) => [entry.code, entry.createdDate]), [["QUF", "2026-08-04"], ["QUF", "2026-07-01"]]);
});

test("sorting and text filtering work on any accessor", () => {
  const companies = buildCompanies(RECORDS, SCOPE, SCOPE.productCodes);
  assert.deepEqual(sortRows(companies, (c) => c.name, "asc").map((c) => c.name), ["GN Hearing A/S", "Nameless Owner", "New Entrant Co", "Sonova AG"]);
  assert.deepEqual(sortRows(companies, (c) => c.firstListed, "desc").map((c) => c.firstListed), ["2026-08-04", "2024-05-05", "2022-02-10", "2011-04-01"]);
  assert.deepEqual(sortRows([{ v: "" }, { v: "b" }, { v: "a" }], (r) => r.v, "asc").map((r) => r.v), ["a", "b", ""]);
  assert.deepEqual(filterRows(companies, "gn hearing", (c) => `${c.name} ${c.tradeNames.join(" ")}`).map((c) => c.name), ["GN Hearing A/S"]);
  assert.deepEqual(filterRows(companies, "enhance", (c) => `${c.name} ${c.tradeNames.join(" ")}`).map((c) => c.name), ["GN Hearing A/S"]);
  assert.equal(filterRows(companies, "   ", (c) => c.name).length, companies.length);
});

test("compare table lines up pinned companies against the scope codes", () => {
  const companies = buildCompanies(RECORDS, SCOPE, SCOPE.productCodes).slice(0, 2);
  const rows = compareCompanies(companies, ["QUF", "QDD"]);
  assert.deepEqual(rows[0], { label: "Listings in scope", values: ["2", "1"] });
  assert.deepEqual(rows.find((r) => r.label === "QUF listings").values, ["1", "0"]);
  assert.deepEqual(rows.find((r) => r.label === "QDD listings").values, ["0", "1"]);
  assert.deepEqual(rows.find((r) => r.label === "Codes covered").values, ["3 of 2", "2 of 2"]);
});

test("saved scopes round-trip, normalize codes and ignore junk", () => {
  assert.equal(BUILT_IN_SCOPES[0].filters.productCodes.length, 6);
  const parsed = parseSavedScopes(JSON.stringify([
    { id: "a", name: "Mine", filters: { ...EMPTY_FILTERS, productCodes: ["qdd", " quh "], codeMatch: "all" } },
    { id: "b", name: 12 },
    "junk",
  ]));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].filters.productCodes, ["QDD", "QUH"]);
  assert.equal(parsed[0].filters.codeMatch, "all");
  assert.deepEqual(parseSavedScopes("not json"), []);
  assert.deepEqual(parseSavedScopes(null), []);
});

test("scope signature ignores order-insensitive noise and the match mode for single codes", () => {
  const a = { ...EMPTY_FILTERS, productCodes: ["QUF"], codeMatch: "all", keyword: " Sonova " };
  const b = { ...EMPTY_FILTERS, productCodes: ["quf"], codeMatch: "any", keyword: "sonova" };
  assert.equal(scopeSignature(a), scopeSignature(b));
  assert.notEqual(scopeSignature({ ...EMPTY_FILTERS, productCodes: ["QUF", "QUG"], codeMatch: "all" }), scopeSignature({ ...EMPTY_FILTERS, productCodes: ["QUF", "QUG"] }));
  assert.equal(scopeSummary({ ...EMPTY_FILTERS, productCodes: ["QDD", "QUH"], codeMatch: "all", country: "us" }), "QDD · QUH (all together) · US");
  assert.equal(scopeSummary(EMPTY_FILTERS), "Whole registry");
});

test("scope match levels: any, all on one listing, all across a company", () => {
  const two = { ...EMPTY_FILTERS, productCodes: ["QDD", "QUH"] };
  const any = applyScopeMatch(RECORDS, two, "any");
  assert.deepEqual(any.map((r) => r.registration.registration_number), ["R3"]);
  const otc = { ...EMPTY_FILTERS, productCodes: ["QUF", "QUG"] };
  assert.deepEqual(applyScopeMatch(RECORDS, otc, "any").map((r) => r.registration.registration_number), ["R1", "R2", "R4", "R5"]);
  // No single Sonova listing carries both QUF and QUG…
  assert.deepEqual(applyScopeMatch(RECORDS, otc, "listing"), []);
  // …but the company does, across R1 (QUG) and R2 (QUF); Nameless Owner and New Entrant do not.
  assert.deepEqual(applyScopeMatch(RECORDS, otc, "company").map((r) => r.registration.registration_number), ["R1", "R2"]);
  // GN carries QDD + QUH on one filing, so it satisfies both ALL levels.
  assert.deepEqual(applyScopeMatch(RECORDS, two, "listing").map((r) => r.registration.registration_number), ["R3"]);
  assert.deepEqual(applyScopeMatch(RECORDS, two, "company").map((r) => r.registration.registration_number), ["R3"]);
  // Single code or no code: the level changes nothing.
  assert.equal(applyScopeMatch(RECORDS, { ...EMPTY_FILTERS, productCodes: ["QUF"] }, "company").length, 2);
  assert.equal(applyScopeMatch(RECORDS, EMPTY_FILTERS, "listing").length, RECORDS.length);
  assert.equal(asMatchLevel("all"), "company");
  assert.equal(asMatchLevel("company"), "company");
  assert.equal(asMatchLevel("listing"), "listing");
  assert.equal(asMatchLevel("bogus"), "any");
  assert.equal(matchLevelParam("company"), "all");
  assert.equal(matchLevelParam("any"), "");
});
