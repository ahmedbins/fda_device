import {
  fccOfficialIdParts,
  normalizeFccRecord,
  normalizeFccScope,
  uniqueFccRecords,
  type FccExhibit,
  type NormalizedFccRecord,
  type RawFccRecord,
} from "./fcc-core.ts";

export const FCCID_IO = "https://fccid.io";
export const FCCID_INDEX_LABEL = "fccid.io public index of FCC filings";

export function fccPublicRecordUrl(fccId: string) {
  return `${FCCID_IO}/${normalizeFccScope(fccId)}`;
}

const EXHIBIT_TYPES = [
  "Attestation Statements",
  "Block Diagram",
  "Cover Letter(s)",
  "Cover Letter",
  "External Photos",
  "ID Label/Location Info",
  "Internal Photos",
  "Operational Description",
  "Parts List / Tune Up Info",
  "Parts List",
  "RF Exposure Info",
  "Schematics",
  "Test Report",
  "Test Setup Photos",
  "Users Manual",
  "User Manual",
  "SAR Test Report",
];

const PURPOSE_PATTERN = /(Original Equipment|Class II Permissive Change|Change in Identification|Change in FCC ID)$/i;

function stripMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function listUrls(scope: string) {
  const id = normalizeFccScope(scope);
  return [
    `${FCCID_IO}/${encodeURIComponent(id)}`,
    `${FCCID_IO}/${encodeURIComponent(id)}?page=2`,
    `${FCCID_IO}/${encodeURIComponent(id)}?page=3`,
  ];
}

export function fccidIoUrl(scope: string, page = 1) {
  const id = normalizeFccScope(scope);
  return page > 1 ? `${FCCID_IO}/${encodeURIComponent(id)}?page=${page}` : `${FCCID_IO}/${encodeURIComponent(id)}`;
}

export function parseFccidListMarkdown(markdown: string, retrievedAt: string, confirmedCodes: string[] = []): NormalizedFccRecord[] {
  const titleGrantee = markdown.match(/^Title:\s*(.+?)\s+FCC ID Applications/m)?.[1]?.trim();
  const rows: RawFccRecord[] = [];
  const rowPattern = /\*\*\[([A-Z0-9-]+)\]\([^)]+\)\*\*\s+(\d{4}-\d{2}-\d{2})\s*\|\s*([\s\S]*?)\s*(?=\n\||\n\n|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(markdown))) {
    const fccId = normalizeFccScope(match[1]);
    const rest = stripMarkdown(match[3] || "").replace(/\|+$/g, "").trim();
    const purposeMatch = rest.match(PURPOSE_PATTERN);
    const applicationPurpose = purposeMatch?.[1];
    const description = rest.replace(PURPOSE_PATTERN, "").replace(/\|+$/g, "").trim();
    rows.push({
      FCCId: fccId,
      grantDate: match[2],
      grantee: titleGrantee,
      applicationPurpose,
      equipmentDescription: description || undefined,
      sourceUrl: `${FCCID_IO}/${fccId}`,
    });
  }
  return uniqueFccRecords(rows
    .map((raw) => {
      const record = normalizeFccRecord(raw, retrievedAt, { confirmedCodes, sourceMode: "public_index" });
      if (!record) return null;
      return {
        ...record,
        equipmentDescription: typeof raw.equipmentDescription === "string" ? raw.equipmentDescription : record.equipmentDescription,
        sourceUrl: `${FCCID_IO}/${record.fccId}`,
      };
    })
    .filter((record): record is NormalizedFccRecord => record !== null));
}

