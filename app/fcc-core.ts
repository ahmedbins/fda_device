export const FCC_EAS_API = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
export const FCC_SEARCH_URL = "https://www.fcc.gov/oet/ea/fccid";
export const FCC_SOURCE_LABEL = "FCC Equipment Authorization System";
export const FCC_GRANTEE_API = "https://opendata.fcc.gov/resource/3b3k-34jp.json";
export const FCC_GRANTEE_DATASET = "https://opendata.fcc.gov/Engineering-Technology/EAS-Equipment-Authorization-Grantee-Registrations/3b3k-34jp";

export type RawFccRecord = Record<string, unknown>;

export type NormalizedFccRecord = {
  source: "FCC";
  fccId: string;
  granteeCode?: string;
  fccProductCode?: string;
  granteeName?: string;
  authorizationDate?: string;
  applicationPurpose?: string;
  purposeCategory?: "Original authorization" | "Class II permissive change" | "Change in FCC ID" | "Other authorization activity";
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  sourceUrl: string;
  retrievedAt: string;
  sourceMode?: "live" | "official_snapshot" | "official_import";
  snapshotCapturedAt?: string;
  raw: RawFccRecord;
};

export type FccGranteeRegistration = {
  granteeCode: string;
  granteeName?: string;
  mailingAddress?: string;
  poBox?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  contactName?: string;
  dateReceived?: string;
  sourceUrl: string;
};

export type FccSearchResult = {
  records: NormalizedFccRecord[];
  grantees: FccGranteeRegistration[];
  retrievedAt: string;
  sourceMode: "live" | "official_snapshot" | "mixed" | "limited";
  snapshotCapturedAt?: string;
  resolvedScopes: string[];
  unresolvedScopes: string[];
};

function text(raw: RawFccRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function cleanFccDisplayValue(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^(n\/a|n\.a\.|na|none|null|-)$/i.test(trimmed)) return undefined;
  const cleaned = trimmed.replace(/(?:^|[\s,;]+)n\/a(?=$|[\s,;])/gi, "").replace(/[,\s;]+$/g, "").trim();
  return cleaned || undefined;
}

export function fccSourcePresentation(sourceMode?: FccSearchResult["sourceMode"] | null, retrieved = false) {
  if (!retrieved) return { status: "FCC SOURCE READY", note: "Ready for FCC-ID search" };
  if (sourceMode === "live") return { status: "FCC API CONNECTED", note: "API response" };
  if (sourceMode === "mixed") return { status: "FCC MIXED SOURCE", note: "Official snapshot plus live response" };
  if (sourceMode === "limited") return { status: "FCC COVERAGE LIMITED", note: "Limited official coverage" };
  return { status: "FCC OFFICIAL SNAPSHOT", note: "Official EAS snapshot" };
}

export function normalizeFccScope(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 19);
}

export function parseFccScopes(value: string) {
  return [...new Set(
    value
      .split(/[,;\n\s]+/)
      .map(normalizeFccScope)
      .filter((scope) => scope.length >= 3),
  )];
}

export function isoFccDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return iso || undefined;
}

export function categorizeFccPurpose(value?: string): NormalizedFccRecord["purposeCategory"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("class ii") && normalized.includes("permissive")) return "Class II permissive change";
  if (normalized.includes("change") && normalized.includes("identification")) return "Change in FCC ID";
  if (normalized.includes("original")) return "Original authorization";
  return "Other authorization activity";
}

export function fccIdParts(fccId: string, confirmedCodes: string[] = []) {
  const normalized = normalizeFccScope(fccId);
  const code = [...confirmedCodes]
    .map(normalizeFccScope)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => normalized.startsWith(candidate));
  if (!code) return {};
  return { granteeCode: code, fccProductCode: normalized.slice(code.length).replace(/^-/, "") || undefined };
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseFccXml(body: string): RawFccRecord[] {
  const rows: RawFccRecord[] = [];
  const rowPattern = /<fccidInfo\b[^>]*>([\s\S]*?)<\/fccidInfo>/gi;
  const fields = ["address", "applicationPurpose", "city", "country", "FCCId", "grantDate", "grantee", "state", "zipCode"];
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(body))) {
    const raw: RawFccRecord = {};
    for (const field of fields) {
      const fieldPattern = new RegExp(`<${field}\\b[^>]*>([\\s\\S]*?)<\\/${field}>`, "i");
      const value = fieldPattern.exec(match[1])?.[1];
      if (value !== undefined) raw[field] = decodeXml(value);
    }
    if (Object.keys(raw).length) rows.push(raw);
  }

  return rows;
}

