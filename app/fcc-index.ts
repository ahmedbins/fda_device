import {
  fccOfficialIdParts,
  normalizeFccRecord,
  normalizeFccScope,
  uniqueFccRecords,
  type NormalizedFccRecord,
  type RawFccRecord,
} from "./fcc-core.ts";

export const FCCID_IO = "https://fccid.io";
export const FCCID_INDEX_LABEL = "fccid.io public index of FCC filings";

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
    if (detailed.length) return detailed;
  }
  return parseFccidListMarkdown(markdown, retrievedAt, confirmedCodes);
}

export function fccidListLooksComplete(markdown: string) {
  return parseFccidListMarkdown(markdown, new Date().toISOString()).length < 100;
}

export function shouldFetchFccidListPages(scope: string) {
  const parts = fccOfficialIdParts(scope);
  return !!parts.granteeCode && !parts.productCode;
}

export { listUrls };
