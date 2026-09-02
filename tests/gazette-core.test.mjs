import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSectionBodies,
  htmlToText,
  isGazetteUrl,
  itemHeadings,
  normalizeInstrumentTitle,
  parseLongDate,
  parsePartIExtra,
  parsePartIIIYear,
  parsePartIIIndex,
  parsePartIIInstrumentPage,
  parsePartIIndex,
  parseShortDate,
  parseYearIndex,
  proxyUrl,
} from "../app/gazette-core.ts";
import { loadBodies, loadGazette, sinceWeeks } from "../app/gazette-service.ts";

const YEAR_INDEX_P1 = `
<main><h1>Canada Gazette, Part I: Volume 160</h1>
<ul>
 <li><a href="/rp-pr/p1/2026/2026-08-29/html/index-eng.html">Part&nbsp;I, volume 160, number 35</a></li>
 <li><a href="/rp-pr/p1/2026/2026-08-24-x7/html/extra7-eng.html">Part&nbsp;I, volume 160, extra number 7</a></li>
 <li><a href="/rp-pr/p1/2026/2026-08-22/html/index-eng.html">Part&nbsp;I, volume 160, number 34</a></li>
 <li><a href="/rp-pr/p1/2026/2026-08-22/pdf/g1-16034.pdf">PDF</a></li>
</ul></main>`;

const ISSUE_P1 = `
<main><div id="content">
<h1 id="wb-cont">Canada Gazette, Part I, Volume 160, Number 35:&nbsp;Index</h1>
<p>August&nbsp;29,&nbsp;2026</p>
<h2> <a href="./notice-avis-eng.html">Government notices</a></h2>
<h3>Health, Dept. of</h3>
<h4>Food and Drugs Act</h4>
<ul class="lst-spcd list-unstyled">
 <li> <a href="./notice-avis-eng.html#na1">Notice of intent&nbsp;&mdash;&nbsp;Medical device licence fees</a></li>
</ul>
<h3>Environment, Dept. of the</h3>
<h4>Canadian Environmental Protection Act,&nbsp;1999</h4>
<ul class="lst-spcd list-unstyled">
 <li> <a href="./notice-avis-eng.html#nb1">Notice with respect to certain substances</a></li>
</ul>
<h2>Proposed Regulations</h2>
<h3>Health, Dept. of</h3>
<h4>Food and Drugs Act</h4>
<ul class="lst-spcd list-unstyled">
 <li> <a href="./reg1-eng.html">Regulations Amending the Medical Devices Regulations</a></li>
</ul>
<h2>Orders in Council</h2>
<h3>Public Health Agency of Canada</h3>
<h4>Quarantine Act</h4>
<ul class="lst-spcd list-unstyled"><li><a href="./order-decret-eng.html">Order Amending the Quarantine Order</a></li></ul>
<h2> <a href="./parliament-parlement-eng.html">Parliament</a></h2>
<h3>House of Commons</h3>
<ul class="lst-spcd list-unstyled">
 <li> <a href="./parliament-parlement-eng.html#pe1"> Filing applications for private bills</a><sup id="fn1-rf"><a class="fn-lnk" href="#fn1"><span class="wb-inv">footnote </span>*</a></sup></li>
</ul>
<aside class="wb-fnote" role="note"><h2 id="fn">Footnote</h2><dl><dt>Footnote *</dt><dd id="fn1"><p>Previously published.</p><p><a href="#fn1-rf">Return</a></p></dd></dl></aside>
</div></main>`;

const NOTICES_P1 = `
<main>
<h1 id="wb-cont">Canada Gazette, Part I, Volume 160, Number 35: GOVERNMENT NOTICES</h1>
<h2 id="na1">DEPARTMENT OF HEALTH</h2>
<h3>FOOD AND DRUGS ACT</h3>
<h4>Notice of intent — Medical device licence fees</h4>
<p>Health Canada intends to update fees for medical device licence applications.</p>
<h2 id="nb1">DEPARTMENT OF THE ENVIRONMENT</h2>
<h3>CANADIAN ENVIRONMENTAL PROTECTION ACT, 1999</h3>
<p>Notice with respect to certain substances.</p>
</main>`;

