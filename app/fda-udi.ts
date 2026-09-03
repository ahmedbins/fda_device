import {
  type CodeMatchMode,
  type ExplorerFilters,
  type RecordItem,
  type RecordSort,
  companyName,
  matchingProducts,
  normalizeCode,
  normalizeCodes,
  quote,
  recordProductCodes,
} from "./fda-shared.ts";

/**
 * openFDA's Unique Device Identification dataset (FDA GUDID). One result is
 * one device record published by a labeler: a primary device identifier
 * (usually a GS1 GTIN), optional package identifiers, the product codes the
 * device is classified under, and the premarket submissions the labeler
 * declared. Unlike a registration listing, one device record routinely
 * carries several product codes — a hearing aid with a tinnitus masker is
 * filed under OSM and KLW at once — so "all selected codes" is meaningful per
 * device here.
 */
export const UDI_API = "https://api.fda.gov/device/udi.json";
export const UDI_PREMARKET_EXISTS = "_exists_:premarket_submissions.submission_number";
export const UDI_PM_EXEMPT = "is_pm_exempt:true";

export type UdiRaw = {
  public_device_record_key?: string;
  brand_name?: string;
  version_or_model_number?: string;
  catalog_number?: string;
  company_name?: string;
  labeler_duns_number?: string;
  device_description?: string;
  identifiers?: {
    id?: string;
    type?: string;
    issuing_agency?: string;
    unit_of_use_id?: string;
    quantity_per_package?: string;
    package_status?: string;
    package_type?: string;
    package_discontinue_date?: string;
  }[] | null;
  product_codes?: {
    code?: string;
    name?: string;
    openfda?: { device_name?: string; device_class?: string; regulation_number?: string; medical_specialty_description?: string };
  }[] | null;
  premarket_submissions?: { submission_number?: string; supplement_number?: string; submission_type?: string }[] | null;
  gmdn_terms?: { code?: string; name?: string; definition?: string }[] | null;
  customer_contacts?: { phone?: string; email?: string }[] | null;
  sterilization?: { is_sterile?: string; is_sterilization_prior_use?: string; sterilization_methods?: string } | null;
  publish_date?: string;
  public_version_date?: string;
  public_version_number?: string;
  public_version_status?: string;
  record_status?: string;
  commercial_distribution_status?: string;
  commercial_distribution_end_date?: string | null;
  is_rx?: string | boolean;
  is_otc?: string | boolean;
  is_single_use?: string | boolean;
  is_kit?: string | boolean;
  is_combination_product?: string | boolean;
  is_pm_exempt?: string | boolean;
  is_direct_marking_exempt?: string | boolean;
  is_hct_p?: string | boolean;
  has_lot_or_batch_number?: string | boolean;
  has_serial_number?: string | boolean;
  has_expiration_date?: string | boolean;
  has_manufacturing_date?: string | boolean;
  mri_safety?: string;
  device_count_in_base_package?: string;
};

export type UdiIdentifier = {
  id: string;
  type: string;
  agency: string;
  unitOfUseId: string;
  quantityPerPackage: string;
  packageStatus: string;
  packageType: string;
  packageDiscontinued: string;
};

export type UdiCode = { code: string; name: string; deviceClass: string; regulation: string; specialty: string };
export type UdiPremarket = { number: string; supplement: string; type: string };

