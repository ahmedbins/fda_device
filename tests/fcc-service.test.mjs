import assert from "node:assert/strict";
import test from "node:test";
import { extractRawFccRecords, formatFccRfBands, normalizeFccRecord, parseFccPayload, uniqueFccRecords } from "../app/fcc-core.ts";
import { FCC_OFFICIAL_SNAPSHOT } from "../app/fcc-official-snapshot.ts";
import { FCC_OFFICIAL_GRANTS } from "../app/fcc-official-grants.ts";

test("serves confirmed Sonova scopes from the official FCC snapshot", async () => {
  assert.deepEqual(FCC_OFFICIAL_SNAPSHOT.scopes.map((scope) => scope.scope), ["KWC", "2A3UL"]);
  assert.ok(FCC_OFFICIAL_SNAPSHOT.records.length >= 170);
  const records = FCC_OFFICIAL_SNAPSHOT.records.map((raw) => normalizeFccRecord(raw, FCC_OFFICIAL_SNAPSHOT.capturedAt, {
    confirmedCodes: ["KWC", "2A3UL"],
    sourceMode: "official_snapshot",
    snapshotCapturedAt: FCC_OFFICIAL_SNAPSHOT.capturedAt,
  }));
  assert.ok(records.some((record) => record?.fccId === "2A3ULM5AEBT" && record.authorizationDate === "2026-04-07"));
  assert.ok(records.some((record) => record?.granteeCode === "KWC" && record.granteeName?.includes("Sonova")));
});

test("attaches official EAS grant description, class and RF to covered FCC IDs", () => {
  const erf = FCC_OFFICIAL_GRANTS["KWC-ERF"];
  const m5 = FCC_OFFICIAL_GRANTS["2A3ULM5AEBT"];
  assert.ok(erf.descriptions.includes("Wireless hearing aid"));
  assert.ok(erf.equipmentClasses.includes("Part 15 Spread Spectrum Transmitter"));
  assert.match(formatFccRfBands(erf.bands), /2402\.0–2480\.0 MHz/);
  assert.equal(m5.equipmentClasses.length, 0);
  assert.deepEqual(m5.bands[0], { lowMhz: "2402.0", highMhz: "2480.0" });
});

test("imports an official FCC XML response for an uncovered scope", () => {
  const parsed = parseFccPayload(`<?xml version="1.0"?>
    <fccIDInfoes><fccidInfo><FCCId>ABC123</FCCId><grantDate>08/11/2026</grantDate>
    <grantee>Example Grantee</grantee><applicationPurpose>Original Equipment</applicationPurpose></fccidInfo></fccIDInfoes>`);
  const records = uniqueFccRecords(extractRawFccRecords(parsed).map((raw) => normalizeFccRecord(raw, "2026-08-11T00:00:00.000Z", { confirmedCodes: ["ABC"], sourceMode: "official_import" })).filter(Boolean));
  assert.equal(records.length, 1);
  assert.equal(records[0].fccId, "ABC123");
  assert.equal(records[0].granteeCode, "ABC");
  assert.equal(records[0].sourceMode, "official_import");
  assert.equal(records[0].applicationPurpose, "Original Equipment");
});
