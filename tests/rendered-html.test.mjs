import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL(`../dist/server/index.js?test=${process.pid}-${Date.now()}`, import.meta.url);

async function render(pathname) {
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders all source and view routes", async () => {
  for (const pathname of ["/fda/explorer", "/fda/monitoring", "/fcc/explorer", "/fcc/monitoring", "/hc/explorer", "/hc/monitoring"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /SONOVA/);
    assert.match(html, />FDA</);
    assert.match(html, />FCC</);
    assert.match(html, />HC</);
    assert.match(html, />Explorer</i);
    assert.match(html, />Monitoring</i);
  }
});

test("keeps FDA Explorer and Monitoring content intact", async () => {
  const explorer = await (await render("/fda/explorer")).text();
  assert.match(explorer, /FDA DEVICE DATA/);
  assert.match(explorer, /Device registrations/);
  assert.match(explorer, /Product codes/);

  const monitoring = await (await render("/fda/monitoring")).text();
  assert.match(monitoring, /REGULATORY MONITORING/);
  assert.match(monitoring, /510\(k\) clearances/);
  assert.match(monitoring, /Adverse events/);
});

test("renders FCC Explorer and conservative FCC Monitoring language", async () => {
  const explorer = await (await render("/fcc/explorer")).text();
  assert.match(explorer, /FCC EQUIPMENT DATA/);
  assert.match(explorer, /FCC-ID search/);
  assert.match(explorer, /Authorization records/);
  assert.match(explorer, /official FCC Equipment Authorization service/i);
  assert.match(explorer, /Confirmed watch scope/);
  assert.doesNotMatch(explorer, /Confirmed internal scope/);

  const monitoring = await (await render("/fcc/monitoring")).text();
  assert.match(monitoring, /Recent FCC authorizations/);
  assert.match(monitoring, /not snapshot change detection/i);
  assert.doesNotMatch(monitoring, /Modified authorization/);
});

test("renders Health Canada MDALL Explorer and Monitoring", async () => {
  const explorer = await (await render("/hc/explorer")).text();
  assert.match(explorer, /HEALTH CANADA \/ MDALL/);
  assert.match(explorer, /MDALL search/);
  assert.match(explorer, /official MDALL/i);
  assert.match(explorer, /Class II, III and IV/i);

  const monitoring = await (await render("/hc/monitoring")).text();
  assert.match(monitoring, /HEALTH CANADA MDALL|Recent MDALL licences/i);
  assert.match(monitoring, /not snapshot change detection/i);
});

test("rejects invalid FCC API scope without contacting the upstream source", async () => {
  const response = await render("/api/fcc/search?fccId=AB");
  assert.equal(response.status, 400);
  assert.match(await response.text(), /at least three/i);
});