export function parseFccPayload(body: string, contentType = ""): unknown {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (contentType.toLowerCase().includes("json") || /^[{[]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Some FCC responses are labeled JSON while containing XML.
    }
  }
  return parseFccXml(trimmed);
}

export function extractRawFccRecords(payload: unknown): RawFccRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is RawFccRecord => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const object = payload as Record<string, unknown>;
  for (const key of ["results", "fccidInfo", "fCCIDInfoes", "fccIdInfoes"]) {
    const candidate = object[key];
    if (Array.isArray(candidate)) return candidate.filter((item): item is RawFccRecord => !!item && typeof item === "object");
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      const rows = nested.fccidInfo || nested.fCCIDInfo;
      if (Array.isArray(rows)) return rows.filter((item): item is RawFccRecord => !!item && typeof item === "object");
      if (rows && typeof rows === "object") return [rows as RawFccRecord];
    }
  }
  return [];
}

export function normalizeFccRecord(raw: RawFccRecord, retrievedAt: string, options: { confirmedCodes?: string[]; sourceMode?: NormalizedFccRecord["sourceMode"]; snapshotCapturedAt?: string } = {}): NormalizedFccRecord | null {
  const fccId = text(raw, "fccid", "fccId", "FCCId", "FCCID");
  if (!fccId) return null;
  const normalizedId = normalizeFccScope(fccId);
  const parts = fccIdParts(normalizedId, options.confirmedCodes);
  const applicationPurpose = text(raw, "applicationPurpose", "application_purpose");
  return {
    source: "FCC",
    fccId: normalizedId,
    ...parts,
    granteeName: text(raw, "grantee", "granteeName"),
    authorizationDate: isoFccDate(text(raw, "grantDate", "grant_date", "statusDate")),
    applicationPurpose,
    purposeCategory: categorizeFccPurpose(applicationPurpose),
    address: cleanFccDisplayValue(text(raw, "address", "mailingAddress")),
    city: cleanFccDisplayValue(text(raw, "city")),
    state: cleanFccDisplayValue(text(raw, "state")),
    country: cleanFccDisplayValue(text(raw, "country")),
    zipCode: cleanFccDisplayValue(text(raw, "zipCode", "zip_code")),
    sourceUrl: `${FCC_EAS_API}?fccId=${encodeURIComponent(normalizedId)}`,
    retrievedAt,
    sourceMode: options.sourceMode,
    snapshotCapturedAt: options.snapshotCapturedAt,
    raw,
  };
}

export function fccLocation(record: NormalizedFccRecord) {
  return [record.city, record.state, record.country].map(cleanFccDisplayValue).filter(Boolean).join(", ") || "—";
}

export function uniqueFccRecords(records: NormalizedFccRecord[]) {
  const unique = new Map<string, NormalizedFccRecord>();
  records.forEach((record) => {
    const key = [record.fccId, record.authorizationDate, record.applicationPurpose].join("|");
    if (!unique.has(key)) unique.set(key, record);
  });
  return [...unique.values()];
}

export function groupFccRecordsByGrantee(records: NormalizedFccRecord[]) {
  const groups = new Map<string, NormalizedFccRecord[]>();
  for (const record of records) {
    const key = record.granteeCode || record.granteeName || "Unidentified grantee";
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    granteeCode: items[0]?.granteeCode,
    granteeName: items[0]?.granteeName,
    records: items.sort((a, b) => (b.authorizationDate || "").localeCompare(a.authorizationDate || "")),
    fccIds: new Set(items.map((record) => record.fccId)).size,
    latestAuthorization: items.reduce<string | undefined>((latest, record) => !latest || (record.authorizationDate || "") > latest ? record.authorizationDate : latest, undefined),
  })).sort((a, b) => (b.latestAuthorization || "").localeCompare(a.latestAuthorization || ""));
}

export function fccRecordsInWindow(records: NormalizedFccRecord[], cutoff: string) {
  return records
    .filter((record) => !!record.authorizationDate && record.authorizationDate >= cutoff)
    .sort((a, b) => (b.authorizationDate || "").localeCompare(a.authorizationDate || ""));
}
