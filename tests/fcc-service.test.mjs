import assert from "node:assert/strict";
import test from "node:test";
import { extractRawFccRecords, normalizeFccRecord, parseFccPayload, uniqueFccRecords } from "../app/fcc-core.ts";
import { FCC_OFFICIAL_SNAPSHOT } from "../app/fcc-official-snapshot.ts";

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
