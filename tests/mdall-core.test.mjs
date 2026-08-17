import assert from "node:assert/strict";
import test from "node:test";
import {
  asMdallList,
  deviceSearchTokens,
  looksLikeMdallNumber,
  mdallRiskClassLabel,
  mdallStatusLabel,
  normalizeMdallCompany,
  normalizeMdallDevice,
  normalizeMdallLicence,
  uniqueMdallLicences,
} from "../app/mdall-core.ts";

test("normalizes Health Canada MDALL licence, company and device payloads", () => {
  const retrievedAt = "2026-08-17T00:00:00.000Z";
  const company = normalizeMdallCompany({
    company_id: 113080,
    company_name: "SONOVA AG",
    addr_line_1: "Laubisrutistrasse 28",
    city: "Stafa",
    country_cd: "CH",
    region_cd: "ZH",
    company_status: "A",
  });
  const licence = normalizeMdallLicence({
    original_licence_no: 113131,
    licence_status: "I",
    appl_risk_class: 2,
    licence_name: "SONITE RISE RECHARGEABLE HEARING AIDS",
    first_licence_status_dt: "2025-04-17",
    last_refresh_dt: "2026-08-14",
    end_date: null,
    licence_type_cd: "F",
    company_id: 113080,
    licence_type_desc: "Device Family",
  }, retrievedAt, company);
  const device = normalizeMdallDevice({
    original_licence_no: 113131,
    device_id: 1088259,
    first_licence_dt: "2026-02-04",
    end_date: null,
    trade_name: "SONITE RISE",
  });

  assert.equal(company?.companyId, 113080);
  assert.equal(licence?.licenceNumber, 113131);
  assert.equal(licence?.riskClassLabel, "Class II");
  assert.equal(licence?.licenceStatusLabel, "Issued / active");
  assert.equal(licence?.companyName, "SONOVA AG");
  assert.equal(licence?.source, "HC");
  assert.equal(device?.tradeName, "SONITE RISE");
  assert.equal(mdallStatusLabel("O"), "Discontinued at renewal");
  assert.equal(mdallRiskClassLabel(4), "Class IV");
});

test("ignores empty MDALL objects and keeps unique licences", () => {
  assert.deepEqual(asMdallList({ original_licence_no: 0, licence_name: null }), []);
  const retrievedAt = "2026-08-17T00:00:00.000Z";
  const first = normalizeMdallLicence({
    original_licence_no: 1423,
    licence_status: "I",
    appl_risk_class: 2,
    licence_name: "BEHIND THE EAR HEARING AID",
    first_licence_status_dt: "1999-02-19",
    last_refresh_dt: "2026-08-14",
    end_date: null,
    licence_type_desc: "Device Family",
    company_id: 113080,
  }, retrievedAt);
  const duplicate = normalizeMdallLicence({
    original_licence_no: 1423,
    licence_status: "I",
    appl_risk_class: 2,
    licence_name: "BEHIND THE EAR HEARING AID",
    first_licence_status_dt: "1999-02-19",
    last_refresh_dt: "2026-08-14",
    end_date: null,
    licence_type_desc: "Device Family",
    company_id: 113080,
  }, retrievedAt);
  assert.equal(uniqueMdallLicences([first, duplicate].filter(Boolean)).length, 1);
});

test("treats numeric MDALL queries as licence or company identifiers", () => {
  assert.equal(looksLikeMdallNumber("113080"), true);
  assert.equal(looksLikeMdallNumber("SONOVA"), false);
  assert.deepEqual(deviceSearchTokens("PHONAK TARGET FITTING SOFTWARE"), ["PHONAK", "TARGET", "FITTING", "SOFTWARE"]);
  assert.ok(!deviceSearchTokens("CHARGER SYSTEMS").includes("SYSTEMS"));
});
