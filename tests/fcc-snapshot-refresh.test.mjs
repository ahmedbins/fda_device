import assert from "node:assert/strict";
import test from "node:test";
import {
  appendHistory,
  captureScope,
  diffCaptures,
  parseOfficialBody,
  parseScopes,
  summarizeScope,
  unwrapReaderBody,
} from "../cron/fcc-snapshot/src/refresh-core.ts";

const READER_XML = '<fccidinfoes><head></head><body></body><fccidinfo><address>Im Heidkampe 9, 30659 Hannover</address><applicationpurpose>Original Equipment</applicationpurpose><city>Hannover</city><country>Germany</country><fccid>2A3ULACAEBT</fccid><grantdate>06/15/2023</grantdate><grantee>Sonova Consumer Hearing GmbH</grantee><state>N/A</state><zipcode>N/A</zipcode></fccidinfo><fccidinfo><address>Im Heidkampe 9, 30659 Hannover</address><applicationpurpose>Original Equipment</applicationpurpose><city>Hannover</city><country>Germany</country><fccid>2A3ULM5AEBT</fccid><grantdate>04/07/2026</grantdate><grantee>Sonova Consumer Hearing GmbH</grantee><state>N/A</state><zipcode>N/A</zipcode></fccidinfo></fccidinfoes>';

function response(status, body, headers = {}) {
  return new Response(body, { status, headers });
}

test("parses the reader's lower-cased copy of the FCC XML into the official record shape", () => {
  const records = parseOfficialBody(READER_XML);
  assert.equal(records.length, 2);
  assert.deepEqual(records[1], { address: "Im Heidkampe 9, 30659 Hannover", applicationPurpose: "Original Equipment", city: "Hannover", country: "Germany", FCCId: "2A3ULM5AEBT", grantDate: "04/07/2026", grantee: "Sonova Consumer Hearing GmbH", state: "N/A", zipCode: "N/A" });
  assert.equal(unwrapReaderBody(JSON.stringify({ data: { html: READER_XML } })), READER_XML);
  assert.equal(unwrapReaderBody(READER_XML), READER_XML);
  assert.deepEqual(parseScopes(" kwc, 2a3ul ,x"), ["KWC", "2A3UL"]);
  assert.deepEqual(parseScopes(undefined), ["KWC", "2A3UL"]);
});

test("falls back from the blocked official endpoint to the reader relay and labels the source", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.startsWith("https://apps.fcc.gov/")) return response(403, "<html>Access Denied</html>", { "content-type": "text/html" });
    if (url.startsWith("https://r.jina.ai/https://apps.fcc.gov/")) return response(200, READER_XML, { "content-type": "text/plain" });
    throw new Error(`unexpected ${url}`);
  };
  const capture = await captureScope("2A3UL", fetcher, () => new Date("2026-09-18T06:00:00Z"));
  assert.equal(capture.source, "official_relay");
  assert.equal(capture.recordCount, 2);
  assert.equal(capture.capturedAt, "2026-09-18T06:00:00.000Z");
  assert.deepEqual(capture.attempts, ["official: HTTP 403", "official via reader relay: 2 records"]);
  assert.equal(calls.length, 2);
});

test("uses the official endpoint directly when it answers, and the public index only as a last resort", async () => {
  const direct = await captureScope("KWC", async (url) => (url.startsWith("https://apps.fcc.gov/") ? response(200, READER_XML, { "content-type": "application/xml" }) : response(500, "")));
  assert.equal(direct.source, "official");
  assert.equal(direct.attempts.at(-1), "official: 2 records");

  const markdown = "Title: Sonova USA Inc. FCC ID Applications\n\n| FCC ID | Date | Description |\n| --- | --- | --- |\n| **[KWC-ERF](https://fccid.io/KWC-ERF)** 2026-06-11 | Hearing aid | Original Equipment |\n| **[KWC-BIO](https://fccid.io/KWC-BIO)** 2019-11-27 | Hearing aid | Original Equipment |\n\n";
  const fallback = await captureScope("KWC", async (url) => {
    if (url.startsWith("https://apps.fcc.gov/")) return response(403, "Access Denied");
    if (url.startsWith("https://r.jina.ai/https://apps.fcc.gov/")) return response(200, "<html>Access Denied</html>");
    if (url.startsWith("https://r.jina.ai/https://fccid.io/")) return response(200, markdown);
    throw new Error(`unexpected ${url}`);
  });
  assert.equal(fallback.source, "public_index");
  assert.ok(fallback.recordCount >= 1);
  assert.equal(fallback.attempts[1], "official via reader relay: FCC refused the relay");

  const failed = await captureScope("KWC", async () => response(503, "down"));
  assert.equal(failed.error, "No source answered with records.");
  assert.equal(failed.attempts.length, 4, "direct, two relay tries, public index");
});

test("summarises what changed between captures and keeps a bounded history", () => {
  const previous = { scope: "2A3UL", capturedAt: "2026-09-17T00:00:00Z", source: "official_relay", sourceUrl: "", recordCount: 1, attempts: [], records: [{ FCCId: "2A3ULACAEBT", grantDate: "06/15/2023", applicationPurpose: "Original Equipment" }] };
  const next = { ...previous, capturedAt: "2026-09-18T00:00:00Z", recordCount: 2, records: parseOfficialBody(READER_XML) };
  assert.deepEqual(diffCaptures(previous, next), { added: ["2A3ULM5AEBT"], removed: [] });
  assert.deepEqual(diffCaptures(null, next).added, ["2A3ULACAEBT", "2A3ULM5AEBT"]);
  const summary = summarizeScope(previous, next);
  assert.deepEqual(summary, { scope: "2A3UL", capturedAt: "2026-09-18T00:00:00Z", source: "official_relay", recordCount: 2, added: ["2A3ULM5AEBT"], removed: [] });
  const failure = summarizeScope(previous, { scope: "2A3UL", capturedAt: "2026-09-19T00:00:00Z", error: "No source answered with records.", attempts: [] });
  assert.equal(failure.error, "No source answered with records.");
  assert.equal(failure.recordCount, 1, "a failed run keeps the previous count");
  const history = Array.from({ length: 35 }, (_, index) => ({ refreshedAt: `2026-08-${String(index + 1).padStart(2, "0")}`, trigger: "cron", scopes: {} })).reduce((current, entry) => appendHistory(current, entry), []);
  assert.equal(history.length, 30);
  assert.equal(history[0].refreshedAt, "2026-08-35");
});
