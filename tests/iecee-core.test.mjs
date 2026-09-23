import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_IECEE_FILTERS,
  buildIeceeRequest,
  ieceeAppliedChips,
  ieceeCategoryLabel,
  ieceeCertificatesInWindow,
  ieceeRefBase,
  ieceeStateFromParams,
  ieceeStateToParams,
  isIeceeFamilyMember,
  normalizeIeceeDetail,
  normalizeIeceeFilters,
  normalizeIeceeHit,
  normalizeStandard,
  parseIeceeResponse,
  removeIeceeChip,
  standardLevel,
} from "../app/iecee-core.ts";
import { IECEE_RESULT_WINDOW, ieceeCertificateUpstream, ieceeTrademarkUpstream, sanitizeIeceeSearchBody } from "../app/iecee-relay.ts";

function hit(overrides = {}) {
  return {
    _id: "2217983",
    _source: {
      id: 2217983,
      ref_number: "NL-129540",
      subject: "Charger intended to charge compatible hearing aids",
      manufacturer_name: "SONOVA AG",
      trademark: "PHONAK",
      org_name: "DEKRA Certification B.V.",
      org: { id: 13360, name: "DEKRA Certification B.V.", type: "NCB", address: { country: { iso2_code: "NL", name: "Netherlands" } } },
      type: { level_1: "IECEE-CERTIFICATE-CBTEST", level_1_display_name: "CB Test Certificate" },
      status: { level_1: "VALID", level_1_display_name: "Valid" },
      scope_categories: ["MED"],
      scopes: [
        { level_1: "IEC 60601-1", level_2: "IEC 60601-1:2005", level_3: "IEC 60601-1:2005" },
        { level_1: "IEC 60601-1", level_2: "IEC 60601-1:2005", level_3: "IEC 60601-1:2005/AMD1:2012" },
        { level_1: "IEC 60601-1-11", level_2: "IEC 60601-1-11:2015", level_3: "IEC 60601-1-11:2015" },
      ],
      scopes_joined: "IEC 60601-1:2005, IEC 60601-1:2005/AMD1:2012, IEC 60601-1-11:2015",
      issue_date: "2026-09-16T00:00:00Z",
      release_date: "2026-09-16T00:00:00Z",
      last_update_date: "2026-09-16T10:01:54Z",
      expiration_date: null,
      is_private: false,
      ...overrides,
    },
  };
}

function bucket(key, docCount, extra = {}) {
  return { key, doc_count: docCount, details: { top: [{ metrics: extra.metrics || {} }] }, ...(extra.nested ? { nested: { buckets: extra.nested } } : {}), ...(extra.nestedCount !== undefined ? { nested_count: { doc_count: extra.nestedCount } } : {}) };
}

function aggregations(counts) {
  return {
    "buckets#status": { doc_count: counts.total, root: { nested: { buckets: [bucket("VALID", counts.valid, { metrics: { "status.level_1_display_name": "Valid" } }), bucket("CANCELLED", counts.cancelled, { metrics: { "status.level_1_display_name": "Cancelled" } })] } } },
    "buckets#type": { doc_count: counts.total, root: { nested: { buckets: [bucket("IECEE-CERTIFICATE-CBTEST", counts.total, { metrics: { "type.level_1_display_name": "CB Test Certificate" } })] } } },
    "buckets#scope_categories": { doc_count: counts.total, root: { nested: { buckets: [bucket("ITAV", counts.itav), bucket("MED", counts.med)] } } },
    "buckets#scopes": { doc_count: counts.total, root: { nested: { buckets: [bucket("IEC 60601-1", counts.med, { nestedCount: counts.med, nested: [bucket("IEC 60601-1:2005", counts.med, { nestedCount: counts.med, nested: [bucket("IEC 60601-1:2005/AMD1:2012", counts.med, { nestedCount: counts.med })] })] })] } } },
    "buckets#org_name": { doc_count: counts.total, root: { nested: { buckets: [bucket("DEKRA Certification B.V.", 2), bucket("SGS Fimko Ltd", 23)] } } },
    "metrics#min_issue_date": { doc_count: counts.total, nested: { value: 1489363200000, value_as_string: "2017-03-13" } },
    "metrics#max_issue_date": { doc_count: counts.total, nested: { value: 1789516800000, value_as_string: "2026-09-16" } },
  };
}