const EXTRA_P1 = `
<main><div id="content">
<h1 id="wb-cont">Canada Gazette, Part I, Volume 160, Number 7:&nbsp;Extra</h1>
<p>August&nbsp;24,&nbsp;2026</p>
<h2 id="e71">OFFICE OF THE CHIEF ELECTORAL OFFICER</h2>
<h3>CANADA ELECTIONS ACT</h3>
<h4><cite>Determination of number of electors</cite></h4>
<p>Notice is hereby given that the number of electors is as follows.</p>
</div></main>`;

const ISSUE_P2 = `
<main><div id="content">
<h1 id="wb-cont">Canada Gazette, Part II, Volume 160, Number 17:&nbsp;Index</h1>
<p>August&nbsp;26,&nbsp;2026</p>
<ul class="lst-spcd list-unstyled">
 <li> <a href="sor-dors181-eng.html"> Medical Devices Regulations&nbsp;&mdash;&nbsp;Regulations Amending the <br> Food and Drugs Act </a> <br> SOR/2026-181 <br> 17/08/26 </li>
 <li> <a href="si-tr44-eng.html"> Order Fixing the Day on Which this Order Is Made as the Day on Which Sections 29 and 47 of the Build Canada Homes Act Come into Force <br> Build Canada Homes Act </a> <br> SI/2026-44 <br> 26/08/26 <br> new</li>
</ul></div></main>`;

const INSTRUMENT_P2 = `
<main>
<h1 id="wb-cont">Regulations Amending the Medical Devices Regulations:&nbsp;SOR/2026-190</h1>
<p>Canada Gazette, Part II, Volume 160, Number 18</p>
<p>Registration<br>SOR/2026-190&nbsp;September&nbsp;1,&nbsp;2026</p>
<p>FOOD AND DRUGS ACT</p>
<p>P.C. 2026-800&nbsp;August&nbsp;28,&nbsp;2026</p>
<h2>REGULATORY IMPACT ANALYSIS STATEMENT</h2>
<p>These amendments introduce mandatory problem reporting.</p>
</main>`;

const YEAR_P3 = `
<main><h1 id="wb-cont">Canada Gazette, Part&nbsp;III: Volume 48</h1>
<table><thead><tr><th>Date</th><th>Title</th><th>PDF</th></tr></thead><tbody>
<tr><td data-order="2026-04-10">April 10, 2026</td><td><ul>
 <li><a href="https://laws-lois.justice.gc.ca/eng/AnnualStatutes/2025_1">An Act to amend the Food and Drugs Act (S.C. 2025, c. 1)</a></li>
 <li><a href="https://laws-lois.justice.gc.ca/eng/AnnualStatutes/2025_3">Appropriation Act No. 1, 2025–26 (S.C. 2025, c.3)</a></li>
</ul></td><td><a href="/rp-pr/p3/2025/g3-04801.pdf">Part&nbsp;III, Volume&nbsp;48 (2.2MB)</a></td></tr>
</tbody></table></main>`;

test("year index lists regular issues and extra editions with ISO dates", () => {
  const issues = parseYearIndex(YEAR_INDEX_P1, "I", 2026);
  assert.deepEqual(issues.map((issue) => [issue.date, issue.extra]), [["2026-08-29", false], ["2026-08-24", true], ["2026-08-22", false]]);
  assert.equal(issues[0].url, "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/index-eng.html");
  assert.equal(issues[1].url, "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-24-x7/html/extra7-eng.html");
  assert.equal(issues[0].label, "Part I, volume 160, number 35");
});

test("Part I index items keep section, organization, act, anchor and absolute links", () => {
  const issue = { part: "I", year: 2026, date: "2026-08-29", url: "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/index-eng.html", label: "x", extra: false };
  const items = parsePartIIndex(ISSUE_P1, issue);
  assert.equal(items.length, 5, items.map((i) => i.title).join(" | "));
  const fees = items[0];
  assert.equal(fees.title, "Notice of intent — Medical device licence fees");
  assert.equal(fees.section, "Government notices");
  assert.equal(fees.organization, "Health, Dept. of");
  assert.equal(fees.act, "Food and Drugs Act");
  assert.equal(fees.url, "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/notice-avis-eng.html#na1");
  assert.equal(fees.bodyUrl, "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/notice-avis-eng.html");
  assert.equal(fees.anchor, "na1");
  assert.equal(fees.issueDate, "2026-08-29");
  assert.equal(fees.issueLabel, "Canada Gazette, Part I, Volume 160, Number 35");
  const reg = items.find((item) => item.section === "Proposed Regulations");
  assert.equal(reg.title, "Regulations Amending the Medical Devices Regulations");
  assert.equal(reg.bodyUrl, "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/reg1-eng.html");
  assert.equal(reg.anchor, undefined);
  const order = items.find((item) => item.section === "Orders in Council");
  assert.equal(order.organization, "Public Health Agency of Canada");
  const bill = items.find((item) => item.section === "Parliament");
  assert.equal(bill.title, "Filing applications for private bills");
  assert.ok(!items.some((item) => /footnote/i.test(item.section)));
  assert.equal(itemHeadings(fees), "Government notices · Health, Dept. of · Food and Drugs Act");
});

