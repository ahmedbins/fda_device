import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRawFccRecords,
  categorizeFccPurpose,
  cleanFccDisplayValue,
  fccIdParts,
  fccLocation,
  fccSourcePresentation,
  groupFccRecordsByGrantee,
  fccRecordsInWindow,
  isoFccDate,
  normalizeFccRecord,
  normalizeFccScope,
  parseFccPayload,
  parseFccScopes,
  uniqueFccRecords,
} from "../app/fcc-core.ts";

test("normalizes complete and partial FCC-ID search values", () => {
  assert.equal(normalizeFccScope(" 2aa22-demo  "), "2AA22-DEMO");
  assert.deepEqual(parseFccScopes("OPS, 2aa22-demo; OPS"), ["OPS", "2AA22-DEMO"]);
  assert.deepEqual(parseFccScopes("AB"), []);
});

test("parses the FCC XML response returned by the public endpoint", () => {
  const payload = parseFccPayload(`<?xml version="1.0" encoding="UTF-8"?>
    <fccIDInfoes><fccidInfo>
      <address>7435 Oakland Mills Road N/A</address>
      <applicationPurpose>Original Equipment</applicationPurpose>
      <city>Columbia</city><country>United States</country><FCCId>OPS10</FCCId>
      <grantDate>08/01/2017</grantDate>
      <grantee>FCC Laboratory Test Grantee Company JS 20260709</grantee>
      <state>MD</state><zipCode>21046</zipCode>
    </fccidInfo></fccIDInfoes>`, "application/xml");
  const rows = extractRawFccRecords(payload);
  assert.equal(rows.length, 1);
  const record = normalizeFccRecord(rows[0], "2026-08-11T00:00:00.000Z");
  assert.equal(record?.fccId, "OPS10");
  assert.equal(record?.authorizationDate, "2017-08-01");
  assert.equal(record?.granteeName, "FCC Laboratory Test Grantee Company JS 20260709");
  assert.equal(record?.address, "7435 Oakland Mills Road");
  assert.equal(record?.raw.address, "7435 Oakland Mills Road N/A");
  assert.equal(record?.zipCode, "21046");
});

test("normalizes only FCC fields actually returned by getFCCIDList", () => {
  const retrievedAt = "2026-08-11T19:30:00.000Z";
  const record = normalizeFccRecord({
    fccid: "OPS10",
    grantee: "FCC Laboratory Test Grantee Company",
    grantDate: "08/01/2017",
    applicationPurpose: "Original Equipment",
    city: "Columbia",
    state: "MD",
    country: "United States",
  }, retrievedAt);
  assert.deepEqual(record, {
    source: "FCC",
    fccId: "OPS10",
    granteeName: "FCC Laboratory Test Grantee Company",
    authorizationDate: "2017-08-01",
    applicationPurpose: "Original Equipment",
    purposeCategory: "Original authorization",
    address: undefined,
    city: "Columbia",
    state: "MD",
    country: "United States",
    zipCode: undefined,
    sourceUrl: "https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId=OPS10",
    retrievedAt,
    sourceMode: undefined,
    snapshotCapturedAt: undefined,
    raw: {
      fccid: "OPS10",
      grantee: "FCC Laboratory Test Grantee Company",
      grantDate: "08/01/2017",
      applicationPurpose: "Original Equipment",
      city: "Columbia",
      state: "MD",
      country: "United States",
    },
  });
  assert.equal("equipmentDescription" in record, false);
  assert.equal("granteeCode" in record, false);
});

test("handles missing optional FCC fields and response wrappers", () => {
  assert.equal(isoFccDate(undefined), undefined);
  const rows = extractRawFccRecords({ fCCIDInfoes: { fccidInfo: [{ FCCId: "OPS10" }] } });
  assert.equal(rows.length, 1);
  const record = normalizeFccRecord(rows[0], "2026-08-11T00:00:00.000Z");
  assert.equal(record?.fccId, "OPS10");
  assert.equal(record?.granteeName, undefined);
});

test("deduplicates overlapping prefix results and filters monitoring windows", () => {
  const base = { source: "FCC", granteeName: "Example", applicationPurpose: "Original Equipment", sourceUrl: "https://www.fcc.gov/oet/ea/fccid", retrievedAt: "2026-08-11T00:00:00.000Z", raw: {} };
  const records = [
    { ...base, fccId: "OPS10", authorizationDate: "2026-08-01" },
    { ...base, fccId: "OPS10", authorizationDate: "2026-08-01" },
    { ...base, fccId: "OPS11", authorizationDate: "2025-01-01" },
  ];
  const unique = uniqueFccRecords(records);
  assert.equal(unique.length, 2);
  assert.deepEqual(fccRecordsInWindow(unique, "2026-05-01").map((row) => row.fccId), ["OPS10"]);
});

test("derives identity only from confirmed grantee scopes and preserves purpose wording", () => {
  assert.deepEqual(fccIdParts("2A3ULM5AEBT", ["KWC", "2A3UL"]), { granteeCode: "2A3UL", fccProductCode: "M5AEBT" });
  assert.deepEqual(fccIdParts("UNKNOWN", ["KWC", "2A3UL"]), {});
  assert.equal(categorizeFccPurpose("Class II Permissive Change"), "Class II permissive change");
  assert.equal(categorizeFccPurpose("Change in Identification"), "Change in FCC ID");
  assert.equal(categorizeFccPurpose("Original Equipment"), "Original authorization");
});

test("omits FCC placeholder N/A values from displayed location fields", () => {
  assert.equal(cleanFccDisplayValue("N/A"), undefined);
  assert.equal(cleanFccDisplayValue("444 Commerce St. N/A"), "444 Commerce St.");
  const record = normalizeFccRecord({
    FCCId: "2A3ULM5AEBT",
    city: "Hannover",
    state: "N/A",
    country: "Germany",
    zipCode: "N/A",
    address: "444 Commerce St. N/A",
  }, "2026-08-17T00:00:00.000Z");
  assert.equal(record?.state, undefined);
  assert.equal(record?.zipCode, undefined);
  assert.equal(record?.address, "444 Commerce St.");
  assert.equal(fccLocation(record), "Hannover, Germany");
});

test("labels limited FCC coverage instead of an official snapshot", () => {
  assert.equal(fccSourcePresentation("limited", true).status, "FCC COVERAGE LIMITED");
  assert.equal(fccSourcePresentation("official_snapshot", true).status, "FCC OFFICIAL SNAPSHOT");
  assert.equal(fccSourcePresentation("live", true).status, "FCC API CONNECTED");
  assert.equal(fccSourcePresentation(undefined, false).status, "FCC SOURCE READY");
});

test("groups records by confirmed grantee identity", () => {
  const base = { source: "FCC", sourceUrl: "https://apps.fcc.gov", retrievedAt: "2026-08-11T00:00:00.000Z", raw: {} };
  const groups = groupFccRecordsByGrantee([
    { ...base, fccId: "KWC-A", granteeCode: "KWC", granteeName: "Sonova USA Inc.", authorizationDate: "2024-01-01" },
    { ...base, fccId: "KWC-B", granteeCode: "KWC", granteeName: "Sonova USA Inc.", authorizationDate: "2025-01-01" },
    { ...base, fccId: "2A3UL-X", granteeCode: "2A3UL", granteeName: "Sonova Consumer Hearing GmbH", authorizationDate: "2026-04-01" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].granteeCode, "2A3UL");
  assert.equal(groups[1].fccIds, 2);
});
