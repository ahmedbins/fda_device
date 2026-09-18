import assert from "node:assert/strict";
import test from "node:test";

/**
 * Smoke tests for the Cloudflare Pages worker (public/_worker.js), the code that actually serves
 * Main and Internal. These exercise the request paths that never reach an upstream service.
 */
const { default: worker } = await import(new URL("../public/_worker.js", import.meta.url).href);

function call(pathname, init = {}, ctx = { waitUntil() {} }) {
  const assets = { fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`, { status: 200 }) };
  return worker.fetch(new Request(`https://example.test${pathname}`, init), { ASSETS: assets }, ctx);
}

test("static routes fall through to the Pages asset store", async () => {
  const response = await call("/iecee/explorer");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/iecee/explorer");
});

test("IECEE relay validates before contacting IECEE, with or without an execution context", async () => {
  for (const ctx of [{ waitUntil() {} }, undefined]) {
    const badFacet = await call("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "sonova", terms: { manufacturer_name: { 1: ["SONOVA AG"] } } }) }, ctx);
    assert.equal(badFacet.status, 400);
    assert.match((await badFacet.json()).error, /Unknown facet group manufacturer_name/);

    const tooDeep = await call("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: 9_999, size: 25 }) }, ctx);
    assert.equal(tooDeep.status, 400);
    assert.match((await tooDeep.json()).error, /first 10,000 results/);

    const notJson = await call("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }, ctx);
    assert.equal(notJson.status, 400);

    const wrongMethod = await call("/api/iecee/search", {}, ctx);
    assert.equal(wrongMethod.status, 405);

    const badId = await call("/api/iecee/certificate?id=abc", {}, ctx);
    assert.equal(badId.status, 400);
    assert.match((await badId.json()).error, /numeric IECEE certificate id/);

    const badTrademark = await call("/api/iecee/trademarks?q=%20", {}, ctx);
    assert.equal(badTrademark.status, 400);
  }
});

test("FCC relay rejects scopes that are too short without contacting the FCC", async () => {
  const response = await call("/api/fcc/search?fccId=AB");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /at least three/);
});

test("relays the latest scheduled FCC capture and reports when it is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/snapshot")) return new Response(JSON.stringify({ refreshedAt: "2026-09-18T06:00:12.000Z", scopes: {} }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const response = await call("/api/fcc/current");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=600");
    assert.equal((await response.json()).refreshedAt, "2026-09-18T06:00:12.000Z");
    globalThis.fetch = async () => new Response("no", { status: 503 });
    const down = await call("/api/fcc/current");
    assert.equal(down.status, 502);
    assert.match((await down.json()).error, /answered HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
