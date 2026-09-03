import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTERS, describeFilters, filtersFromParams, filtersToParams } from "../app/fda-shared.ts";
import {
  PREMARKET_GAP_COLUMNS,
  UDI_LABELER_GROUPS,
  UDI_PM_EXEMPT,
  UDI_PREMARKET_EXISTS,
  accessGudidUrl,
  buildUdiSearch,
  labelerGroupFor,
  labelersFor,
  listingCodesForUdi,
  listingSearchForDevice,
  normalizeLabeler,
  normalizeUdi,
  parseUdiAliases,
  premarketGapRows,
  udiCodesClause,
  udiCompanySearch,
  udiDeviceHasCodes,
  udiIgnoredFilters,
  udiListingSearch,
  udiPremarketLabel,
  udiSortParam,
  udiSummary,
} from "../app/fda-udi.ts";

/** A GUDID record the way openFDA returns it: booleans as strings, arrays possibly null. */
const RAW_HEARING_AID = {
  public_device_record_key: "f4d17343-7a88-4223-a1b1-c8eab84fdd48",
  brand_name: "Signia",
  version_or_model_number: "Motion C&G P 3IX",
  catalog_number: "21038611",
  company_name: "Ws Audiology Usa, Inc.",
  labeler_duns_number: "157412271",
  device_description: "HA MOTION C&G P 3IX TQS",
  identifiers: [
    { id: "05714880240504", type: "Primary", issuing_agency: "GS1" },
    { id: "15714880240501", type: "Package", issuing_agency: "GS1", unit_of_use_id: "05714880240504", quantity_per_package: "3", package_status: "In Commercial Distribution", package_type: "Carton" },
  ],
  product_codes: [
    { code: "OSM", name: "Hearing Aid, Air Conduction With Wireless Technology", openfda: { device_name: "Hearing Aid, Air-Conduction With Wireless Technology, Prescription", device_class: "2", regulation_number: "874.3305", medical_specialty_description: "Ear, Nose, Throat" } },
    { code: "klw", name: "Masker, Tinnitus", openfda: { device_name: "Masker, Tinnitus", device_class: "2", regulation_number: "874.3400" } },
  ],
  premarket_submissions: null,
  gmdn_terms: [{ code: "34671", name: "Air-conduction hearing aid, behind-the-ear", definition: "A battery-powered acoustic device…" }],
  customer_contacts: [{ phone: "17325626600", email: "consumerrelations@sivantos.com" }],
  sterilization: { is_sterile: "false", is_sterilization_prior_use: "false" },
  publish_date: "2025-08-11",
  public_version_date: "2025-08-19",
  public_version_number: "1",
  record_status: "Published",
  commercial_distribution_status: "In Commercial Distribution",
  commercial_distribution_end_date: null,
  is_rx: "true",
  is_otc: "false",
  is_single_use: "false",
  is_pm_exempt: "true",
  has_serial_number: "true",
  has_lot_or_batch_number: "false",
  mri_safety: "Labeling does not contain MRI Safety Information",
  device_count_in_base_package: "1",
};

const RAW_WITH_510K = {
  brand_name: "audifon",
  version_or_model_number: "via",
  company_name: "audifon GmbH & Co. KG",
  identifiers: [{ id: "04260262930010", type: "Primary", issuing_agency: "GS1" }],
  product_codes: [{ code: "KLW", name: "Masker, Tinnitus" }, { code: "ESD", name: "Hearing Aid, Air-Conduction" }],
  premarket_submissions: [{ submission_number: "k130514", supplement_number: "000" }, { submission_number: "P970029", supplement_number: "012" }],
  is_pm_exempt: "false",
  is_otc: "true",
  publish_date: "2019-02-04",
};

test("normalizes a GUDID record: primary DI, package identifiers, codes, flags and missing premarket", () => {
  const device = normalizeUdi(RAW_HEARING_AID);
  assert.equal(device.key, "f4d17343-7a88-4223-a1b1-c8eab84fdd48");
  assert.equal(device.primaryDi, "05714880240504");
  assert.equal(device.primaryAgency, "GS1");
  assert.equal(device.identifiers.length, 2);
  assert.equal(device.identifiers[1].quantityPerPackage, "3");
  assert.deepEqual(device.codeList, ["OSM", "KLW"], "codes are uppercased");
  assert.equal(device.codes[1].name, "Masker, Tinnitus");
  assert.equal(device.codes[0].regulation, "874.3305");
  assert.deepEqual(device.premarket, []);
  assert.equal(device.pmExempt, true);
  assert.equal(device.rx, true);
  assert.equal(device.otc, false);
  assert.equal(device.serial, true);
  assert.equal(device.lot, false);
  assert.equal(device.sterile, false);
  assert.equal(device.gmdn[0].name, "Air-conduction hearing aid, behind-the-ear");
  assert.equal(device.contacts[0].email, "consumerrelations@sivantos.com");
  assert.equal(device.distributionEnd, "");
  assert.equal(udiPremarketLabel(device), "");
});