function response(primaryHits, secondaryHits, primaryCounts, secondaryCounts) {
  const block = (hits, total, counts) => ({ hits: { total: { value: total, relation: "eq" }, max_score: null, hits }, aggregations: aggregations(counts) });
  return {
    primary: block(primaryHits, primaryCounts.total, primaryCounts),
    secondary: block(secondaryHits, secondaryCounts.total, secondaryCounts),
  };
}

test("builds the official search body from filter state", () => {
  const body = buildIeceeRequest({
    ...EMPTY_IECEE_FILTERS,
    query: "  sonova   ag ",
    statuses: ["VALID"],
    types: ["IECEE-CERTIFICATE-CBTEST"],
    categories: ["med", "ITAV"],
    standards: ["iec 60601-1", "60601-1:2005", "IEC 60601-1"],
    standardMatch: "all",
    ncbs: ["DEKRA Certification B.V."],
    trademark: "Phonak",
    issuedFrom: "2025-01-01",
    issuedTo: "",
  }, { from: 50, size: 25 }, "updated-desc");
  assert.deepEqual(body, {
    from: 50,
    size: 25,
    query: "sonova ag",
    sortBy: [{ last_update_date: "desc" }],
    dateRanges: { issue_date: { min: "2025-01-01", max: null } },
    conjunctiveFacetGroups: ["scopes"],
    terms: {
      status: { 1: ["VALID"] },
      type: { 1: ["IECEE-CERTIFICATE-CBTEST"] },
      scope_categories: { 1: ["MED", "ITAV"] },
      scopes: { 1: ["IEC 60601-1"], 2: ["IEC 60601-1:2005"] },
      org_name: { 1: ["DEKRA Certification B.V."] },
      "trademark.for_agg": { 1: ["phonak"] },
    },
  });
  const plain = buildIeceeRequest(EMPTY_IECEE_FILTERS, { from: 0, size: 10 });
  assert.deepEqual(plain, { from: 0, size: 10, query: "", sortBy: [{ issue_date: "desc" }], dateRanges: {}, conjunctiveFacetGroups: [], terms: {} });
  assert.deepEqual(buildIeceeRequest({ ...EMPTY_IECEE_FILTERS, standards: ["IEC 60601-1", "IEC 62368-1"], standardMatch: "any" }, { from: 0, size: 10 }).conjunctiveFacetGroups, []);
  assert.deepEqual(buildIeceeRequest({ ...EMPTY_IECEE_FILTERS, standards: ["IEC 60601-1"], standardMatch: "all" }, { from: 0, size: 10 }).conjunctiveFacetGroups, [], "a single standard never needs conjunctive matching");
});

test("normalizes standards and knows their facet level", () => {
  assert.equal(normalizeStandard("iec 60601-1"), "IEC 60601-1");
  assert.equal(normalizeStandard("60601-1 : 2005"), "IEC 60601-1:2005");
  assert.equal(normalizeStandard("IEC60601-1"), "IEC 60601-1", "a prefix typed without a space still matches the index key");
  assert.equal(normalizeStandard("en60601-1:2006"), "EN 60601-1:2006");
  assert.equal(normalizeStandard("IEC 62368-1:2018 / AMD1:2020"), "IEC 62368-1:2018/AMD1:2020");
  assert.equal(normalizeStandard(" en 60601-1 "), "EN 60601-1");
  assert.equal(normalizeStandard("   "), "");
  assert.equal(standardLevel("IEC 60601-1"), "1");
  assert.equal(standardLevel("IEC 60601-1:2005"), "2");
});