export type UdiDevice = {
  key: string;
  brand: string;
  model: string;
  catalog: string;
  company: string;
  duns: string;
  description: string;
  primaryDi: string;
  primaryAgency: string;
  identifiers: UdiIdentifier[];
  codes: UdiCode[];
  codeList: string[];
  premarket: UdiPremarket[];
  pmExempt: boolean;
  rx: boolean;
  otc: boolean;
  singleUse: boolean;
  kit: boolean;
  combination: boolean;
  sterile: boolean;
  sterilizePriorUse: boolean;
  mri: string;
  lot: boolean;
  serial: boolean;
  expiration: boolean;
  manufacturingDate: boolean;
  directMarkingExempt: boolean;
  hctP: boolean;
  publishDate: string;
  versionDate: string;
  versionNumber: string;
  recordStatus: string;
  distributionStatus: string;
  distributionEnd: string;
  baseCount: string;
  gmdn: { code: string; name: string; definition: string }[];
  contacts: { phone: string; email: string }[];
  raw: UdiRaw;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
/** GUDID booleans arrive as the strings "true"/"false" (and as 1/0 in count queries). */
export const udiFlag = (value: unknown) => value === true || value === 1 || /^(true|1|yes)$/i.test(text(value));

export function normalizeUdi(raw: UdiRaw): UdiDevice {
  const identifiers: UdiIdentifier[] = (raw.identifiers || []).map((entry) => ({
    id: text(entry?.id),
    type: text(entry?.type),
    agency: text(entry?.issuing_agency),
    unitOfUseId: text(entry?.unit_of_use_id),
    quantityPerPackage: text(entry?.quantity_per_package),
    packageStatus: text(entry?.package_status),
    packageType: text(entry?.package_type),
    packageDiscontinued: text(entry?.package_discontinue_date),
  })).filter((entry) => entry.id);
  const primary = identifiers.find((entry) => /primary/i.test(entry.type)) || identifiers[0];
  const codes: UdiCode[] = (raw.product_codes || [])
    .map((entry) => ({
      code: normalizeCode(entry?.code),
      name: text(entry?.openfda?.device_name) || text(entry?.name),
      deviceClass: text(entry?.openfda?.device_class),
      regulation: text(entry?.openfda?.regulation_number),
      specialty: text(entry?.openfda?.medical_specialty_description),
    }))
    .filter((entry) => entry.code);
  const premarket: UdiPremarket[] = (raw.premarket_submissions || [])
    .map((entry) => ({ number: normalizeCode(entry?.submission_number), supplement: text(entry?.supplement_number), type: text(entry?.submission_type) }))
    .filter((entry) => entry.number);
  const brand = text(raw.brand_name);
  const model = text(raw.version_or_model_number);
  return {
    key: text(raw.public_device_record_key) || primary?.id || `${brand}|${model}|${text(raw.company_name)}`,
    brand,
    model,
    catalog: text(raw.catalog_number),
    company: text(raw.company_name),
    duns: text(raw.labeler_duns_number),
    description: text(raw.device_description),
    primaryDi: primary?.id || "",
    primaryAgency: primary?.agency || "",
    identifiers,
    codes,
    codeList: [...new Set(codes.map((entry) => entry.code))],
    premarket,
    pmExempt: udiFlag(raw.is_pm_exempt),
    rx: udiFlag(raw.is_rx),
    otc: udiFlag(raw.is_otc),
    singleUse: udiFlag(raw.is_single_use),
    kit: udiFlag(raw.is_kit),
    combination: udiFlag(raw.is_combination_product),
    sterile: udiFlag(raw.sterilization?.is_sterile),
    sterilizePriorUse: udiFlag(raw.sterilization?.is_sterilization_prior_use),
    mri: text(raw.mri_safety),
    lot: udiFlag(raw.has_lot_or_batch_number),
    serial: udiFlag(raw.has_serial_number),
    expiration: udiFlag(raw.has_expiration_date),
    manufacturingDate: udiFlag(raw.has_manufacturing_date),
    directMarkingExempt: udiFlag(raw.is_direct_marking_exempt),
    hctP: udiFlag(raw.is_hct_p),
    publishDate: text(raw.publish_date),
    versionDate: text(raw.public_version_date),
    versionNumber: text(raw.public_version_number),
    recordStatus: text(raw.record_status),
    distributionStatus: text(raw.commercial_distribution_status),
    distributionEnd: text(raw.commercial_distribution_end_date),
    baseCount: text(raw.device_count_in_base_package),
    gmdn: (raw.gmdn_terms || []).map((entry) => ({ code: text(entry?.code), name: text(entry?.name), definition: text(entry?.definition) })).filter((entry) => entry.name),
    contacts: (raw.customer_contacts || []).map((entry) => ({ phone: text(entry?.phone), email: text(entry?.email) })).filter((entry) => entry.phone || entry.email),
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Query building                                                       */
/* ------------------------------------------------------------------ */

/** Product-code clause for device records. ALL is device-level here: every code on the same GUDID record. */
export function udiCodesClause(codes: readonly string[], mode: CodeMatchMode) {
  const quoted = normalizeCodes(codes).map(quote);
  if (!quoted.length) return "";
  if (quoted.length === 1) return `product_codes.code:${quoted[0]}`;
  if (mode === "all") return `(${quoted.map((code) => `product_codes.code:${code}`).join(" AND ")})`;
  return `product_codes.code:(${quoted.join(" OR ")})`;
}

/** Filters the GUDID dataset cannot express; the UI says so rather than silently dropping them. */
export function udiIgnoredFilters(filters: ExplorerFilters) {
  const ignored: string[] = [];
  if (filters.country.trim()) ignored.push("country");
  if (filters.state.trim()) ignored.push("state / region");
  if (filters.establishment) ignored.push("establishment role");
  return ignored;
}

export function buildUdiSearch(filters: ExplorerFilters) {
  const clauses: string[] = [];
  if (filters.keyword.trim()) {
    const value = quote(filters.keyword);
    clauses.push(`(company_name:${value} OR brand_name:${value} OR version_or_model_number:${value} OR device_description:${value})`);
  }
  const codes = udiCodesClause(filters.productCodes, filters.codeMatch);
  if (codes) clauses.push(codes);
  if (filters.deviceClass) clauses.push(`product_codes.openfda.device_class:${quote(filters.deviceClass)}`);
  return clauses.join(" AND ");
}

/* ------------------------------------------------------------------ */
/* Labeler groups and aliases                                           */
/* ------------------------------------------------------------------ */

/**
 * GUDID labelers file under their own legal or brand entity, so one FDA
 * registration owner/operator can stand behind several labeler names. These
 * groups are maintained in the app from public ownership information — they
 * are not an FDA relationship — and every labeler name here was verified to
 * exist in the openFDA UDI dataset (2026-09-02). The UI says so wherever a
 * group is used.
 */
export type LabelerGroup = { group: string; owners: string[]; labelers: string[]; note: string };

export const UDI_LABELER_GROUPS: LabelerGroup[] = [
  {
    group: "Demant",
    owners: ["DEMANT A/S", "William Demant"],
    labelers: ["Oticon A/S", "Sbo Hearing A/S", "Bernafon AG", "Sonic Innovations, Inc."],
    note: "Oticon, Bernafon and Sonic (and the shared SBO Hearing entity) are Demant hearing-aid brands.",
  },
  {
    group: "Sonova",
    owners: ["Sonova AG", "Sonova Consumer Hearing GmbH"],
    labelers: ["Sonova AG", "Phonak AG", "Unitron Hearing Division", "Unitron Hearing Ltd", "Hansaton Akustik GmbH", "Advanced Bionics, LLC", "Advanced Bionics AG", "Advanced Bionics Corporation"],
    note: "Phonak, Unitron, Hansaton and Advanced Bionics are Sonova companies.",
  },
  {
    group: "WS Audiology",
    owners: ["WS Audiology USA, Inc.", "WSAUD A/S", "WS Audiology A/S", "Sivantos"],
    labelers: ["Ws Audiology Usa, Inc.", "Widex A/S"],
    note: "Widex and the former Sivantos/Signia business merged into WS Audiology.",
  },
  {
    group: "GN",
    owners: ["GN Hearing A/S", "GN Consumer Hearing Corporation"],
    labelers: ["Gn Hearing A/S"],
    note: "GN Hearing (ReSound, Beltone) and GN Consumer Hearing (Jabra) share the GN Hearing labeler in GUDID.",
  },
  {
    group: "Cochlear",
    owners: ["COCHLEAR AMERICAS", "Cochlear Limited"],
    labelers: ["COCHLEAR LIMITED", "Cochlear Bone Anchored Solutions AB", "Cochlear Americas Corporation"],
    note: "Cochlear Americas registers in the US; devices are labeled by Cochlear Limited and Cochlear Bone Anchored Solutions.",
  },
  {
    group: "Persona Medical",
    owners: ["Magnatone Hearing Aid Corp. dba Persona Medical"],
    labelers: ["Persona Medical"],
    note: "Magnatone Hearing Aid Corp. trades as Persona Medical.",
  },
  {
    group: "hearX",
    owners: ["hearX", "HEARX SA"],
    labelers: ["HEARX GROUP (PTY) LTD"],
    note: "hearX (Lexie) labels under HEARX GROUP (PTY) LTD.",
  },
  {
    group: "Xiamen New Sound",
    owners: ["Xiamen NewSound Technology Co., Ltd"],
    labelers: ["Xiamen New Sound Technology Co., Ltd."],
    note: "Same company; the registration spells NewSound as one word.",
  },
  {
    group: "Tomore",
    owners: ["Tomore Medical (Shenzhen) Co., Ltd"],
    labelers: ["Tomore Medical (Shenzhen) Co., Ltd", "Tomore Healthcare (Dongguan) Co.,Ltd."],
    note: "Tomore Medical and Tomore Healthcare label under two entities.",
  },
];

/** Case-, punctuation- and whitespace-insensitive key for a company or labeler name. */
export function normalizeLabeler(name: string) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(a: string, b: string) {
  const x = normalizeLabeler(a);
  const y = normalizeLabeler(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = shorter === x ? y : x;
  return shorter.length >= 5 && longer.includes(shorter);
}

/** The app-maintained group a registration owner or GUDID labeler belongs to, if any. */
export function labelerGroupFor(name: string): LabelerGroup | null {
  const value = String(name ?? "").trim();
  if (!value) return null;
  return UDI_LABELER_GROUPS.find((group) => group.owners.some((owner) => namesMatch(owner, value)) || group.labelers.some((labeler) => namesMatch(labeler, value))) || null;
}

/** Every labeler name worth querying for a company: the names themselves, their group's labelers, and user-added aliases; de-duplicated, order preserved. */
export function labelersFor(names: readonly string[], extra: readonly string[] = []) {
  const out: string[] = [];
  const push = (name: string) => {
    const value = String(name ?? "").trim();
    if (value && !out.some((existing) => normalizeLabeler(existing) === normalizeLabeler(value))) out.push(value);
  };
  names.forEach(push);
  names.forEach((name) => labelerGroupFor(name)?.labelers.forEach(push));
  extra.forEach(push);
  return out;
}

export const UDI_ALIASES_KEY = "fda-udi-labeler-aliases";

/** User-added labeler names per company, keyed by the normalized company name. */
export function parseUdiAliases(raw: string | null): Record<string, string[]> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      const names = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
      if (key && names.length) out[key] = names;
    });
    return out;
  } catch {
    return {};
  }
}

