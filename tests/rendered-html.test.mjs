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
  assert.match(explorer, /listings match any of them/);
  assert.match(explorer, /Company \+ devices/);

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