test("premarket submissions keep their number and supplement, and the key falls back to the primary DI", () => {
  const device = normalizeUdi(RAW_WITH_510K);
  assert.equal(device.key, "04260262930010");
  assert.deepEqual(device.premarket.map((entry) => entry.number), ["K130514", "P970029"]);
  assert.equal(udiPremarketLabel(device), "K130514; P970029/S012");
  assert.equal(device.pmExempt, false);
  assert.equal(device.otc, true);
  assert.deepEqual(normalizeUdi({}).identifiers, []);
  assert.equal(normalizeUdi({ brand_name: "x", company_name: "y" }).key, "x||y");
});

test("device-level ANY/ALL: a hearing aid filed under OSM + KLW matches ALL, a KLW-only device does not", () => {
  const both = normalizeUdi(RAW_HEARING_AID);
  const klwOnly = normalizeUdi({ ...RAW_WITH_510K, product_codes: [{ code: "KLW" }] });
  assert.equal(udiDeviceHasCodes(both, ["osm", "KLW"], "all"), true);
  assert.equal(udiDeviceHasCodes(klwOnly, ["OSM", "KLW"], "all"), false);
  assert.equal(udiDeviceHasCodes(klwOnly, ["OSM", "KLW"], "any"), true);
  assert.equal(udiDeviceHasCodes(klwOnly, [], "all"), true);
  const summary = udiSummary([both, klwOnly, normalizeUdi(RAW_WITH_510K)], ["OSM", "KLW"]);
  assert.deepEqual(summary, { total: 3, withAll: 1, withPremarket: 2, withAllPremarket: 0, pmExempt: 1, withAllExempt: 1 });
});

test("UDI queries: OR for ANY, AND for ALL, keyword across labeler/brand/model, class filter, location filters ignored", () => {
  assert.equal(udiCodesClause(["OSM"], "all"), 'product_codes.code:"OSM"');
  assert.equal(udiCodesClause(["osm", "KLW"], "any"), 'product_codes.code:("OSM" OR "KLW")');
  assert.equal(udiCodesClause(["OSM", "KLW"], "all"), '(product_codes.code:"OSM" AND product_codes.code:"KLW")');
  const filters = { ...EMPTY_FILTERS, productCodes: ["OSM", "KLW"], codeMatch: "all", keyword: "Sonova", deviceClass: "2", country: "CH", state: "ZH", establishment: "Manufacture Medical Device" };
  assert.equal(
    buildUdiSearch(filters),
    '(company_name:"Sonova" OR brand_name:"Sonova" OR version_or_model_number:"Sonova" OR device_description:"Sonova") AND (product_codes.code:"OSM" AND product_codes.code:"KLW") AND product_codes.openfda.device_class:"2"',
  );
  assert.deepEqual(udiIgnoredFilters(filters), ["country", "state / region", "establishment role"]);
  assert.deepEqual(udiIgnoredFilters(EMPTY_FILTERS), []);
  assert.equal(buildUdiSearch(EMPTY_FILTERS), "");
});

test("company and listing cross-reference queries", () => {
  assert.equal(udiCompanySearch("Sonova AG", ["OSM", "KLW"], "all"), 'company_name:"Sonova AG" AND (product_codes.code:"OSM" AND product_codes.code:"KLW")');
  assert.equal(udiCompanySearch("Sonova AG", ["OSM", "KLW"], "all", UDI_PREMARKET_EXISTS), 'company_name:"Sonova AG" AND (product_codes.code:"OSM" AND product_codes.code:"KLW") AND _exists_:premarket_submissions.submission_number');
  assert.equal(udiCompanySearch("Sonova AG", [], "any", UDI_PM_EXEMPT), 'company_name:"Sonova AG" AND is_pm_exempt:true');

  const listing = {
    registration: { owner_operator: { firm_name: "GN Hearing A/S" }, name: "GN Hearing plant" },
    products: [{ product_code: "OSM" }, { product_code: "QUH" }],
  };
  assert.deepEqual(listingCodesForUdi(listing, { ...EMPTY_FILTERS, productCodes: ["QUH"] }), ["QUH"], "matching products win");
  assert.deepEqual(listingCodesForUdi(listing, EMPTY_FILTERS), ["OSM", "QUH"], "otherwise every code on the listing");
  assert.equal(udiListingSearch(listing, { ...EMPTY_FILTERS, productCodes: ["QUH"] }), 'company_name:"GN Hearing A/S" AND product_codes.code:"QUH"');

  const device = normalizeUdi(RAW_HEARING_AID);
  assert.equal(listingSearchForDevice(device), 'registration.owner_operator.firm_name:"Ws Audiology Usa, Inc." AND products.product_code:("OSM" OR "KLW")');
  assert.equal(listingSearchForDevice(device, ["KLW"]), 'registration.owner_operator.firm_name:"Ws Audiology Usa, Inc." AND products.product_code:"KLW"');
});