test("normalizes a search hit into a certificate", () => {
  const certificate = normalizeIeceeHit(hit()._source);
  assert.equal(certificate.source, "IECEE");
  assert.equal(certificate.id, 2217983);
  assert.equal(certificate.refNumber, "NL-129540");
  assert.equal(certificate.manufacturer, "SONOVA AG");
  assert.equal(certificate.trademark, "PHONAK");
  assert.equal(certificate.ncb, "DEKRA Certification B.V.");
  assert.equal(certificate.ncbCountry, "Netherlands");
  assert.equal(certificate.typeLabel, "CB Test Certificate");
  assert.equal(certificate.status, "VALID");
  assert.equal(certificate.statusLabel, "Valid");
  assert.deepEqual(certificate.categories, ["MED"]);
  assert.deepEqual(certificate.standards, ["IEC 60601-1", "IEC 60601-1-11"]);
  assert.deepEqual(certificate.scopes, ["IEC 60601-1:2005", "IEC 60601-1:2005/AMD1:2012", "IEC 60601-1-11:2015"]);
  assert.equal(certificate.issuedAt, "2026-09-16");
  assert.equal(certificate.updatedAt, "2026-09-16T10:01:54Z");
  assert.equal(certificate.expiresAt, undefined);
  assert.equal(certificate.url, "https://certificates.iecee.org/deliverables/CERT/2217983");
  assert.equal(normalizeIeceeHit({ id: 0, ref_number: "X" }), null);
  assert.equal(normalizeIeceeHit(null), null);
  const unknownType = normalizeIeceeHit(hit({ type: { level_1: "IECEE-CERTIFICATE-NEW" }, status: { level_1: "valid" } })._source);
  assert.equal(unknownType.typeLabel, "NEW");
  assert.equal(unknownType.statusLabel, "Valid");
});

test("reads results from the filtered search and facets from both searches", () => {
  const payload = response(
    [hit(), hit({ id: 1, ref_number: "FR_723076/M1", scope_categories: ["ITAV"], status: { level_1: "CANCELLED", level_1_display_name: "Cancelled" } })],
    [hit()],
    { total: 101, valid: 100, cancelled: 1, itav: 62, med: 31 },
    { total: 31, valid: 31, cancelled: 0, itav: 0, med: 31 },
  );
  const result = parseIeceeResponse(payload, { from: 0, size: 25 }, "2026-09-17T00:00:00.000Z");
  assert.equal(result.total, 31);
  assert.equal(result.unfilteredTotal, 101);
  assert.equal(result.certificates.length, 1);
  assert.equal(result.capped, false);
  assert.equal(result.retrievedAt, "2026-09-17T00:00:00.000Z");
  assert.deepEqual(result.facets.status.map((option) => [option.key, option.label, option.count, option.total]), [["VALID", "Valid", 31, 100], ["CANCELLED", "Cancelled", 0, 1]]);
  assert.deepEqual(result.facets.categories.map((option) => [option.key, option.count, option.total]), [["ITAV", 0, 62], ["MED", 31, 31]]);
  assert.equal(result.facets.standards[0].key, "IEC 60601-1");
  assert.equal(result.facets.standards[0].children[0].key, "IEC 60601-1:2005");
  assert.equal(result.facets.standards[0].children[0].level, 2);
  assert.equal(result.facets.standards[0].children[0].children[0].key, "IEC 60601-1:2005/AMD1:2012");
  assert.deepEqual(result.facets.issueDates, { min: "2017-03-13", max: "2026-09-16" });
  assert.equal(result.facets.ncbs.length, 2);

  const single = parseIeceeResponse({ primary: payload.primary }, { from: 0, size: 25 });
  assert.equal(single.total, 101, "without a secondary search the primary results are used");
  assert.equal(single.certificates.length, 2);
  assert.equal(single.facets.status[0].count, 100);

  const capped = parseIeceeResponse(response([hit()], [hit()], { total: 1834199, valid: 1, cancelled: 0, itav: 0, med: 1 }, { total: 1834199, valid: 1, cancelled: 0, itav: 0, med: 1 }), { from: 0, size: 1 });
  assert.equal(capped.capped, true);
  assert.throws(() => parseIeceeResponse({ message: "Result window is too large" }, { from: 0, size: 1 }), /Result window is too large/);
  assert.throws(() => parseIeceeResponse("nope", { from: 0, size: 1 }), /unreadable/);
});

