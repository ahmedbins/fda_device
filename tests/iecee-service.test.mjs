import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_IECEE_FILTERS } from "../app/iecee-core.ts";
import { clearIeceeCache, fetchIeceeCertificate, fetchIeceeCertificatesAll, fetchIeceeTrademarks, searchIecee } from "../app/iecee-service.ts";

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ "x-iecee-fetched-at": "2026-09-23T12:00:00.000Z" }), json: async () => payload, text: async () => JSON.stringify(payload) };
}

function source(id, overrides = {}) {
  return { id, ref_number: `NL-${id}`, subject: "Charger", manufacturer_name: "SONOVA AG", org_name: "DEKRA Certification B.V.", type: { level_1: "IECEE-CERTIFICATE-CBTEST" }, status: { level_1: "VALID" }, scope_categories: ["MED"], scopes: [], issue_date: "2026-09-16T00:00:00Z", last_update_date: "2026-09-16T10:01:54Z", ...overrides };
}

function searchPayload(ids, total = ids.length) {
  const block = { hits: { total: { value: total, relation: "eq" }, hits: ids.map((id) => ({ _id: String(id), _source: source(id) })) }, aggregations: {} };
  return { primary: block, secondary: block };
}

test("posts the official search body to the same-origin relay and caches identical searches", async () => {
  clearIeceeCache();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return jsonResponse(searchPayload([1, 2], 101));
  };
  try {
    const result = await searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: "sonova", statuses: ["VALID"] }, from: 25, size: 25, sort: "issued-asc" });
    assert.equal(result.total, 101);
    assert.equal(result.from, 25);
    assert.deepEqual(result.certificates.map((certificate) => certificate.refNumber), ["NL-1", "NL-2"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/iecee/search");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init.body), { from: 25, size: 25, query: "sonova", sortBy: [{ issue_date: "asc" }], dateRanges: {}, conjunctiveFacetGroups: [], terms: { status: { 1: ["VALID"] } } });
    await searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: "sonova", statuses: ["VALID"] }, from: 25, size: 25, sort: "issued-asc" });
    assert.equal(calls.length, 1, "the second identical search is served from the cache");
    await assert.rejects(searchIecee({ filters: EMPTY_IECEE_FILTERS, from: 9_990, size: 25 }), /first 10,000 results/);
  } finally {
    globalThis.fetch = originalFetch;
    clearIeceeCache();
  }
});

test("a search joining a cancelled identical search still gets its results", async () => {
  clearIeceeCache();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse(searchPayload([7], 1));
  };
  try {
    const first = new AbortController();
    const cancelled = searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: "phonak" }, signal: first.signal });
    first.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    const joined = await searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: "phonak" }, signal: new AbortController().signal });
    assert.deepEqual(joined.certificates.map((certificate) => certificate.refNumber), ["NL-7"]);
    assert.equal(joined.retrievedAt, "2026-09-23T12:00:00.000Z", "the pulled time comes from the relay");
    assert.equal(calls, 1, "the cancelled caller did not cancel the shared request");
  } finally {
    globalThis.fetch = originalFetch;
    clearIeceeCache();
  }
});

test("surfaces relay error messages instead of generic failures", async () => {
  clearIeceeCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ error: "The IECEE certificate search answered HTTP 503." }, 502);
  try {
    await assert.rejects(searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: "x" } }), /answered HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
    clearIeceeCache();
  }
});

test("pages through a search for exports and stops at the cap", async () => {
  clearIeceeCache();
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const ids = Array.from({ length: Math.min(body.size, 2_500 - body.from) }, (_, index) => body.from + index + 1);
    return jsonResponse(searchPayload(ids, 2_500));
  };
  try {
    const progress = [];
    const all = await fetchIeceeCertificatesAll({ filters: { ...EMPTY_IECEE_FILTERS, query: "sonova" }, sort: "issued-desc", cap: 2_000, onProgress: (loaded, expected) => progress.push([loaded, expected]) });
    assert.equal(all.certificates.length, 2_000);
    assert.equal(all.total, 2_500);
    assert.equal(all.capped, true);
    assert.deepEqual(bodies.map((body) => [body.from, body.size]), [[0, 1000], [1000, 1000]]);
    assert.deepEqual(progress, [[1000, 2000], [2000, 2000]]);
  } finally {
    globalThis.fetch = originalFetch;
    clearIeceeCache();
  }
});

test("loads certificate details and trademark suggestions through the relay", async () => {
  clearIeceeCache();
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("/api/iecee/certificate?id=404")) return jsonResponse({ error: "no record" }, 404);
    if (url.startsWith("/api/iecee/certificate")) return jsonResponse({ id: 2217983, ref_number: "NL-129540", model: "Phonak ChargerGo RIC E", status: { code: "VALID", name: "Valid" }, template: { code: "IECEE-CERTIFICATE-CBTEST", name: "CB Test Certificate" }, org: { name: "DEKRA" } });
    if (url.startsWith("/api/iecee/trademarks")) return jsonResponse({ aggregations: { main: { buckets: [{ key: "phonak", doc_count: 54, details: { top: [{ metrics: { "trademark.raw": "PHONAK" } }] } }] } } });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const detail = await fetchIeceeCertificate(2217983);
    assert.equal(detail.model, "Phonak ChargerGo RIC E");
    assert.equal(detail.ncb.name, "DEKRA");
    await fetchIeceeCertificate(2217983);
    assert.equal(urls.filter((url) => url.includes("certificate?id=2217983")).length, 1, "details are cached");
    await assert.rejects(fetchIeceeCertificate(404), /no public record/);
    const trademarks = await fetchIeceeTrademarks("  Phonak ");
    assert.deepEqual(trademarks, [{ key: "phonak", label: "PHONAK", count: 54 }]);
    assert.equal(urls.at(-1), "/api/iecee/trademarks?q=phonak");
    assert.deepEqual(await fetchIeceeTrademarks("p"), [], "very short fragments are not looked up");
  } finally {
    globalThis.fetch = originalFetch;
    clearIeceeCache();
  }
});
