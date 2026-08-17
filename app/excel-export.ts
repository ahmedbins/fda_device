import { zipSync, strToU8 } from "fflate";

export type ExcelPrimitive = string | number | boolean | null | undefined;
export type ExcelLink = { text: string; url: string };
export type ExcelValue = ExcelPrimitive | ExcelLink | Date;

export type ExcelColumn = {
  header: string;
  width?: number;
  type?: "text" | "number" | "date" | "link";
};

type WorkbookOptions = {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  rows: ExcelValue[][];
};

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function colLetter(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function isLink(value: ExcelValue): value is ExcelLink {
  return !!value && typeof value === "object" && !(value instanceof Date) && "url" in value && typeof value.url === "string";
}

function asText(value: ExcelValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (isLink(value)) return value.text || value.url;
  return String(value);
}

function excelSerialDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime() / 86_400_000 + 25569;
}

function looksLikeDate(value: ExcelValue) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value);
}

function looksLikeUrl(value: ExcelValue) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function columnWidth(column: ExcelColumn, rows: ExcelValue[][], index: number) {
  if (column.width) return column.width;
  let width = column.header.length;
  for (const row of rows.slice(0, 80)) {
    width = Math.max(width, asText(row[index]).length);
  }
  return Math.min(42, Math.max(12, width + 2));
}

function buildWorkbook(options: WorkbookOptions) {
  const sheetName = (options.sheetName || "Export").slice(0, 31);
  const columns = options.columns;
  const rows = options.rows;
  const lastCol = colLetter(Math.max(0, columns.length - 1));
  const lastRow = rows.length + 1;
  const range = `A1:${lastCol}${lastRow}`;
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();
  const hyperlinks: { ref: string; url: string }[] = [];

  const intern = (text: string) => {
    const existing = sharedIndex.get(text);
    if (existing !== undefined) return existing;
    const index = shared.length;
    shared.push(text);
    sharedIndex.set(text, index);
    return index;
  };

  const headerCells = columns.map((column, index) => (
    `<c r="${colLetter(index)}1" t="s" s="1"><v>${intern(column.header)}</v></c>`
  )).join("");

  const body = rows.map((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells = columns.map((column, index) => {
      const value = row[index];
      const ref = `${colLetter(index)}${r}`;
      if (value == null || value === "") return "";
      const type = column.type
        || (isLink(value) || looksLikeUrl(value) ? "link" : looksLikeDate(value) || value instanceof Date ? "date" : typeof value === "number" ? "number" : "text");
      if (type === "link") {
        const url = isLink(value) ? value.url : String(value);
        const text = isLink(value) ? value.text || value.url : String(value);
        if (!url) return `<c r="${ref}" t="s" s="3"><v>${intern(text)}</v></c>`;
        hyperlinks.push({ ref, url });
        return `<c r="${ref}" t="s" s="4"><v>${intern(text)}</v></c>`;
      }
      if (type === "date") {
        const serial = excelSerialDate(value instanceof Date || typeof value === "string" ? value : String(value));
        if (serial == null) return `<c r="${ref}" t="s" s="3"><v>${intern(asText(value))}</v></c>`;
        return `<c r="${ref}" s="2"><v>${serial}</v></c>`;
      }
      if (type === "number" && typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="s" s="3"><v>${intern(asText(value))}</v></c>`;
    }).join("");
    return `<row r="${r}">${cells}</row>`;
  }).join("");

  const cols = columns.map((column, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(column, rows, index)}" customWidth="1"/>`
  )).join("");

  const hyperlinkXml = hyperlinks.length
    ? `<hyperlinks>${hyperlinks.map((link, index) => `<hyperlink ref="${link.ref}" r:id="rId${index + 1}"/>`).join("")}</hyperlinks>`
    : "";

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>${cols}</cols>
  <sheetData>
    <row r="1" ht="22" customHeight="1">${headerCells}</row>
    ${body}
  </sheetData>
  <autoFilter ref="${range}"/>
  ${hyperlinkXml}
</worksheet>`;

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NS_MAIN}" count="${shared.length}" uniqueCount="${shared.length}">
  ${shared.map((item) => `<si><t xml:space="preserve">${xmlEscape(item)}</t></si>`).join("")}
</sst>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF163669"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
  <sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}">
  <Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}">
  <Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${NS_CT}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(styles),
    "xl/sharedStrings.xml": strToU8(sharedStrings),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };

  if (hyperlinks.length) {
    files["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}">
  ${hyperlinks.map((link, index) => `<Relationship Id="rId${index + 1}" Type="${NS_REL}/hyperlink" Target="${xmlEscape(link.url)}" TargetMode="External"/>`).join("")}
</Relationships>`);
  }

  return zipSync(files, { level: 6 });
}

export function downloadExcel(options: WorkbookOptions) {
  const bytes = buildWorkbook(options);
  const name = options.filename.endsWith(".xlsx") ? options.filename : `${options.filename}.xlsx`;
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function excelBytes(options: WorkbookOptions) {
  return buildWorkbook(options);
}
