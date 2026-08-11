export const FCC_EAS_API = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
export const FCC_SEARCH_URL = "https://www.fcc.gov/oet/ea/fccid";
export const FCC_SOURCE_LABEL = "FCC Equipment Authorization System";

export type RawFccRecord = Record<string, unknown>;

export type NormalizedFccRecord = {
  source: "FCC";
  fccId: string;
  granteeName?: string;
  authorizationDate?: string;
  applicationPurpose?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  sourceUrl: string;
  retrievedAt: string;
  raw: RawFccRecord;
};

function text(raw: RawFccRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
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

export function normalizeFccRecord(raw: RawFccRecord, retrievedAt: string): NormalizedFccRecord | null {
  const fccId = text(raw, "fccid", "fccId", "FCCId", "FCCID");
  if (!fccId) return null;
  return {
    source: "FCC",
    fccId: normalizeFccScope(fccId),
    granteeName: text(raw, "grantee", "granteeName"),
    authorizationDate: isoFccDate(text(raw, "grantDate", "grant_date", "statusDate")),
    applicationPurpose: text(raw, "applicationPurpose", "application_purpose"),
    address: text(raw, "address", "mailingAddress"),
    city: text(raw, "city"),
    state: text(raw, "state"),
    country: text(raw, "country"),
    zipCode: text(raw, "zipCode", "zip_code"),
    sourceUrl: FCC_SEARCH_URL,
    retrievedAt,
    raw,
  };
}

export function fccLocation(record: NormalizedFccRecord) {
  return [record.city, record.state, record.country].filter(Boolean).join(", ") || "—";
}

export function uniqueFccRecords(records: NormalizedFccRecord[]) {
  const unique = new Map<string, NormalizedFccRecord>();
  records.forEach((record) => {
    const key = [record.fccId, record.authorizationDate, record.applicationPurpose].join("|");
    if (!unique.has(key)) unique.set(key, record);
  });
  return [...unique.values()];
}

export function fccRecordsInWindow(records: NormalizedFccRecord[], cutoff: string) {
  return records
    .filter((record) => !!record.authorizationDate && record.authorizationDate >= cutoff)
    .sort((a, b) => (b.authorizationDate || "").localeCompare(a.authorizationDate || ""));
}