/** Devices one labeler — or every labeler in a group — published under the selected codes. `extra` appends e.g. the premarket-exists clause. */
export function udiCompanySearch(company: string | readonly string[], codes: readonly string[], mode: CodeMatchMode, extra = "") {
  const names = (typeof company === "string" ? [company] : [...company]).map((name) => name.trim()).filter(Boolean);
  const quoted = names.map(quote);
  const clauses = [quoted.length === 1 ? `company_name:${quoted[0]}` : `company_name:(${quoted.join(" OR ")})`];
  const codeClause = udiCodesClause(codes, mode);
  if (codeClause) clauses.push(codeClause);
  if (extra) clauses.push(extra);
  return clauses.join(" AND ");
}

/** Codes a registration listing carries that matter for the current filters (matching products first, else every code on it). */
export function listingCodesForUdi(item: RecordItem, filters: ExplorerFilters) {
  const matched = normalizeCodes(matchingProducts(item, filters).map((product) => product.product_code));
  return matched.length ? matched : [...recordProductCodes(item)];
}

/** GUDID devices for the company behind a registration listing, under that listing's codes. */
export function udiListingSearch(item: RecordItem, filters: ExplorerFilters) {
  return udiCompanySearch(companyName(item), listingCodesForUdi(item, filters), "any");
}

