export const MDALL_API = "https://health-products.canada.ca/api/medical-devices";
export const MDALL_SEARCH_URL = "https://health-products.canada.ca/mdall-limh/prepareSearch?type=active";
export const MDALL_ARCHIVED_SEARCH_URL = "https://health-products.canada.ca/mdall-limh/prepareSearch?type=archived";
export const MDALL_HOME_URL = "https://health-products.canada.ca/mdall-limh/";
export const MDALL_DOCS_URL = "https://health-products.canada.ca/api/documentation/mdall-documentation-en.html";
export const MDALL_SOURCE_LABEL = "Health Canada Medical Devices Active Licence Listing";

export type MdallLicenceState = "active" | "archived" | "both";
export type MdallSearchMode = "auto" | "company" | "licence" | "licenceNumber" | "device" | "identifier";

export type RawMdallRecord = Record<string, unknown>;

export type MdallCompany = {
  companyId: number;
  companyName: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  companyStatus?: string;
  sourceUrl: string;
  raw: RawMdallRecord;
};

export type MdallDevice = {
  licenceNumber: number;
  deviceId: number;
  tradeName: string;
  firstLicensedAt?: string;
  endDate?: string;
  identifiers: string[];
  raw: RawMdallRecord;
};

export type MdallLicence = {
  source: "HC";
  licenceNumber: number;
  licenceName: string;
  licenceStatus: string;
  licenceStatusLabel: string;
  riskClass?: number;
  riskClassLabel: string;
  licenceType?: string;
  licenceTypeCode?: string;
  issuedAt?: string;
  endDate?: string;
  lastRefreshAt?: string;
  companyId?: number;
  companyName?: string;
  company?: MdallCompany;
  devices?: MdallDevice[];
  state: "active" | "archived";
  sourceUrl: string;
  retrievedAt: string;
  raw: RawMdallRecord;
};

export type MdallSearchResult = {
  licences: MdallLicence[];
  companies: MdallCompany[];
  retrievedAt: string;
  lastRefreshAt?: string;
  resolved: boolean;
  notes: string[];
};

const LICENCE_STATUS: Record<string, string> = {
  C: "Cancelled",
  D: "Issued / conditional",
  I: "Issued / active",
  M: "Merged",
  O: "Discontinued at renewal",
  P: "Pending signature",
  R: "Cancelled — no renewal response",
  S: "Suspended",
  W: "Withdrawn",
  Q: "Suspended — invalid QS certification",
  X: "Cancelled QS/2003",
};

