import assert from "node:assert/strict";
import test from "node:test";
import { parseFccidDetailMarkdown, parseFccidListMarkdown } from "../app/fcc-index.ts";

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