test("finds certificate families from the base reference number", () => {
  assert.equal(ieceeRefBase("CH-12254-A1"), "CH-12254");
  assert.equal(ieceeRefBase("FR_723076/M1"), "FR_723076");
  assert.equal(ieceeRefBase("DE-6-T2501229-M2"), "DE-6-T2501229");
  assert.equal(ieceeRefBase("10257/A1"), "10257");
  assert.equal(ieceeRefBase("US/11334/ITS"), "US/11334/ITS");
  assert.equal(ieceeRefBase("NL-129540"), "NL-129540");
  assert.equal(isIeceeFamilyMember("CH-12254-A1", "CH-12254"), true);
  assert.equal(isIeceeFamilyMember("CH-12254", "CH-12254"), true);
  assert.equal(isIeceeFamilyMember("CH-122540", "CH-12254"), false, "a longer number is not a family member");
  assert.equal(isIeceeFamilyMember("FR_723076/M1", "FR_723076"), true);
});

test("round-trips explorer state through URL parameters", () => {
  const filters = normalizeIeceeFilters({
    query: "sonova",
    statuses: ["valid", "bogus"],
    types: ["IECEE-CERTIFICATE-EMC"],
    categories: ["med"],
    standards: ["iec 60601-1", "IEC 60601-1:2005"],
    standardMatch: "all",
    ncbs: ["UL (Demko)", "SGS Fimko Ltd, Finland"],
    trademark: " PHONAK ",
    issuedFrom: "2025-01-01",
    issuedTo: "not-a-date",
  });
  assert.deepEqual(filters.statuses, ["VALID"]);
  assert.equal(filters.issuedTo, "");
  const params = ieceeStateToParams({ filters, sort: "ref-asc", pageSize: 50, page: 2, presetId: "sonova" });
  assert.deepEqual(params.getAll("ncb"), ["UL (Demko)", "SGS Fimko Ltd, Finland"], "names with commas survive because values are repeated parameters");
  assert.equal(params.get("stdmatch"), "all");
  assert.equal(params.get("page"), "3");
  const back = ieceeStateFromParams(new URLSearchParams(params.toString()));
  assert.deepEqual(back, { filters, sort: "ref-asc", pageSize: 50, page: 2, presetId: "sonova" });
  const defaults = ieceeStateFromParams(new URLSearchParams(""));
  assert.deepEqual(defaults, { filters: EMPTY_IECEE_FILTERS, sort: "issued-desc", pageSize: 25, page: 0, presetId: "" });
  assert.equal(ieceeStateToParams(defaults).toString(), "");
  assert.equal(ieceeStateFromParams(new URLSearchParams("rows=7&sort=bogus&page=0")).pageSize, 25);
});

test("describes applied filters as removable chips", () => {
  const filters = normalizeIeceeFilters({ query: "sonova", statuses: ["VALID"], categories: ["MED"], standards: ["IEC 60601-1", "IEC 62368-1"], standardMatch: "all", trademark: "PHONAK", issuedFrom: "2025-01-01", issuedTo: "2025-12-31" });
  const chips = ieceeAppliedChips(filters);
  assert.deepEqual(chips.map((chip) => chip.label), ["“sonova”", "Valid", "MED · Electrical equipment for medical use", "IEC 60601-1", "IEC 62368-1", "cites every standard", "Trademark PHONAK", "Issued 2025-01-01 → 2025-12-31"]);
  const withoutMatch = removeIeceeChip(filters, chips.find((chip) => chip.kind === "standardMatch"));
  assert.equal(withoutMatch.standardMatch, "any");
  const withoutStandard = removeIeceeChip(filters, chips.find((chip) => chip.value === "IEC 62368-1"));
  assert.deepEqual(withoutStandard.standards, ["IEC 60601-1"]);
  assert.deepEqual(removeIeceeChip(filters, chips.find((chip) => chip.kind === "issued")).issuedFrom, "");
  assert.equal(ieceeAppliedChips(removeIeceeChip(filters, chips[0])).some((chip) => chip.kind === "query"), false);
  assert.equal(ieceeCategoryLabel("hous"), "HOUS · Household and similar equipment");
  assert.equal(ieceeCategoryLabel("ZZZ"), "ZZZ", "unknown codes are shown as codes, not guessed");
});