export function udiDeviceHasCodes(device: UdiDevice, codes: readonly string[], mode: CodeMatchMode) {
  const selected = normalizeCodes(codes);
  if (!selected.length) return true;
  const present = new Set(device.codeList);
  return mode === "all" ? selected.every((code) => present.has(code)) : selected.some((code) => present.has(code));
}

export type UdiSummary = {
  total: number;
  withAll: number;
  withPremarket: number;
  withAllPremarket: number;
  pmExempt: number;
  withAllExempt: number;
};

/** Counts over a set of devices already in hand (the panel uses server counts for the full answer). */
export function udiSummary(devices: readonly UdiDevice[], codes: readonly string[]): UdiSummary {
  const selected = normalizeCodes(codes);
  const all = selected.length > 1 ? devices.filter((device) => udiDeviceHasCodes(device, selected, "all")) : devices;
  return {
    total: devices.length,
    withAll: all.length,
    withPremarket: devices.filter((device) => device.premarket.length > 0).length,
    withAllPremarket: all.filter((device) => device.premarket.length > 0).length,
    pmExempt: devices.filter((device) => device.pmExempt).length,
    withAllExempt: all.filter((device) => device.pmExempt).length,
  };
}

export function udiSortParam(sort: RecordSort) {
  if (sort === "newest") return "publish_date:desc";
  if (sort === "oldest") return "publish_date:asc";
  return "";
}

