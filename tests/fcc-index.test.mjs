import assert from "node:assert/strict";
import test from "node:test";
import { parseFccidDetailMarkdown, parseFccidExhibits, parseFccidListMarkdown } from "../app/fcc-index.ts";

const listMarkdown = `Title: Sonova USA Inc. FCC ID Applications (KWC)

URL Source: https://fccid.io/KWC

Markdown Content:
| FCC ID Application Date | Product Purpose Application Type |
| --- | --- |
| **[KWC-ERF](https://fccid.io/KWC-ERF)** 2026-06-11 | Wireless [hearing aid](https://fccid.io/KWC#) Original Equipment |
| **[KWC-HDBT](https://fccid.io/KWC-HDBT)** 2025-06-16 | Wireless Headphones Change in Identification |
`;

const detailMarkdown = `Title: FCC ID KWC-ERF - Wireless hearing aid

URL Source: https://fccid.io/KWC-ERF

Markdown Content:
#### TCB Grant - Application HJUm0ezkXC8C1INAucS1OQ==

FCC IDENTIFIER:KWC-ERF

**Name of Grantee:**Sonova USA Inc.

**Equipment Class:****Part 15 Spread Spectrum Transmitter**
**Notes:****Wireless hearing aid**

Grant Notes FCC Rule Parts Frequency
Range (MHZ)Output
Watts Frequency
Tolerance Emission
Designator
CC**15C****2402.0**-**2480.0****0.000139**
`;

test("parses live fccid.io grantee lists into authorization records", () => {
  const records = parseFccidListMarkdown(listMarkdown, "2026-08-17T00:00:00.000Z", ["KWC"]);
  assert.equal(records.length, 2);
  assert.equal(records[0].fccId, "KWC-ERF");
  assert.equal(records[0].authorizationDate, "2026-06-11");
  assert.equal(records[0].equipmentDescription, "Wireless hearing aid");
  assert.equal(records[0].purposeCategory, "Original authorization");
  assert.equal(records[0].sourceMode, "public_index");
  assert.equal(records[1].purposeCategory, "Change in FCC ID");
});

test("parses live fccid.io grant pages for class, notes and RF", () => {
  const records = parseFccidDetailMarkdown(detailMarkdown, "2026-08-17T00:00:00.000Z", ["KWC"]);
  assert.equal(records.length, 1);
  assert.equal(records[0].fccId, "KWC-ERF");
  assert.equal(records[0].equipmentDescription, "Wireless hearing aid");
  assert.deepEqual(records[0].equipmentClasses, ["Part 15 Spread Spectrum Transmitter"]);
  assert.equal(records[0].rfBands?.[0]?.lowMhz, "2402.0");
  assert.equal(records[0].rfBands?.[0]?.highMhz, "2480.0");
});

const exhibitHtml = `<html><body>
Latest application date: 2026-06-11
<table class="table mobile-card-table exhibit-table"><thead><tr><th>Document</th><th>Type</th><th>Available</th><th>File</th></tr></thead><tbody>
<tr><td data-label="Document"><a href="/KWC-ERF/Label/label-pdf-1">12-PDL-29575 - Labelling.pdf</a></td><td data-label="Type">ID Label/Location Info</td><td data-label="Available">2026-06-11</td><td data-label="File">PDF 1.3 MB</td></tr>
<tr><td data-label="Document"><a href="/KWC-ERF/Letter/letter-pdf-1">8-FCB012_04 FCC Confidentiality Request.pdf</a></td><td data-label="Type">Cover Letter(s)</td><td data-label="Available">2026-06-11</td><td data-label="File">PDF 251.7 KB</td></tr>
<tr><td data-label="Document"><a href="/KWC-ERF/Users-Manual/manual-pdf-1">24-User Guide.pdf</a> Metadata only</td><td data-label="Type">Users Manual</td><td data-label="Available">2026-12-08</td><td data-label="File">PDF 515.6 KB</td></tr>
</tbody></table></body></html>`;

const exhibitMarkdown = `Title: FCC ID KWC-ERF
[12-PDL-29575 - Labelling.pdf](https://fccid.io/KWC-ERF/Label/12-PDL-29575-Labelling-pdf-9379994)ID Label/Location Info 2026-06-11 PDF 1.3 MB
[8-FCB012_04 FCC Confidentiality Request.pdf](https://fccid.io/KWC-ERF/Letter/8-FCB012-04-FCC-Confidentiality-Request-pdf-9379992)Cover Letter(s) 2026-06-11 PDF 251.7 KB
`;

test("parses fccid.io exhibit tables for document name, type, dates and confidentiality", () => {
  const exhibits = parseFccidExhibits(exhibitHtml, "KWC-ERF");
  assert.equal(exhibits.length, 3);
  assert.equal(exhibits[0].name, "12-PDL-29575 - Labelling.pdf");
  assert.equal(exhibits[0].exhibitType, "ID Label/Location Info");
  assert.equal(exhibits[0].url, "https://fccid.io/KWC-ERF/Label/label-pdf-1");
  assert.equal(exhibits[0].availableAt, "2026-06-11");
  assert.equal(exhibits[0].submittedAt, "2026-06-11");
  assert.equal(exhibits[1].exhibitType, "Cover Letter(s)");
  assert.equal(exhibits[2].exhibitType, "Users Manual");
  assert.equal(exhibits[2].availableAt, "2026-12-08");
  assert.match(exhibits[2].confidentiality || "", /metadata only/i);
});

test("parses jina exhibit-selector markdown into the same document list", () => {
  const exhibits = parseFccidExhibits(exhibitMarkdown, "KWC-ERF");
  assert.ok(exhibits.length >= 2);
  assert.equal(exhibits[0].exhibitType, "ID Label/Location Info");
  assert.equal(exhibits[0].url, "https://fccid.io/KWC-ERF/Label/12-PDL-29575-Labelling-pdf-9379994");
  assert.equal(exhibits[1].exhibitType, "Cover Letter(s)");
});