test("selects certificates inside a monitoring window", () => {
  const certificates = [
    normalizeIeceeHit(hit({ id: 1, ref_number: "A", issue_date: "2026-09-01T00:00:00Z", last_update_date: "2026-09-02T00:00:00Z" })._source),
    normalizeIeceeHit(hit({ id: 2, ref_number: "B", issue_date: "2026-01-01T00:00:00Z", last_update_date: "2026-09-10T00:00:00Z" })._source),
    normalizeIeceeHit(hit({ id: 3, ref_number: "C", issue_date: "2025-01-01T00:00:00Z", last_update_date: "2025-02-01T00:00:00Z" })._source),
  ];
  assert.deepEqual(ieceeCertificatesInWindow(certificates, "2026-08-01").map((item) => item.refNumber), ["A"]);
  assert.deepEqual(ieceeCertificatesInWindow(certificates, "2026-08-01", "updatedAt").map((item) => item.refNumber), ["B", "A"]);
});

test("normalizes the public certificate detail record", () => {
  const detail = normalizeIeceeDetail({
    id: 2217983,
    ref_number: "NL-129540",
    ref_issue_number: 2031290,
    issue_date: "2026-09-16T00:00:00Z",
    last_update_date: "2026-09-16T10:01:54Z",
    scheme_code: "09",
    is_private: "N",
    model: "Phonak ChargerGo RIC E",
    product: "Charger intended to charge compatible hearing aids",
    rating: "5 V DC, 1.0 A",
    trademark: "PHONAK",
    national_diffs: ["CA", "JP", "US"],
    org: { id: 13360, code: "ADMN-6YNGLR", name: "DEKRA Certification B.V.", type: "NCB", address: { line1: "Meander 1051", postcode: "6825 MJ", town: "Arnhem", country: { iso2_code: "NL", name: "Netherlands" } } },
    status: { code: "CANCELLED", name: "Cancelled", status_message: "Client do not want to use certificate anymore." },
    cancel_info: { cancelled_by: "NCB", cancellation_date: "2026-09-20T00:00:00Z" },
    template: { id: 11, code: "IECEE-CERTIFICATE-CBTEST", name: "CB Test Certificate" },
    manufacturer_org: [{ id: 581667, name: "SONOVA AG", address: null }],
    factory_org: [{ id: 1, name: "Sonova Operations Center Vietnam", address: { line1: "Lot 1", town: "Binh Duong", country: { name: "Viet Nam" } } }],
    deliverable_file: { deliverable_pdf_file_name: "2217983.pdf" },
    scope_categories: ["MED"],
    scopes: [{ id: 2588, name: "IEC 60601-1-11:2015", type: "IECEE_PUBLICATION" }, { id: 2606, name: "IEC 60601-1:2005" }],
  });
  assert.equal(detail.refNumber, "NL-129540");
  assert.equal(detail.refIssueNumber, "2031290");
  assert.equal(detail.issuedAt, "2026-09-16");
  assert.equal(detail.model, "Phonak ChargerGo RIC E");
  assert.deepEqual(detail.nationalDifferences, ["CA", "JP", "US"]);
  assert.deepEqual(detail.status, { code: "CANCELLED", label: "Cancelled", message: "Client do not want to use certificate anymore." });
  assert.deepEqual(detail.cancellation, { by: "NCB", date: "2026-09-20" });
  assert.deepEqual(detail.type, { code: "IECEE-CERTIFICATE-CBTEST", label: "CB Test Certificate" });
  assert.equal(detail.ncb.address, "Meander 1051, 6825 MJ Arnhem, Netherlands");
  assert.deepEqual(detail.manufacturers, [{ name: "SONOVA AG", address: undefined }]);
  assert.deepEqual(detail.factories, [{ name: "Sonova Operations Center Vietnam", address: "Lot 1, Binh Duong, Viet Nam" }]);
  assert.deepEqual(detail.standards, ["IEC 60601-1-11:2015", "IEC 60601-1:2005"]);
  assert.equal(detail.hasPdf, true);
  assert.equal(detail.isPrivate, false);
  assert.equal(normalizeIeceeDetail({ id: "x" }), null);
});

