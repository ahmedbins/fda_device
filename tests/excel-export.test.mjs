import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { excelBytes } from "../app/excel-export.ts";

test("builds a single-sheet Excel workbook with filters, dates and hyperlinks", () => {
  const bytes = excelBytes({
    filename: "demo.xlsx",
    sheetName: "Authorizations",
    columns: [
      { header: "FCC ID", width: 14 },
      { header: "Grant date", type: "date" },
      { header: "Records", type: "number" },
      { header: "Public page", type: "link" },
    ],
    rows: [
      ["KWC-ERF", "2026-06-11", 1, { text: "Open KWC-ERF", url: "https://fccid.io/KWC-ERF" }],
      ["2A3ULMTW5", "2025-06-16", 3, "https://fccid.io/2A3ULMTW5"],
    ],
  });

  const files = unzipSync(bytes);
  const names = Object.keys(files);
  assert.ok(names.includes("xl/workbook.xml"));
  assert.ok(names.includes("xl/worksheets/sheet1.xml"));
  assert.ok(names.includes("xl/worksheets/_rels/sheet1.xml.rels"));

  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /autoFilter/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /KWC-ERF|t="s"/);
  assert.match(sheet, /hyperlink ref="D2"/);

  const rels = strFromU8(files["xl/worksheets/_rels/sheet1.xml.rels"]);
  assert.match(rels, /https:\/\/fccid\.io\/KWC-ERF/);

  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.match(workbook, /Authorizations/);
});