export const UDI_SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: "relevance", label: "openFDA order" },
  { value: "newest", label: "Newest published first" },
  { value: "oldest", label: "Oldest published first" },
];

export function accessGudidUrl(primaryDi: string) {
  const di = text(primaryDi);
  return di ? `https://accessgudid.nlm.nih.gov/devices/${encodeURIComponent(di)}` : "";
}

/* ------------------------------------------------------------------ */
/* Premarket gap report                                                 */
/* ------------------------------------------------------------------ */

/** Rows per workbook. openFDA pages 1,000 per call, so this is at most ten calls per set. */
export const PREMARKET_GAP_CAP = 10000;

export type PremarketGapRow = {
  labeler: string;
  brand: string;
  model: string;
  catalog: string;
  primaryDi: string;
  codes: string;
  carriesAll: string;
  premarket: string;
  pmExempt: string;
  rxOtc: string;
  published: string;
  recordStatus: string;
  distribution: string;
  gmdn: string;
};

export const PREMARKET_GAP_COLUMNS: { key: keyof PremarketGapRow; header: string; width: number }[] = [
  { key: "labeler", header: "Labeler", width: 26 },
  { key: "brand", header: "Brand", width: 20 },
  { key: "model", header: "Version / model", width: 24 },
  { key: "catalog", header: "Catalog #", width: 16 },
  { key: "primaryDi", header: "Primary DI (GTIN)", width: 18 },
  { key: "codes", header: "Product codes", width: 16 },
  { key: "carriesAll", header: "Carries every selected code", width: 16 },
  { key: "premarket", header: "Premarket submission", width: 22 },
  { key: "pmExempt", header: "Premarket exempt", width: 14 },
  { key: "rxOtc", header: "Rx / OTC", width: 10 },
  { key: "published", header: "Published", width: 12 },
  { key: "recordStatus", header: "Record status", width: 14 },
  { key: "distribution", header: "Commercial distribution", width: 22 },
  { key: "gmdn", header: "GMDN", width: 30 },
];

/**
 * One row per device for the premarket gap workbook: devices carrying every
 * selected code first, then those without a submission number, then by
 * brand — so the question "which OSM + KLW devices cite no 510(k)?" is the
 * top of the sheet.
 */
export function premarketGapRows(devices: readonly UdiDevice[], codes: readonly string[]): PremarketGapRow[] {
  const selected = normalizeCodes(codes);
  const rows = devices.map((device) => {
    const carriesAll = selected.length ? udiDeviceHasCodes(device, selected, "all") : true;
    return {
      row: {
        labeler: device.company,
        brand: device.brand,
        model: device.model,
        catalog: device.catalog,
        primaryDi: device.primaryDi,
        codes: device.codeList.join("; "),
        carriesAll: carriesAll ? "Yes" : "No",
        premarket: device.premarket.length ? udiPremarketLabel(device) : "None listed",
        pmExempt: device.pmExempt ? "Yes" : "No",
        rxOtc: device.rx ? "Rx" : device.otc ? "OTC" : "",
        published: device.publishDate,
        recordStatus: device.recordStatus,
        distribution: [device.distributionStatus, device.distributionEnd ? `ended ${device.distributionEnd}` : ""].filter(Boolean).join(" · "),
        gmdn: device.gmdn.map((term) => term.name).join("; "),
      } satisfies PremarketGapRow,
      carriesAll,
      missing: device.premarket.length === 0,
    };
  });
  rows.sort((a, b) => Number(b.carriesAll) - Number(a.carriesAll) || Number(b.missing) - Number(a.missing) || a.row.brand.localeCompare(b.row.brand) || a.row.model.localeCompare(b.row.model));
  return rows.map((entry) => entry.row);
}

export function udiPremarketLabel(device: UdiDevice) {
  return device.premarket.map((entry) => (entry.supplement && entry.supplement !== "000" ? `${entry.number}/S${entry.supplement}` : entry.number)).join("; ");
}

/** Registration-listing query for the labeler behind a device, under that device's codes — the cross-reference back to the FDA registration side. */
export function listingSearchForDevice(device: UdiDevice, codes: readonly string[] = device.codeList) {
  const clauses = [`registration.owner_operator.firm_name:${quote(device.company)}`];
  const quoted = normalizeCodes(codes).map(quote);
  if (quoted.length === 1) clauses.push(`products.product_code:${quoted[0]}`);
  else if (quoted.length) clauses.push(`products.product_code:(${quoted.join(" OR ")})`);
  return clauses.join(" AND ");
}