test("relay validation only forwards the official search shape", () => {
  const ok = sanitizeIeceeSearchBody({ query: " sonova ", from: 0, size: 25, sortBy: [{ issue_date: "desc" }], dateRanges: { issue_date: { min: "2025-01-01", max: null } }, conjunctiveFacetGroups: ["scopes", "scopes"], terms: { status: { 1: ["VALID", "VALID", ""] }, scopes: { 2: ["IEC 60601-1:2005"] }, type: null }, extra: "dropped" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.body, { from: 0, size: 25, query: "sonova", sortBy: [{ issue_date: "desc" }], dateRanges: { issue_date: { min: "2025-01-01", max: null } }, conjunctiveFacetGroups: ["scopes"], terms: { status: { 1: ["VALID"] }, scopes: { 2: ["IEC 60601-1:2005"] } } });
  assert.equal("extra" in ok.body, false);
  const defaults = sanitizeIeceeSearchBody({});
  assert.deepEqual(defaults.body, { from: 0, size: 25, query: "", sortBy: [], dateRanges: {}, conjunctiveFacetGroups: [], terms: {} });
  const failures = [
    [null, /JSON object/],
    [{ query: 5 }, /query must be text/],
    [{ from: -1 }, /from must be/],
    [{ size: 0 }, /size must be/],
    [{ size: 1001 }, /size must be/],
    [{ from: 9990, size: 20 }, /first 10,000 results/],
    [{ sortBy: [{ manufacturer_name: "asc" }] }, /Sorting by manufacturer_name/],
    [{ sortBy: [{ issue_date: "up" }] }, /asc or desc/],
    [{ sortBy: [{ issue_date: "asc", ref_number: "asc" }] }, /exactly one field/],
    [{ dateRanges: { last_update_date: { min: "2025-01-01" } } }, /Date filtering on last_update_date/],
    [{ dateRanges: { issue_date: { min: "01/01/2025" } } }, /YYYY-MM-DD/],
    [{ dateRanges: { issue_date: { min: "2025-02-30" } } }, /YYYY-MM-DD/],
    [{ dateRanges: { issue_date: { min: "2025-06-01", max: "2025-01-01" } } }, /starts after it ends/],
    [{ conjunctiveFacetGroups: ["manufacturer_name"] }, /Unknown facet group/],
    [{ terms: { manufacturer_name: { 1: ["SONOVA AG"] } } }, /Unknown facet group manufacturer_name/],
    [{ terms: { status: { 4: ["VALID"] } } }, /Facet level 4/],
    [{ terms: { status: { 1: "VALID" } } }, /must be a list/],
    [{ terms: { status: { 1: [1] } } }, /must be text/],
    [{ terms: { scopes: { 1: Array.from({ length: 51 }, (_, index) => `IEC ${index}`) } } }, /At most 50/],
  ];
  for (const [input, pattern] of failures) {
    const result = sanitizeIeceeSearchBody(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.match(result.error, pattern, JSON.stringify(input));
  }
  assert.equal(IECEE_RESULT_WINDOW, 10_000);
  assert.equal(ieceeCertificateUpstream("2217983"), "https://ocs-iecee-api.iecee.org/api/proxy/deliverables/CERT/2217983");
  assert.equal(ieceeCertificateUpstream("2217983; DROP"), null);
  assert.equal(ieceeCertificateUpstream(""), null);
  assert.equal(ieceeTrademarkUpstream("  phonak  "), "https://ocs-iecee-api.iecee.org/api/search-trademarks?q=phonak");
  assert.equal(ieceeTrademarkUpstream("   "), null);
});
