import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRawFccRecords,
  fccRecordsInWindow,
  isoFccDate,
  normalizeFccRecord,
  normalizeFccScope,
  parseFccScopes,
  uniqueFccRecords,
} from "../app/fcc-core.ts";

test("normalizes complete and partial FCC-ID search values", () => {
  assert.equal(normalizeFccScope(" 2aa22-demo  "), "2AA22-DEMO");
  assert.deepEqual(parseFccScopes("OPS, 2aa22-demo; OPS"), ["OPS", "2AA22-DEMO"]);
  assert.deepEqual(parseFccScopes("AB"), []);
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
    address: undefined,
    city: "Columbia",
    state: "MD",
    country: "United States",
    zipCode: undefined,
    sourceUrl: "https://www.fcc.gov/oet/ea/fccid",
    retrievedAt,
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