function text(raw: RawMdallRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function number(raw: RawMdallRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

export function isoMdallDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

export function mdallStatusLabel(code?: string) {
  if (!code) return "Unknown status";
  return LICENCE_STATUS[code.toUpperCase()] || code;
}

export function mdallRiskClassLabel(value?: number) {
  if (value === 2) return "Class II";
  if (value === 3) return "Class III";
  if (value === 4) return "Class IV";
  return value ? `Class ${value}` : "Class not stated";
}

export function mdallSearchUrl(state: MdallLicenceState = "active") {
  return state === "archived" ? MDALL_ARCHIVED_SEARCH_URL : MDALL_SEARCH_URL;
}

export function asMdallList<T extends RawMdallRecord>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload.filter((item): item is T => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as RawMdallRecord;
  const licenceNo = number(raw, "original_licence_no");
  const companyId = number(raw, "company_id");
  const deviceId = number(raw, "device_id");
  if ((licenceNo !== undefined && licenceNo <= 0) && !text(raw, "licence_name", "trade_name", "company_name", "device_identifier")) return [];
  if ((deviceId !== undefined && deviceId <= 0) && !text(raw, "trade_name", "device_identifier")) return [];
  if ((companyId !== undefined && companyId <= 0) && !text(raw, "company_name")) return [];
  return [raw as T];
}

export function normalizeMdallCompany(raw: RawMdallRecord): MdallCompany | null {
  const companyId = number(raw, "company_id");
  const companyName = text(raw, "company_name");
  if (!companyId || !companyName) return null;
  const address = [text(raw, "addr_line_1"), text(raw, "addr_line_2"), text(raw, "addr_line_3")].filter(Boolean).join(", ");
  return {
    companyId,
    companyName,
    address: address || undefined,
    city: text(raw, "city"),
    region: text(raw, "region_cd"),
    country: text(raw, "country_cd"),
    postalCode: text(raw, "postal_code"),
    companyStatus: text(raw, "company_status"),
    sourceUrl: `${MDALL_API}/company/?id=${companyId}&type=json`,
    raw,
  };
}

export function normalizeMdallDevice(raw: RawMdallRecord): MdallDevice | null {
  const licenceNumber = number(raw, "original_licence_no");
  const deviceId = number(raw, "device_id");
  const tradeName = text(raw, "trade_name");
  if (!licenceNumber || !deviceId || !tradeName) return null;
  return {
    licenceNumber,
    deviceId,
    tradeName,
    firstLicensedAt: isoMdallDate(text(raw, "first_licence_dt")),
    endDate: isoMdallDate(text(raw, "end_date")),
    identifiers: [],
    raw,
  };
}

export function normalizeMdallLicence(raw: RawMdallRecord, retrievedAt: string, company?: MdallCompany): MdallLicence | null {
  const licenceNumber = number(raw, "original_licence_no");
  const licenceName = text(raw, "licence_name");
  if (!licenceNumber || !licenceName) return null;
  const endDate = isoMdallDate(text(raw, "end_date"));
  const licenceStatus = text(raw, "licence_status") || "";
  const riskClass = number(raw, "appl_risk_class");
  return {
    source: "HC",
    licenceNumber,
    licenceName,
    licenceStatus,
    licenceStatusLabel: mdallStatusLabel(licenceStatus),
    riskClass,
    riskClassLabel: mdallRiskClassLabel(riskClass),
    licenceType: text(raw, "licence_type_desc"),
    licenceTypeCode: text(raw, "licence_type_cd"),
    issuedAt: isoMdallDate(text(raw, "first_licence_status_dt")),
    endDate,
    lastRefreshAt: isoMdallDate(text(raw, "last_refresh_dt")),
    companyId: number(raw, "company_id"),
    companyName: company?.companyName,
    company,
    state: endDate ? "archived" : "active",
    sourceUrl: `${MDALL_API}/licence/?id=${licenceNumber}&lang=en&type=json`,
    retrievedAt,
    raw,
  };
}

export function mdallLocation(company?: MdallCompany | null) {
  if (!company) return "—";
  return [company.city, company.region, company.country].filter(Boolean).join(", ") || "—";
}

export function uniqueMdallLicences(licences: MdallLicence[]) {
  const unique = new Map<string, MdallLicence>();
  for (const licence of licences) {
    const key = [licence.licenceNumber, licence.licenceStatus, licence.endDate || ""].join("|");
    const current = unique.get(key);
    if (!current || (!current.company && licence.company)) unique.set(key, licence);
  }
  return [...unique.values()];
}

export function groupMdallLicencesByCompany(licences: MdallLicence[]) {
  const groups = new Map<string, MdallLicence[]>();
  for (const licence of licences) {
    const key = String(licence.companyId || licence.companyName || "Unidentified company");
    groups.set(key, [...(groups.get(key) || []), licence]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    companyId: items[0]?.companyId,
    companyName: items[0]?.companyName || items[0]?.company?.companyName || "Unidentified company",
    company: items[0]?.company,
    licences: items.sort((a, b) => (b.issuedAt || "").localeCompare(a.issuedAt || "")),
    licenceCount: items.length,
    latestIssued: items.reduce<string | undefined>((latest, licence) => !latest || (licence.issuedAt || "") > latest ? licence.issuedAt : latest, undefined),
  })).sort((a, b) => (b.latestIssued || "").localeCompare(a.latestIssued || ""));
}

export function mdallLicencesInWindow(licences: MdallLicence[], cutoff: string, field: "issuedAt" | "endDate" = "issuedAt") {
  return licences
    .filter((licence) => {
      const value = licence[field];
      return !!value && value >= cutoff;
    })
    .sort((a, b) => ((b[field] || "").localeCompare(a[field] || "")));
}

export function parseMdallQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function looksLikeMdallNumber(value: string) {
  return /^\d{3,8}$/.test(value.trim());
}

export function deviceSearchTokens(name: string) {
  const stop = new Set(["THE", "AND", "FOR", "WITH", "FROM", "SYSTEM", "SYSTEMS", "DEVICE", "DEVICES", "FAMILY", "UNKNOWN"]);
  return [...new Set(
    name
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length >= 4 && !stop.has(token)),
  )];
}

export function mdallSourcePresentation(retrieved = false) {
  if (!retrieved) return { status: "MDALL SOURCE READY", note: "Ready for Health Canada licence search" };
  return { status: "HEALTH CANADA MDALL LIVE", note: "Official MDALL API response" };
}
