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

test("drops XML-forbidden control characters and clips text to Excel's cell limit", () => {
  const bytes = excelBytes({
    filename: "control.xlsx",
    sheetName: "Records",
    columns: [{ header: "Text" }],
    rows: [["line\u000Bbreak\u0000"], ["x".repeat(40_000)]],
  });
  const files = unzipSync(bytes);
  const xml = Object.entries(files).filter(([name]) => name.startsWith("xl/")).map(([, data]) => strFromU8(data)).join("");
  assert.ok(xml.includes("linebreak"));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
  assert.ok(!xml.includes("x".repeat(32_768)));
  assert.ok(xml.includes("x".repeat(32_767)));
});
