import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL(`../dist/server/index.js?test=${process.pid}-${Date.now()}`, import.meta.url);

async function render(pathname, init = { headers: { accept: "text/html" } }) {
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders all source and view routes", async () => {
  for (const pathname of ["/fda/explorer", "/fda/monitoring", "/fcc/explorer", "/fcc/monitoring", "/hc/explorer", "/hc/monitoring", "/iecee/explorer", "/iecee/monitoring"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /SONOVA/);
    assert.match(html, />FDA</);
    assert.match(html, />FCC</);
    assert.match(html, />HC</);
    assert.match(html, />IECEE</);
    assert.match(html, />Explorer</i);
    assert.match(html, />Monitoring</i);
  }
});

test("keeps FDA Explorer and Monitoring content intact", async () => {
  const explorer = await (await render("/fda/explorer")).text();
  assert.match(explorer, /Device registrations/);
  assert.match(explorer, /Product codes/);
  assert.match(explorer, /listings match any of them/);
  assert.match(explorer, /Company \+ devices/);
  assert.match(explorer, /Devices \(UDI\)/);

  const monitoring = await (await render("/fda/monitoring")).text();
  assert.match(monitoring, /REGULATORY MONITORING/);
  assert.match(monitoring, /510\(k\) clearances/);
  assert.match(monitoring, /Adverse events/);
});

test("renders FCC Explorer and conservative FCC Monitoring language", async () => {
  const explorer = await (await render("/fcc/explorer")).text();
  assert.match(explorer, /Equipment authorizations/);
  assert.match(explorer, /FCC-ID search/);
  assert.match(explorer, /Authorization records/);
  assert.match(explorer, /official FCC Equipment Authorization service/i);
  assert.match(explorer, /Confirmed watch scope/);
  assert.doesNotMatch(explorer, /Confirmed internal scope/);
  assert.doesNotMatch(explorer, /official snapshot|bundled snapshot/i);

  const monitoring = await (await render("/fcc/monitoring")).text();
  assert.match(monitoring, /Recent FCC authorizations/);
  assert.match(monitoring, /not change detection between refreshes/i);
  assert.doesNotMatch(monitoring, /Modified authorization/);
  assert.doesNotMatch(monitoring, /official snapshot|bundled snapshot/i);
});

test("renders Health Canada MDALL Explorer and Monitoring", async () => {
  const explorer = await (await render("/hc/explorer")).text();
  assert.match(explorer, /Canadian device licences/);
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

test("renders IECEE Explorer and Monitoring with honest source language", async () => {
  const explorer = await (await render("/iecee/explorer")).text();
  assert.match(explorer, /CB certificates/);
  assert.match(explorer, /Certificate search/);
  assert.match(explorer, /Product category/);
  assert.match(explorer, /Certification body \(NCB\)/);
  assert.match(explorer, /Electrical equipment for medical use/);
  assert.match(explorer, /Household and similar equipment/);
  assert.match(explorer, /first 10,000 matches/);
  assert.match(explorer, /certificates\.iecee\.org/);

  const monitoring = await (await render("/iecee/monitoring")).text();
  assert.match(monitoring, /Recently issued certificates/);
  assert.match(monitoring, /Cancelled or suspended/);
  assert.match(monitoring, /not snapshot change detection/i);
});

test("rejects malformed IECEE relay requests without contacting the upstream source", async () => {
  const badFacet = await render("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "sonova", terms: { manufacturer_name: { 1: ["SONOVA AG"] } } }) });
  assert.equal(badFacet.status, 400);
  assert.match(await badFacet.text(), /Unknown facet group manufacturer_name/);

  const tooDeep = await render("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: 9_999, size: 25 }) });
  assert.equal(tooDeep.status, 400);
  assert.match(await tooDeep.text(), /first 10,000 results/);

  const notJson = await render("/api/iecee/search", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(notJson.status, 400);

  const badId = await render("/api/iecee/certificate?id=abc");
  assert.equal(badId.status, 400);
  assert.match(await badId.text(), /numeric IECEE certificate id/);

  const badTrademark = await render("/api/iecee/trademarks?q=%20");
  assert.equal(badTrademark.status, 400);
});

test("server-renders the design-preview hub and FDA Explorer", async () => {
  const hub = await (await render("/next")).text();
  assert.match(hub, /Design preview/);
  assert.match(hub, /One workbench for public regulatory records/);
  assert.match(hub, /Regulatory Data Hub/);

  const explorer = await (await render("/next/fda/explorer")).text();
  assert.match(explorer, /Run search/);
  assert.match(explorer, /Company \+ devices/);
  assert.match(explorer, /Companies with QDD \+ QUH/);
  assert.match(explorer, /Hearing aids/);
});

test("server-renders the FDA workspace preview with its scope bar and views", async () => {
  const workspace = await (await render("/next/fda/workspace")).text();
  assert.match(workspace, /Apply scope/);
  assert.match(workspace, /Any code/);
  assert.match(workspace, /All codes · one company/);
  for (const view of ["Overview", "Companies", "Listings", "Timeline", "Changes"]) assert.match(workspace, new RegExp(view));
  assert.match(workspace, /Define a scope/);
});

test("server-renders the Canada Gazette intelligence preview", async () => {
  const page = await (await render("/next/gazette")).text();
  assert.match(page, /Canada Gazette/);
  assert.match(page, /General Medical Devices/);
  assert.match(page, /Hearing Aids/);
  assert.match(page, /not a legal or regulatory conclusion/i);
});