test("sorting, AccessGUDID links and the udi view in URL state", () => {
  assert.equal(udiSortParam("newest"), "publish_date:desc");
  assert.equal(udiSortParam("oldest"), "publish_date:asc");
  assert.equal(udiSortParam("expiry"), "", "expiry is a registration concept");
  assert.equal(accessGudidUrl("05714880240504"), "https://accessgudid.nlm.nih.gov/devices/05714880240504");
  assert.equal(accessGudidUrl(""), "");

  const params = filtersToParams({ ...EMPTY_FILTERS, productCodes: ["OSM", "KLW"], codeMatch: "all" }, "udi");
  assert.equal(params.get("view"), "udi");
  const restored = filtersFromParams(params);
  assert.equal(restored.view, "udi");
  assert.equal(restored.filters.codeMatch, "all");
  assert.equal(filtersFromParams(new URLSearchParams("view=bogus")).view, "records");
  assert.equal(describeFilters({ ...EMPTY_FILTERS, productCodes: ["OSM", "KLW"], codeMatch: "all" }, "udi"), "OSM + KLW · All codes · Devices (UDI)");
});

test("labeler groups map registration owners to every GUDID labeler in the group", () => {
  assert.equal(labelerGroupFor("DEMANT A/S")?.group, "Demant");
  assert.equal(labelerGroupFor("demant a/s")?.group, "Demant", "case-insensitive");
  assert.equal(labelerGroupFor("Oticon A/S")?.group, "Demant", "labeler names resolve too");
  assert.equal(labelerGroupFor("Magnatone Hearing Aid Corp. dba Persona Medical")?.group, "Persona Medical");
  assert.equal(labelerGroupFor("Starkey Laboratories, Inc."), null, "no group needed when the names already match");
  assert.equal(labelerGroupFor("GN"), null, "short fragments never match a group");
  assert.deepEqual(labelersFor(["DEMANT A/S"]), ["DEMANT A/S", "Oticon A/S", "Sbo Hearing A/S", "Bernafon AG", "Sonic Innovations, Inc."]);
  assert.deepEqual(labelersFor(["Sonova AG", "Sonova Operations Center Vietnam Company Ltd"], ["Custom Labeler Ltd"]).slice(0, 3), ["Sonova AG", "Sonova Operations Center Vietnam Company Ltd", "Phonak AG"]);
  assert.ok(labelersFor(["Sonova AG"], ["Custom Labeler Ltd", " custom labeler ltd "]).filter((name) => /custom/i.test(name)).length === 1, "aliases de-duplicate");
  assert.ok(UDI_LABELER_GROUPS.every((group) => group.labelers.length && group.owners.length && group.note));
  assert.equal(normalizeLabeler("  WS Audiology USA, Inc. "), "ws audiology usa inc");
});

test("multi-labeler searches use one OR clause, and user aliases parse defensively", () => {
  assert.equal(udiCompanySearch(["Oticon A/S", "Sbo Hearing A/S"], ["OSM"], "any"), 'company_name:("Oticon A/S" OR "Sbo Hearing A/S") AND product_codes.code:"OSM"');
  assert.equal(udiCompanySearch(["Oticon A/S"], [], "any"), 'company_name:"Oticon A/S"');
  assert.deepEqual(parseUdiAliases(null), {});
  assert.deepEqual(parseUdiAliases("[1,2]"), {});
  assert.deepEqual(parseUdiAliases(JSON.stringify({ "demant a s": ["Oticon Medical AB", "", "Oticon Medical AB", 3] })), { "demant a s": ["Oticon Medical AB"] });
});

test("the premarket gap report puts devices with every code and no submission first", () => {
  const both = normalizeUdi(RAW_HEARING_AID);
  const withSubmission = normalizeUdi({ ...RAW_WITH_510K, product_codes: [{ code: "OSM" }, { code: "KLW" }], brand_name: "Alpha" });
  const klwOnly = normalizeUdi({ ...RAW_WITH_510K, product_codes: [{ code: "KLW" }], brand_name: "Zeta" });
  const rows = premarketGapRows([withSubmission, klwOnly, both], ["OSM", "KLW"]);
  assert.deepEqual(rows.map((row) => [row.brand, row.carriesAll, row.premarket]), [
    ["Signia", "Yes", "None listed"],
    ["Alpha", "Yes", "K130514; P970029/S012"],
    ["Zeta", "No", "K130514; P970029/S012"],
  ]);
  assert.equal(rows[0].pmExempt, "Yes");
  assert.equal(rows[0].primaryDi, "05714880240504");
  assert.equal(rows[0].codes, "OSM; KLW");
  assert.ok(PREMARKET_GAP_COLUMNS.every((column) => column.key in rows[0]), "every column maps to a row field");
  assert.deepEqual(premarketGapRows([klwOnly], []).map((row) => row.carriesAll), ["Yes"], "no selection means nothing is missing");
});