test("section pages yield one body per anchored notice", () => {
  const bodies = extractSectionBodies(NOTICES_P1);
  assert.ok(bodies.get("na1").includes("update fees for medical device licence applications"));
  assert.ok(!bodies.get("na1").includes("certain substances"));
  assert.ok(bodies.get("nb1").includes("certain substances"));
  assert.ok(bodies.get("").includes("GOVERNMENT NOTICES"));
});

test("extra editions become items with their text already loaded", () => {
  const issue = { part: "I", year: 2026, date: "2026-08-24", url: "https://gazette.gc.ca/rp-pr/p1/2026/2026-08-24-x7/html/extra7-eng.html", label: "extra 7", extra: true };
  const items = parsePartIExtra(EXTRA_P1, issue);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Determination of number of electors");
  assert.equal(items[0].organization, "OFFICE OF THE CHIEF ELECTORAL OFFICER");
  assert.equal(items[0].section, "Extra edition");
  assert.equal(items[0].bodyStatus, "loaded");
  assert.ok(items[0].body.includes("number of electors"));
  assert.equal(items[0].url, `${issue.url}#e71`);
});

test("Part II index items carry registration, date, enabling acts and readable titles", () => {
  const issue = { part: "II", year: 2026, date: "2026-08-26", url: "https://gazette.gc.ca/rp-pr/p2/2026/2026-08-26/html/index-eng.html", label: "x", extra: false };
  const items = parsePartIIIndex(ISSUE_P2, issue);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Regulations Amending the Medical Devices Regulations");
  assert.deepEqual(items[0].enablingActs, ["Food and Drugs Act"]);
  assert.equal(items[0].registration, "SOR/2026-181");
  assert.equal(items[0].registrationDate, "2026-08-17");
  assert.equal(items[0].section, "Regulations (SOR)");
  assert.equal(items[0].url, "https://gazette.gc.ca/rp-pr/p2/2026/2026-08-26/html/sor-dors181-eng.html");
  assert.equal(items[1].section, "Statutory instruments (SI)");
  assert.equal(items[1].registration, "SI/2026-44");
  assert.equal(normalizeInstrumentTitle("Customs Tariff — Order Amending the Schedule to the"), "Order Amending the Schedule to the Customs Tariff");
  assert.equal(normalizeInstrumentTitle("Plain title"), "Plain title");
});

test("a Part II instrument page (extra edition) parses to one item with registration and text", () => {
  const issue = { part: "II", year: 2026, date: "2026-09-01", url: "https://gazette.gc.ca/rp-pr/p2/2026/2026-09-01-x2/html/sor-dors190-eng.html", label: "extra", extra: true };
  const item = parsePartIIInstrumentPage(INSTRUMENT_P2, issue);
  assert.equal(item.title, "Regulations Amending the Medical Devices Regulations");
  assert.equal(item.registration, "SOR/2026-190");
  assert.equal(item.registrationDate, "2026-09-01");
  assert.deepEqual(item.enablingActs, ["FOOD AND DRUGS ACT"]);
  assert.ok(item.body.includes("mandatory problem reporting"));
  assert.equal(item.bodyStatus, "loaded");
});