export function parseFccidDetailMarkdown(markdown: string, retrievedAt: string, confirmedCodes: string[] = []): NormalizedFccRecord[] {
  const blocks = markdown.split(/####\s+TCB Grant[^\n]*/i).slice(1);
  const source = markdown.match(/URL Source:\s*(\S+)/)?.[1];
  const fccIdFromTitle = markdown.match(/FCC ID\s+([A-Z0-9-]+)/i)?.[1];
  const rows = (blocks.length ? blocks : [markdown]).map((block) => {
    const fccId = normalizeFccScope(
      block.match(/FCC IDENTIFIER:\s*([A-Z0-9-]+)/i)?.[1]
      || fccIdFromTitle
      || "",
    );
    if (!fccId) return null;
    const grantDate = block.match(/Date of Grant:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]
      || block.match(/Date of Grant:\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
    const classes = [...block.matchAll(/Equipment Class:\s*\**([^*\n]+)\**/gi)].map((item) => stripMarkdown(item[1])).filter(Boolean);
    const notes = [...block.matchAll(/Notes:\s*\**([\s\S]*?)\**\s*(?:\n|Grant Notes)/gi)].map((item) => stripMarkdown(item[1])).filter(Boolean);
    const bands = [...block.matchAll(/(\d{2}[A-Z]?)\**\s*\**(\d+(?:\.\d+)?)\**\s*-\s*\**(\d+(?:\.\d+)?)\**\s*\**(\d+(?:\.\d+)?)?/gi)].map((item) => ({
      lowMhz: item[2],
      highMhz: item[3],
      outputWatts: item[4],
      ruleParts: item[1],
    }));
    const raw: RawFccRecord = {
      FCCId: fccId,
      grantee: stripMarkdown(block.match(/Name of Grantee:\s*\**([^*\n]+)/i)?.[1] || ""),
      grantDate,
      applicationPurpose: block.match(/Change in Identification/i) ? "Change in Identification" : "Original Equipment",
      equipmentDescription: notes[0],
      equipmentClasses: [...new Set(classes)],
      rfBands: bands,
      city: stripMarkdown(block.match(/\*\*([^,*\n]+),\s*([A-Z]{2})\s+(\d{5})\*\*/)?.[1] || ""),
      state: block.match(/\*\*[^,*\n]+,\s*([A-Z]{2})\s+\d{5}\*\*/)?.[1],
      country: /United States/i.test(block) ? "United States" : /Germany/i.test(block) ? "Germany" : undefined,
      sourceUrl: source || `${FCCID_IO}/${fccId}`,
    };
    return raw;
  }).filter((row): row is RawFccRecord => row !== null);

  return uniqueFccRecords(rows
    .map((raw) => {
      const record = normalizeFccRecord(raw, retrievedAt, { confirmedCodes, sourceMode: "public_index" });
      if (!record) return null;
      return {
        ...record,
        equipmentDescription: typeof raw.equipmentDescription === "string" ? raw.equipmentDescription : record.equipmentDescription,
        equipmentClasses: Array.isArray(raw.equipmentClasses) ? raw.equipmentClasses as string[] : record.equipmentClasses,
        rfBands: Array.isArray(raw.rfBands) ? raw.rfBands as NormalizedFccRecord["rfBands"] : record.rfBands,
        sourceUrl: String(raw.sourceUrl || `${FCCID_IO}/${record.fccId}`),
      };
    })
    .filter((record): record is NormalizedFccRecord => record !== null));
}

export function parseFccidMarkdown(markdown: string, retrievedAt: string, confirmedCodes: string[] = []): NormalizedFccRecord[] {
  if (/Equipment Class:/i.test(markdown) || /FCC IDENTIFIER:/i.test(markdown)) {
    const detailed = parseFccidDetailMarkdown(markdown, retrievedAt, confirmedCodes);
    if (detailed.length) {
      const exhibits = parseFccidExhibits(markdown, detailed[0].fccId);
      return detailed.map((record, index) => index === 0 && exhibits.length ? { ...record, exhibits } : record);
    }
  }
  return parseFccidListMarkdown(markdown, retrievedAt, confirmedCodes);
}

const EXHIBIT_PATH_TYPES: Record<string, string> = {
  letter: "Cover Letter(s)",
  "cover-letter": "Cover Letter(s)",
  "test-report": "Test Report",
  "external-photos": "External Photos",
  "internal-photos": "Internal Photos",
  "rf-exposure": "RF Exposure Info",
  "rf-exposure-info": "RF Exposure Info",
  "users-manual": "Users Manual",
  "user-manual": "Users Manual",
  label: "ID Label/Location Info",
  "id-label": "ID Label/Location Info",
  schematics: "Schematics",
  "operational-description": "Operational Description",
  "attestation-statements": "Attestation Statements",
  attestation: "Attestation Statements",
  "block-diagram": "Block Diagram",
  "test-setup-photos": "Test Setup Photos",
  "parts-list": "Parts List / Tune Up Info",
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function exhibitTypeFromText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const exact = EXHIBIT_TYPES.find((item) => item.toLowerCase() === compact.toLowerCase());
  if (exact) return exact;
  return EXHIBIT_TYPES.find((item) => compact.toLowerCase().includes(item.toLowerCase()));
}

function exhibitTypeFromPath(url: string) {
  const match = url.match(/fccid\.io\/[^/]+\/([^/]+)\//i);
  if (!match) return undefined;
  return EXHIBIT_PATH_TYPES[match[1].toLowerCase()] || exhibitTypeFromText(match[1].replace(/-/g, " "));
}

function applicationDateFromPage(page: string) {
  const iso = page.match(/Latest application date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
    || page.match(/Application Dated:\s*(\d{4}-\d{2}-\d{2})/i)?.[1]
    || page.match(/Final Action Date<\/th>\s*<td[^>]*>\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (iso) return iso;
  const slash = page.match(/Application Dated:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  if (!slash) return undefined;
  const [month, day, year] = slash.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function confidentialityFromText(value: string, availableAt?: string, submittedAt?: string) {
  if (/metadata only/i.test(value)) return "Metadata only / not yet public";
  if (availableAt && submittedAt && availableAt > submittedAt) return `Short-term confidential until ${availableAt}`;
  if (/confidential/i.test(value)) return "Confidential";
  return undefined;
}

function pushExhibit(exhibits: FccExhibit[], seen: Set<string>, exhibit: FccExhibit) {
  const key = `${exhibit.exhibitType}|${exhibit.name}|${exhibit.availableAt || exhibit.submittedAt || ""}`;
  if (seen.has(key) || !exhibit.name || !exhibit.exhibitType) return;
  seen.add(key);
  exhibits.push(exhibit);
}

export function parseFccidExhibits(page: string, fccId: string): FccExhibit[] {
  const exhibits: FccExhibit[] = [];
  const seen = new Set<string>();
  const submittedFallback = applicationDateFromPage(page);

  const exhibitHtml = page.match(/<table[^>]*exhibit-table[^>]*>[\s\S]*?<\/table>/i)?.[0] || (/data-label="Document"/i.test(page) ? page : "");
  const htmlRow = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[\s\S]*?<\/td>\s*<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = htmlRow.exec(exhibitHtml))) {
    const documentHtml = match[1];
    const type = exhibitTypeFromText(decodeHtml(match[2].replace(/<[^>]+>/g, " ")));
    const name = decodeHtml((documentHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || documentHtml).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/Metadata only/i, "").trim();
    const availableAt = decodeHtml(match[3].replace(/<[^>]+>/g, " ")).match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!type || !name) continue;
    pushExhibit(exhibits, seen, {
      fccId,
      name,
      exhibitType: type,
      submittedAt: submittedFallback,
      availableAt,
      confidentiality: confidentialityFromText(documentHtml, availableAt, submittedFallback),
    });
  }

  const jinaLine = /\[([^\]]+\.(?:pdf|docx?|png|jpg|zip))\]\((https?:\/\/fccid\.io\/[^)]+)\)\s*(Metadata only)?\s*([A-Za-z()[\] /]+?)\s*(\d{4}-\d{2}-\d{2})/gi;
  while ((match = jinaLine.exec(page))) {
    const type = exhibitTypeFromText(match[4]) || exhibitTypeFromPath(match[2]);
    if (!type) continue;
    pushExhibit(exhibits, seen, {
      fccId,
      name: stripMarkdown(match[1]),
      exhibitType: type,
      submittedAt: submittedFallback,
      availableAt: match[5],
      confidentiality: confidentialityFromText(match[3] || "", match[5], submittedFallback),
    });
  }

  const tableRow = /\|\s*([^|\n]+)\|\s*([^|\n]+)\|\s*([^|\n]*)\|\s*([^|\n]*)\|/g;
  while ((match = tableRow.exec(page))) {
    const cells = match.slice(1).map((cell) => stripMarkdown(cell));
    if (cells.some((cell) => /^(document|type|available|file)$/i.test(cell))) continue;
    const type = cells.map(exhibitTypeFromText).find(Boolean);
    if (!type) continue;
    const name = cells.find((cell) => /\.(pdf|docx?|png|jpg|zip)/i.test(cell)) || cells.find((cell) => cell.length > 8 && cell !== type) || cells[0];
    const dates = cells.filter((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cell));
    pushExhibit(exhibits, seen, {
      fccId,
      name,
      exhibitType: type,
      submittedAt: submittedFallback || dates[1],
      availableAt: dates[0],
      confidentiality: confidentialityFromText(cells.join(" "), dates[0], submittedFallback),
    });
  }

  const pathLinks = [...page.matchAll(/https?:\/\/fccid\.io\/[^)\s"]+\/(Letter|Test-Report|External-Photos|Internal-Photos|RF-Exposure|Users-Manual|User-Manual|Label|Schematics|Operational-Description|Attestation(?:-Statements)?|Block-Diagram|Test-Setup-Photos)[^)\s"]*\/([^)\s"/]+)/gi)];
  for (const link of pathLinks) {
    const type = EXHIBIT_PATH_TYPES[link[1].toLowerCase()] || link[1];
    const name = decodeURIComponent(link[2]).replace(/[-_]+/g, " ");
    pushExhibit(exhibits, seen, { fccId, name, exhibitType: type, submittedAt: submittedFallback });
  }

  return exhibits;
}

export function fccidListLooksComplete(markdown: string) {
  return parseFccidListMarkdown(markdown, new Date().toISOString()).length < 100;
}

export function shouldFetchFccidListPages(scope: string) {
  const parts = fccOfficialIdParts(scope);
  return !!parts.granteeCode && !parts.productCode;
}

export { listUrls };
