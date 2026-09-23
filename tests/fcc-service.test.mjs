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

test("uses the scheduled FCC capture as the primary source and reports when the data is from", async () => {
  const { clearFccCache, searchFcc } = await import("../app/fcc-service.ts");
  clearFccCache();
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url === "/api/fcc/current") {
      return new Response(JSON.stringify({
        refreshedAt: "2026-09-18T06:00:12.000Z",
        scopes: {
          KWC: { scope: "KWC", capturedAt: "2026-09-18T06:00:10.000Z", source: "official_relay", recordCount: 2, records: [
            { address: "444 Commerce St. N/A", applicationPurpose: "Original Equipment", city: "Aurora", country: "United States", FCCId: "KWC-NEW1", grantDate: "09/17/2026", grantee: "Sonova USA Inc.", state: "IL", zipCode: "60504" },
            { address: "444 Commerce St. N/A", applicationPurpose: "Original Equipment", city: "Aurora", country: "United States", FCCId: "KWC-ERF", grantDate: "06/11/2026", grantee: "Sonova USA Inc.", state: "IL", zipCode: "60504" },
          ] },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("opendata.fcc.gov")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const result = await searchFcc(["KWC"]);
    assert.equal(result.sourceMode, "official_capture");
    assert.equal(result.dataAsOf, "2026-09-18T06:00:10.000Z");
    assert.deepEqual(result.records.map((record) => record.fccId), ["KWC-NEW1", "KWC-ERF"]);
    assert.equal(result.records[0].sourceMode, "official_capture");
    assert.equal(result.records[0].authorizationDate, "2026-09-17");
    assert.equal(result.records[0].snapshotCapturedAt, "2026-09-18T06:00:10.000Z");
    assert.ok(urls.filter((url) => url === "/api/fcc/current").length === 1, "the capture is fetched once and cached");

    const narrowed = await searchFcc(["KWC-ERF"]);
    assert.deepEqual(narrowed.records.map((record) => record.fccId), ["KWC-ERF"], "a full FCC ID narrows the capture to that ID");
    assert.equal(urls.filter((url) => url === "/api/fcc/current").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearFccCache();
  }
});

test("falls back to the bundled FCC copy when the capture relay is unavailable", async () => {
  const { clearFccCache, searchFcc } = await import("../app/fcc-service.ts");
  clearFccCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/fcc/current") return new Response("relay down", { status: 502 });
    if (url.includes("opendata.fcc.gov")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const result = await searchFcc(["2A3UL"]);
    assert.equal(result.sourceMode, "official_snapshot");
    assert.equal(result.dataAsOf, FCC_OFFICIAL_SNAPSHOT.capturedAt);
    assert.ok(result.records.length >= 30);
    assert.equal(result.records[0].sourceMode, "official_snapshot");
  } finally {
    globalThis.fetch = originalFetch;
    clearFccCache();
  }
});

test("a caller that aborts does not poison the shared capture or another caller's search", async () => {
  const { clearFccCache, searchFcc } = await import("../app/fcc-service.ts");
  clearFccCache();
  const originalFetch = globalThis.fetch;
  let captureCalls = 0;
  let releaseCapture;
  const captureGate = new Promise((resolve) => { releaseCapture = resolve; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/fcc/current") {
      captureCalls += 1;
      assert.ok(!init?.signal || !init.signal.aborted);
      await captureGate;
      return new Response(JSON.stringify({
        refreshedAt: "2026-09-18T06:00:12.000Z",
        scopes: { KWC: { scope: "KWC", capturedAt: "2026-09-18T06:00:10.000Z", source: "official_relay", records: [{ FCCId: "KWC-ERF", grantDate: "06/11/2026", grantee: "Sonova USA Inc.", applicationPurpose: "Original Equipment" }] } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("opendata.fcc.gov")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const first = new AbortController();
    const aborted = searchFcc(["KWC"], first.signal);
    const second = searchFcc(["KWC"], new AbortController().signal);
    first.abort();
    await assert.rejects(aborted, (error) => error.name === "AbortError");
    releaseCapture();
    const result = await second;
    assert.equal(result.sourceMode, "official_capture");
    assert.deepEqual(result.records.map((record) => record.fccId), ["KWC-ERF"]);
    assert.equal(captureCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearFccCache();
  }
});