test("Part III yearly table yields one item per Act with the publication date", () => {
  const items = parsePartIIIYear(YEAR_P3, 2025);
  assert.equal(items.length, 2);
  assert.equal(items[0].issueDate, "2026-04-10");
  assert.equal(items[0].title, "An Act to amend the Food and Drugs Act (S.C. 2025, c. 1)");
  assert.equal(items[0].url, "https://laws-lois.justice.gc.ca/eng/AnnualStatutes/2025_1");
  assert.equal(items[0].issueUrl, "https://gazette.gc.ca/rp-pr/p3/2025/g3-04801.pdf");
  assert.equal(items[0].bodyStatus, "unavailable");
});

test("dates, text and URL helpers", () => {
  assert.equal(parseLongDate("August&nbsp;29,&nbsp;2026"), "2026-08-29");
  assert.equal(parseLongDate("nothing"), "");
  assert.equal(parseShortDate("17/08/26"), "2026-08-17");
  assert.equal(htmlToText("<p>One&nbsp;&mdash;&nbsp;two</p><ul><li>three</li></ul><script>x()</script>"), "One — two\nthree");
  assert.equal(isGazetteUrl("https://gazette.gc.ca/rp-pr/p1/2026/index-eng.html"), true);
  assert.equal(isGazetteUrl("https://example.com/"), false);
  assert.equal(isGazetteUrl("http://gazette.gc.ca/"), false);
  assert.equal(proxyUrl("https://gazette.gc.ca/a?b=1"), "/api/gazette/source?url=https%3A%2F%2Fgazette.gc.ca%2Fa%3Fb%3D1");
  assert.equal(sinceWeeks(1, new Date("2026-09-02T12:00:00Z")), "2026-08-26");
});

test("loadGazette reads year indexes, issues and extras through the injected fetcher and reports status", async () => {
  const pages = new Map([
    ["https://gazette.gc.ca/rp-pr/p1/2026/index-eng.html", YEAR_INDEX_P1],
    ["https://gazette.gc.ca/rp-pr/p1/2026/2026-08-29/html/index-eng.html", ISSUE_P1],
    ["https://gazette.gc.ca/rp-pr/p1/2026/2026-08-24-x7/html/extra7-eng.html", EXTRA_P1],
    ["https://gazette.gc.ca/rp-pr/p2/2026/index-eng.html", '<main><a href="/rp-pr/p2/2026/2026-08-26/html/index-eng.html">n</a></main>'],
    ["https://gazette.gc.ca/rp-pr/p2/2026/2026-08-26/html/index-eng.html", ISSUE_P2],
    ["https://gazette.gc.ca/rp-pr/p3/2026/index-eng.html", null],
    ["https://gazette.gc.ca/rp-pr/p3/2025/index-eng.html", YEAR_P3],
  ]);
  const fetched = [];
  const fetchText = async (url) => {
    fetched.push(url);
    if (!pages.has(url)) throw new Error(`HTTP 404 for ${url}`);
    const html = pages.get(url);
    if (html === null) throw new Error("HTTP 404");
    return html;
  };
  const now = new Date("2026-09-02T12:00:00Z");
  const result = await loadGazette({ parts: ["I", "II", "III"], since: "2026-04-01", fetchText, now });
  assert.deepEqual(result.statuses.map((status) => [status.part, status.status, status.items]), [["I", "partial", 6], ["II", "ok", 2], ["III", "ok", 2]]);
  assert.ok(result.statuses[0].message.includes("2026-08-22"), "the missing 2026-08-22 issue is reported, not fatal");
  assert.equal(result.items[0].issueDate, "2026-08-29");
  assert.ok(result.items.some((item) => item.extra));
  assert.equal(result.checkedAt, now.toISOString());

  const bodyFetches = [];
  const withBodies = await loadBodies(result.items, async (url) => {
    bodyFetches.push(url);
    if (url.endsWith("notice-avis-eng.html")) return NOTICES_P1;
    throw new Error("HTTP 404");
  });
  const fees = withBodies.find((item) => item.anchor === "na1");
  assert.equal(fees.bodyStatus, "loaded");
  assert.ok(fees.body.includes("medical device licence applications"));
  const reg = withBodies.find((item) => item.section === "Proposed Regulations");
  assert.equal(reg.bodyStatus, "unavailable");
  const notices = bodyFetches.filter((url) => url.endsWith("notice-avis-eng.html")).length;
  assert.equal(notices, 1, "one fetch serves every notice on the page");
  assert.ok(!fetched.some((url) => url.endsWith("notice-avis-eng.html")), "listing never fetches section pages");
});
