"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Barcode,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Columns3,
  Database,
  Ear,
  ExternalLink,
  Filter,
  History,
  Link2,
  ListFilter,
  LoaderCircle,
  MapPin,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  API,
  CODE_MATCH_MODES,
  CODE_NAMES,
  EMPTY_FILTERS,
  EXPORT_CAP,
  MATRIX_FETCH_CAP,
  MATRIX_NUMERIC_KEYS,
  MATRIX_SORT_PRESETS,
  PRESET,
  PRESET_CODES,
  RECENT_SEARCHES_KEY,
  RECORD_SORT_OPTIONS,
  type CodeInfo,
  type CodeMatchMode,
  type ExplorerFilters as Filters,
  type ExplorerView as ViewMode,
  type MatrixRow,
  type MatrixSort,
  type MatrixSortKey,
  type OpenFdaMeta,
  type RecentSearch,
  type RecordItem,
  type RecordSort,
  type SortDir,
  asRecordSort,
  buildMatrix,
  buildSearch,
  codeMatchApplies,
  companyCodeCoverage,
  companyName,
  fdaPremarketUrl,
  fdaProductCodeUrl,
  fetchCodeInfo,
  fetchListingPages,
  fetchOpenFda,
  filtersFromParams,
  filtersToParams,
  firmName,
  listedDeviceNames,
  locationSummary,
  matchingProducts,
  matrixCompanyCount,
  normalizeCodes,
  parseCodes,
  parseRecentSearches,
  pendingFilterChanges,
  premarketSummary,
  productCodeClause,
  productFilterActive,
  recordSortParam,
  rememberSearch,
  sortMatrixBy,
} from "./fda-shared";
import {
  UDI_ALIASES_KEY,
  UDI_API,
  UDI_SORT_OPTIONS,
  type UdiDevice,
  type UdiRaw,
  accessGudidUrl,
  buildUdiSearch,
  listingCodesForUdi,
  normalizeLabeler,
  normalizeUdi,
  parseUdiAliases,
  udiIgnoredFilters,
  udiPremarketLabel,
  udiSortParam,
} from "./fda-udi";
import { UdiCompanyPanel, UdiDeviceDetail } from "./fda-udi-panel";
import SourceNav from "./source-nav";
import { HeaderCell, type HeaderSpec } from "./explorer-tools";
import { downloadExcel, type ExcelValue } from "./excel-export";
import { ExportDialog, sanitizeExportFilename } from "./export-dialog";

type CountryOption = { code: string; count: number; name: string };
type RecordColumn = "establishment" | "ownerOperator" | "primaryDevice" | "productCodes" | "listedProducts" | "tradeNames" | "location" | "listed" | "deviceClass" | "premarket" | "expiry" | "registrationNumber" | "feiNumber";
type MatrixColumn = "productCode" | "deviceType" | "company" | "coverage" | "listedDeviceCount" | "registeredDevices" | "registrations" | "productListings" | "establishments" | "deviceClass" | "specialty" | "countries" | "latestListing";
type UdiColumn = "company" | "brand" | "model" | "primaryDi" | "codes" | "premarket" | "rxOtc" | "published" | "status" | "description" | "gmdn" | "catalog" | "identifiers";

const RECORD_COLUMN_OPTIONS: { key: RecordColumn; label: string; hint: string }[] = [
  { key: "establishment", label: "Establishment", hint: "Registered facility name" },
  { key: "ownerOperator", label: "Owner / operator", hint: "Parent company or legal operator" },
  { key: "primaryDevice", label: "Primary device", hint: "First matching FDA device type" },
  { key: "productCodes", label: "Product codes", hint: "Matching FDA product codes" },
  { key: "listedProducts", label: "Listed products", hint: "Matching product entries on the record" },
  { key: "tradeNames", label: "Trade names", hint: "Proprietary device names" },
  { key: "location", label: "Location", hint: "City, state and country" },
  { key: "listed", label: "Listed", hint: "Date the matching product entry was created — sortable" },
  { key: "deviceClass", label: "Device class", hint: "FDA regulatory class" },
  { key: "premarket", label: "510(k) / PMA", hint: "Premarket submission behind the listing, linked to FDA" },
  { key: "expiry", label: "Expiry year", hint: "Registration expiry year" },
  { key: "registrationNumber", label: "Registration #", hint: "FDA registration number" },
  { key: "feiNumber", label: "FEI number", hint: "FDA establishment identifier" },
];

const MATRIX_COLUMN_OPTIONS: { key: MatrixColumn; label: string; hint: string; numeric?: boolean }[] = [
  { key: "productCode", label: "Product code", hint: "FDA product code" },
  { key: "deviceType", label: "Device type", hint: "FDA device classification name" },
  { key: "company", label: "Company", hint: "Owner / operator" },
  { key: "coverage", label: "Codes held", hint: "Which of the selected codes this company's listings cover" },
  { key: "listedDeviceCount", label: "Listed devices", hint: "Unique proprietary names for this company and code", numeric: true },
  { key: "registeredDevices", label: "Registered devices", hint: "Unique proprietary device names" },
  { key: "registrations", label: "Registrations", hint: "Distinct FDA registration records", numeric: true },
  { key: "productListings", label: "Product listings", hint: "Raw matching product entries", numeric: true },
  { key: "establishments", label: "Establishments", hint: "Distinct registered facilities", numeric: true },
  { key: "deviceClass", label: "Device class", hint: "FDA regulatory classes" },
  { key: "specialty", label: "Medical specialty", hint: "FDA specialty descriptions" },
  { key: "countries", label: "Countries", hint: "Countries represented by matching facilities" },
  { key: "latestListing", label: "Latest listing", hint: "Newest product created date in the group" },
];
const MATRIX_KEYS = MATRIX_COLUMN_OPTIONS.map((option) => option.key);

const UDI_COLUMN_OPTIONS: { key: UdiColumn; label: string; hint: string }[] = [
  { key: "company", label: "Labeler", hint: "Company that published the GUDID record" },
  { key: "brand", label: "Brand", hint: "Brand name on the label" },
  { key: "model", label: "Version / model", hint: "Version or model number and catalog number" },
  { key: "primaryDi", label: "Primary DI (GTIN)", hint: "Primary device identifier and issuing agency" },
  { key: "codes", label: "Product codes", hint: "Every product code on the device record" },
  { key: "premarket", label: "Premarket submission", hint: "510(k) / PMA / De Novo declared by the labeler, or exemption" },
  { key: "rxOtc", label: "Rx / OTC", hint: "Prescription or over-the-counter" },
  { key: "published", label: "Published", hint: "GUDID publish date and current version" },
  { key: "status", label: "Status", hint: "Record status and commercial distribution" },
  { key: "description", label: "Description", hint: "Device description from the record" },
  { key: "gmdn", label: "GMDN", hint: "Global Medical Device Nomenclature terms" },
  { key: "catalog", label: "Catalog #", hint: "Labeler catalog number" },
  { key: "identifiers", label: "Identifiers", hint: "How many DIs (primary, package, …) the record carries" },
];

const DEFAULT_RECORD_COLUMNS: RecordColumn[] = ["establishment", "primaryDevice", "productCodes", "listedProducts", "location", "listed", "deviceClass"];
const COLUMN_WIDTH_VIEWS = ["records", "matrix", "udi"] as const;

function latestListed(products: readonly { created_date?: string }[]) {
  return products.reduce((max, product) => (product.created_date && product.created_date > max ? product.created_date : max), "");
}
const DEFAULT_MATRIX_COLUMNS: MatrixColumn[] = ["productCode", "deviceType", "company", "coverage", "listedDeviceCount", "registeredDevices", "registrations"];
const DEFAULT_UDI_COLUMNS: UdiColumn[] = ["company", "brand", "model", "primaryDi", "codes", "premarket", "rxOtc", "published"];

const ESTABLISHMENT_TYPES = [
  "Manufacture Medical Device",
  "Manufacture Medical Device for Another Party (Contract Manufacturer)",
  "Develop Specifications But Do Not Manufacture At This Facility",
  "Repack or Relabel Medical Device",
  "Sterilize Medical Device for Another Party (Contract Sterilizer)",
  "Export Device to the United States But Perform No Other Operation on Device",
  "Remanufacture Medical Device",
];

function regionName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function syncUrl(filters: Filters, view: ViewMode, sort: RecordSort) {
  if (typeof window === "undefined") return;
  const params = filtersToParams(filters, view);
  if (view !== "matrix" && sort !== "relevance") params.set("sort", sort);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function initialStateFromUrl() {
  if (typeof window === "undefined") return { filters: EMPTY_FILTERS, view: "records" as ViewMode, autorun: false, sort: "relevance" as RecordSort };
  const params = new URLSearchParams(window.location.search);
  return { ...filtersFromParams(params), sort: asRecordSort(params.get("sort")) };
}

function premarketIds(item: RecordItem) {
  return [item.k_number, item.pma_number].map((value) => String(value ?? "").trim()).filter(Boolean);
}

/** A premarket number as a link to the FDA database when the format is recognised, plain text otherwise. */
function PremarketLinks({ item, stop = false }: { item: RecordItem; stop?: boolean }) {
  const ids = premarketIds(item);
  if (!ids.length) return <b className="mono-value">—</b>;
  return (
    <>
      {ids.map((id, index) => {
        const url = fdaPremarketUrl(id);
        return (
          <span key={id} className="mono-value">
            {index > 0 && " · "}
            {url
              ? <a className="table-link" href={url} target="_blank" rel="noreferrer" title="Open this submission on the FDA website" onClick={(e) => stop && e.stopPropagation()}>{id}</a>
              : id}
          </span>
        );
      })}
    </>
  );
}

function loadColumns<T extends string>(key: string, options: readonly { key: T }[]): T[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null") as T[] | null;
    const valid = saved?.filter((column) => options.some((option) => option.key === column));
    return valid?.length ? valid : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [initial] = useState(initialStateFromUrl);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [codeDraft, setCodeDraft] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [udiDevices, setUdiDevices] = useState<UdiDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [skip, setSkip] = useState(0);
  const [recordSort, setRecordSort] = useState<RecordSort>(initial.sort);
  const [loading, setLoading] = useState(false);
  const [loadingNote, setLoadingNote] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<UdiDevice | null>(null);
  const [udiCompany, setUdiCompany] = useState<{ company: string; alternates: string[]; codes: string[]; mode: CodeMatchMode } | null>(null);
  const [exportProgress, setExportProgress] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "page">("all");
  const [exportFilename, setExportFilename] = useState("");
  const [exportFilenameCustom, setExportFilenameCustom] = useState(false);
  const [exportColumnIds, setExportColumnIds] = useState<string[]>([]);
  // The pane is a normal column above 720px; this only opens the off-canvas drawer on phones.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datasetUpdated, setDatasetUpdated] = useState("");
  const [udiUpdated, setUdiUpdated] = useState("");
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [codeCounts, setCodeCounts] = useState<{ code: string; count: number }[] | null>(null);
  const [presetCounts, setPresetCounts] = useState<Map<string, number> | null>(null);
  const [codeInfo, setCodeInfo] = useState<Map<string, CodeInfo | null>>(() => new Map());
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [recentReady, setRecentReady] = useState(false);
  const [udiAliases, setUdiAliases] = useState<Record<string, string[]>>({});
  const [linkCopied, setLinkCopied] = useState(false);
  const [recordColumns, setRecordColumns] = useState<RecordColumn[]>(DEFAULT_RECORD_COLUMNS);
  const [matrixColumns, setMatrixColumns] = useState<MatrixColumn[]>(DEFAULT_MATRIX_COLUMNS);
  const [udiColumns, setUdiColumns] = useState<UdiColumn[]>(DEFAULT_UDI_COLUMNS);
  const [columnPrefsReady, setColumnPrefsReady] = useState(false);
  const [apiCountries, setApiCountries] = useState<CountryOption[]>([]);
  // With ALL on, a company's codes belong together, so company order is the natural default.
  const [matrixSortKey, setMatrixSortKey] = useState<MatrixSortKey>(initial.filters.codeMatch === "all" ? "company" : "productCode");
  const [matrixDir, setMatrixDir] = useState<SortDir>("asc");
  const [colWidths, setColWidths] = useState<Record<string, Record<string, number>>>({});
  const [colWidthsReady, setColWidthsReady] = useState(false);
  const [resizing, setResizing] = useState("");
  const resizeRef = useRef<{ view: string; key: string; startX: number; startWidth: number } | null>(null);
  const dragEndedAt = useRef(0);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [filterPanelPrefsReady, setFilterPanelPrefsReady] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const searchSeq = useRef(0);

  const hasSearched = fetchedAt !== null;
  const countryOptions = apiCountries;
  const topCountries = countryOptions.slice(0, 4);
  const activeFilters = [
    filters.keyword.trim(),
    filters.productCodes.length,
    filters.country.trim(),
    filters.state.trim(),
    filters.deviceClass,
    filters.establishment,
  ].filter(Boolean).length;
  const narrowFilterCount = [
    filters.country.trim(),
    filters.state.trim(),
    filters.deviceClass,
    filters.establishment,
  ].filter(Boolean).length;

  const presetActive =
    filters.productCodes.length === PRESET_CODES.length &&
    PRESET_CODES.every((code) => filters.productCodes.includes(code));

  const isUdi = viewMode === "udi";
  const isMatrix = viewMode === "matrix";
  /** ALL only exists in the Company + devices and Devices (UDI) views, and only changes anything with two or more applied codes. */
  const allTogether = viewMode !== "records" && codeMatchApplies(appliedFilters);
  const matchHint = isUdi
    ? (filters.codeMatch === "all"
      ? (filters.productCodes.length > 1 ? "Only device records that carry every selected code — e.g. a hearing aid filed under OSM and KLW." : "All needs two or more codes — add another to require them on the same device record.")
      : "Device records carrying at least one selected code.")
    : filters.codeMatch === "all"
      ? (filters.productCodes.length > 1
        ? "Only companies whose listings cover every selected code, listed company by company."
        : "All needs two or more codes — add another to require every code per company.")
      : "Companies with a listing for at least one selected code.";
  const udiIgnored = udiIgnoredFilters(filters);

  const codeLabel = (code: string) => codeInfo.get(code)?.name || CODE_NAMES.get(code) || `Product code ${code}`;
  const codeUnknown = (code: string) => codeInfo.has(code) && codeInfo.get(code) === null;

  /** Company + devices groups; with ALL, only companies covering every selected code survive. */
  const matrixRows = useMemo(
    () => sortMatrixBy(buildMatrix(records, appliedFilters), matrixSortKey, matrixDir),
    [records, appliedFilters, matrixSortKey, matrixDir],
  );
  const matrixCompanies = useMemo(() => matrixCompanyCount(matrixRows), [matrixRows]);
  /** How many companies hold at least one selected code — the ANY answer, shown when ALL comes up empty. */
  const anyCompanies = useMemo(
    () => matrixCompanyCount(buildMatrix(records, { ...appliedFilters, codeMatch: "any" })),
    [records, appliedFilters],
  );
  /** Which selected codes each company's listings cover, for the "Codes held" column. */
  const coverage = useMemo(() => companyCodeCoverage(records, appliedFilters), [records, appliedFilters]);
  const selectedCodes = useMemo(() => normalizeCodes(appliedFilters.productCodes), [appliedFilters.productCodes]);
  const unknownApplied = selectedCodes.filter((code) => codeInfo.has(code) && codeInfo.get(code) === null);

  const runSearch = useCallback(
    async (nextSkip = 0, requestedView: ViewMode = viewMode, nextFilters: Filters = filters, nextLimit: number = limit, nextSort: RecordSort = recordSort) => {
      const seq = ++searchSeq.current;
      setError("");
      setSelected(null);
      setSelectedDevice(null);
      setLoading(true);
      setLoadingNote("");
      try {
        let meta: OpenFdaMeta | undefined;
        let countUrl = "";
        if (requestedView === "udi") {
          const search = buildUdiSearch(nextFilters);
          const params = new URLSearchParams({ limit: String(nextLimit), skip: String(nextSkip) });
          if (search) params.set("search", search);
          const sortParam = udiSortParam(nextSort);
          if (sortParam) params.set("sort", sortParam);
          const data = await fetchOpenFda<UdiRaw>(`${UDI_API}?${params.toString()}`);
          if (seq !== searchSeq.current) return;
          setUdiDevices(data.results.map(normalizeUdi));
          meta = data.meta;
          if (nextFilters.productCodes.length) {
            const countParams = new URLSearchParams({ count: "product_codes.code", limit: "1000" });
            if (search) countParams.set("search", search);
            countUrl = `${UDI_API}?${countParams.toString()}`;
          }
        } else {
          const search = buildSearch(nextFilters);
          let data: { results: RecordItem[]; meta?: OpenFdaMeta };
          if (requestedView === "matrix") {
            // Company coverage must be judged on the whole match set, so the matrix pages well past one call.
            data = await fetchListingPages<RecordItem>(API, search, MATRIX_FETCH_CAP, (loaded, target) => {
              if (seq === searchSeq.current && target > 1000) setLoadingNote(`Loading listings ${loaded.toLocaleString()} of ${target.toLocaleString()}…`);
            });
          } else {
            const params = new URLSearchParams({ limit: String(nextLimit), skip: String(nextSkip) });
            if (search) params.set("search", search);
            const sortParam = recordSortParam(nextSort);
            if (sortParam) params.set("sort", sortParam);
            data = await fetchOpenFda<RecordItem>(`${API}?${params.toString()}`);
          }
          if (seq !== searchSeq.current) return;
          setRecords(data.results);
          meta = data.meta;
          if (nextFilters.productCodes.length) {
            const countParams = new URLSearchParams({ count: "products.product_code", limit: "1000" });
            if (search) countParams.set("search", search);
            countUrl = `${API}?${countParams.toString()}`;
          }
        }
        setTotal(meta?.results?.total || 0);
        setSkip(requestedView === "matrix" ? 0 : nextSkip);
        setAppliedFilters(nextFilters);
        setFetchedAt(new Date());
        setCheckedAt(new Date());
        if (meta?.last_updated) {
          if (requestedView === "udi") setUdiUpdated(meta.last_updated);
          else setDatasetUpdated(meta.last_updated);
        }
        syncUrl(nextFilters, requestedView, nextSort);
        if (nextSkip === 0) setRecent((current) => rememberSearch(current, nextFilters, requestedView));
        if (countUrl) {
          fetchOpenFda<{ term?: string; count?: number }>(countUrl)
            .then((countData) => {
              if (seq !== searchSeq.current) return;
              const terms = new Map(countData.results.map((entry) => [String(entry.term).toUpperCase(), entry.count || 0]));
              setCodeCounts(nextFilters.productCodes.map((code) => ({ code, count: terms.get(code) ?? 0 })));
            })
            .catch(() => setCodeCounts(null));
        } else {
          setCodeCounts(null);
        }
      } catch (caught) {
        if (seq !== searchSeq.current) return;
        if (requestedView === "udi") setUdiDevices([]);
        else setRecords([]);
        setTotal(0);
        setCodeCounts(null);
        setError(caught instanceof Error ? caught.message : "Unable to reach the FDA API.");
      } finally {
        if (seq === searchSeq.current) {
          setLoading(false);
          setLoadingNote("");
        }
      }
    },
    [filters, limit, viewMode, recordSort],
  );

  useEffect(() => {
    fetch(`${API}?limit=1`)
      .then((res) => res.json())
      .then((data: { meta?: { last_updated?: string; results?: { total?: number } } }) => {
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        if (data.meta?.results?.total) setDatasetTotal(data.meta.results.total);
        setCheckedAt(new Date());
      })
      .catch(() => {});
    const countryParams = new URLSearchParams({ count: "registration.iso_country_code", limit: "250" });
    fetch(`${API}?${countryParams.toString()}`)
      .then((res) => res.json())
      .then((data: { results?: { term?: string; count?: number }[] }) => {
        const countries = (data.results || [])
          .filter((entry) => entry.term)
          .map((entry) => {
            const code = String(entry.term).toUpperCase();
            return { code, count: entry.count || 0, name: regionName(code) };
          })
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        setApiCountries(countries);
      })
      .catch(() => {});
    const presetParams = new URLSearchParams({ search: productCodeClause(PRESET_CODES), count: "products.product_code", limit: "100" });
    fetchOpenFda<{ term?: string; count?: number }>(`${API}?${presetParams.toString()}`)
      .then((data) => setPresetCounts(new Map(data.results.map((entry) => [String(entry.term).toUpperCase(), entry.count || 0]))))
      .catch(() => {});
    if (initial.autorun) queueMicrotask(() => runSearch(0, initial.view, initial.filters, 25, initial.sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      let validRecords = loadColumns("fda-record-columns", RECORD_COLUMN_OPTIONS);
      let validMatrix = loadColumns("fda-matrix-columns", MATRIX_COLUMN_OPTIONS);
      const validUdi = loadColumns("fda-udi-columns", UDI_COLUMN_OPTIONS);
      // One-time migration: surface the "Codes held" column for people who saved their columns before it existed.
      if (validMatrix?.length && !validMatrix.includes("coverage") && !localStorage.getItem("fda-matrix-columns-coverage")) {
        const at = validMatrix.indexOf("company");
        validMatrix = at >= 0 ? [...validMatrix.slice(0, at + 1), "coverage", ...validMatrix.slice(at + 1)] : [...validMatrix, "coverage"];
      }
      localStorage.setItem("fda-matrix-columns-coverage", "1");
      // One-time migration: surface the sortable "Listed" date column for saved column sets that predate it.
      if (validRecords?.length && !validRecords.includes("listed") && !localStorage.getItem("fda-record-columns-listed")) {
        const at = validRecords.indexOf("location");
        validRecords = at >= 0 ? [...validRecords.slice(0, at + 1), "listed", ...validRecords.slice(at + 1)] : [...validRecords, "listed"];
      }
      localStorage.setItem("fda-record-columns-listed", "1");
      const widths: Record<string, Record<string, number>> = {};
      COLUMN_WIDTH_VIEWS.forEach((view) => {
        try {
          const parsed = JSON.parse(localStorage.getItem(`fda-col-widths-${view}`) || "null") as Record<string, unknown> | null;
          if (parsed && typeof parsed === "object") widths[view] = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0));
        } catch {
          // Ignore malformed widths.
        }
      });
      queueMicrotask(() => {
        if (validRecords) setRecordColumns(validRecords);
        if (validMatrix) setMatrixColumns(validMatrix);
        if (validUdi) setUdiColumns(validUdi);
        setColWidths(widths);
        setColWidthsReady(true);
        setColumnPrefsReady(true);
      });
    } catch {
      // Ignore malformed local preferences and use the defaults.
      queueMicrotask(() => {
        setColWidthsReady(true);
        setColumnPrefsReady(true);
      });
    }
  }, []);

  useEffect(() => {
    if (!columnPrefsReady) return;
    localStorage.setItem("fda-record-columns", JSON.stringify(recordColumns));
    localStorage.setItem("fda-matrix-columns", JSON.stringify(matrixColumns));
    localStorage.setItem("fda-udi-columns", JSON.stringify(udiColumns));
  }, [columnPrefsReady, recordColumns, matrixColumns, udiColumns]);

  useEffect(() => {
    if (!colWidthsReady) return;
    COLUMN_WIDTH_VIEWS.forEach((view) => localStorage.setItem(`fda-col-widths-${view}`, JSON.stringify(colWidths[view] || {})));
  }, [colWidthsReady, colWidths]);

  /** While a header is being dragged, follow the pointer anywhere on the page and stop on any release, cancel or window blur. */
  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      if (event.buttons === 0) {
        resizeRef.current = null;
        dragEndedAt.current = Date.now();
        setResizing("");
        return;
      }
      const width = Math.max(64, Math.round(active.startWidth + event.clientX - active.startX));
      setColWidths((current) => ({ ...current, [active.view]: { ...(current[active.view] || {}), [active.key]: width } }));
    };
    const end = () => {
      resizeRef.current = null;
      dragEndedAt.current = Date.now();
      setResizing("");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    document.body.classList.add("col-resizing");
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      document.body.classList.remove("col-resizing");
    };
  }, [resizing]);


  useEffect(() => {
    const saved = localStorage.getItem("fda-filter-panel-collapsed") === "1";
    let storedRecent: RecentSearch[] = [];
    let storedAliases: Record<string, string[]> = {};
    try {
      storedRecent = parseRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY));
      storedAliases = parseUdiAliases(localStorage.getItem(UDI_ALIASES_KEY));
    } catch {
      storedRecent = [];
    }
    queueMicrotask(() => {
      setFiltersCollapsed(saved);
      setFilterPanelPrefsReady(true);
      setRecent((current) => (current.length ? current : storedRecent));
      setUdiAliases((current) => (Object.keys(current).length ? current : storedAliases));
      setRecentReady(true);
    });
  }, []);

  useEffect(() => {
    if (!filterPanelPrefsReady) return;
    localStorage.setItem("fda-filter-panel-collapsed", filtersCollapsed ? "1" : "0");
  }, [filterPanelPrefsReady, filtersCollapsed]);

  useEffect(() => {
    if (!recentReady) return;
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
      localStorage.setItem(UDI_ALIASES_KEY, JSON.stringify(udiAliases));
    } catch {
      // Storage may be full or blocked; recent searches and aliases are a convenience only.
    }
  }, [recentReady, recent, udiAliases]);

  /** User-added GUDID labeler names for a company, kept on this device. */
  const aliasesFor = (company: string) => udiAliases[normalizeLabeler(company)] || [];
  const addAlias = (company: string, name: string) => {
    const key = normalizeLabeler(company);
    const value = name.trim();
    if (!key || !value) return;
    setUdiAliases((current) => ({ ...current, [key]: [...new Set([...(current[key] || []), value])] }));
  };
  const removeAlias = (company: string, name: string) => {
    const key = normalizeLabeler(company);
    setUdiAliases((current) => {
      const next = { ...current, [key]: (current[key] || []).filter((item) => item !== name) };
      if (!next[key].length) delete next[key];
      return next;
    });
  };

  /** Name every entered code from the FDA classification dataset, so unknown codes can be flagged before searching. */
  useEffect(() => {
    const codes = filters.productCodes;
    if (!codes.length) return;
    let cancelled = false;
    fetchCodeInfo(codes)
      .then((resolved) => {
        if (cancelled) return;
        setCodeInfo((current) => {
          const next = new Map(current);
          resolved.forEach((value, key) => next.set(key, value));
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filters.productCodes]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const picker = columnPicker.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const picker = columnPicker.current;
      if (event.key === "Escape" && picker?.open) {
        picker.open = false;
        picker.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (columnPicker.current) columnPicker.current.open = false;
  }, [viewMode]);

  const toggleColumn = <T extends string>(setter: (update: (current: T[]) => T[]) => void, key: T) => {
    setter((current) => current.includes(key)
      ? (current.length > 1 ? current.filter((column) => column !== key) : current)
      : [...current, key]);
  };

  const commitCodes = (text: string) => {
    const parsed = parseCodes(text);
    if (parsed.length) {
      setFilters((prev) => ({
        ...prev,
        productCodes: [...new Set([...prev.productCodes, ...parsed])],
      }));
    }
    setCodeDraft("");
  };

  const removeCode = (code: string) => {
    const next = { ...filters, productCodes: filters.productCodes.filter((c) => c !== code) };
    setFilters(next);
    if (hasSearched) runSearch(0, viewMode, next);
  };

  const applyPreset = () => {
    const next = { ...filters, productCodes: [...PRESET_CODES] };
    setFilters(next);
    setCodeDraft("");
    runSearch(0, viewMode, next);
  };

  const togglePreset = () => {
    if (presetActive) {
      const next = { ...filters, productCodes: [] };
      setFilters(next);
      if (hasSearched) runSearch(0, viewMode, next);
    } else {
      applyPreset();
    }
  };

  /**
   * ANY/ALL: in Company + devices it is a client-side rollup over loaded listings (instant);
   * in Devices (UDI) it changes the query itself (a device record either carries every code or not).
   */
  const setCodeMatch = (mode: CodeMatchMode) => {
    if (mode === "all" && matrixSortKey === "productCode") {
      setMatrixSortKey("company");
      setMatrixDir("asc");
    }
    if (filters.codeMatch === mode && appliedFilters.codeMatch === mode) return;
    const next = { ...filters, codeMatch: mode };
    setFilters(next);
    if (!hasSearched) return;
    if (viewMode === "udi") {
      runSearch(0, "udi", next);
      return;
    }
    const applied = { ...appliedFilters, codeMatch: mode };
    setAppliedFilters(applied);
    syncUrl(applied, viewMode, recordSort);
  };

  const changeLimit = (nextLimit: number) => {
    setLimit(nextLimit);
    if (hasSearched) runSearch(0, viewMode, appliedFilters, nextLimit);
  };

  const changeRecordSort = (nextSort: RecordSort) => {
    setRecordSort(nextSort);
    if (hasSearched && viewMode !== "matrix") runSearch(0, viewMode, appliedFilters, limit, nextSort);
  };

  const searchNow = () => {
    let next = filters;
    const parsed = parseCodes(codeDraft);
    if (parsed.length) {
      next = { ...filters, productCodes: [...new Set([...filters.productCodes, ...parsed])] };
      setFilters(next);
    }
    setCodeDraft("");
    runSearch(0, viewMode, next);
    setFiltersOpen(false);
  };

  /** Jump from a company (matrix row or GUDID labeler) to its listings in the Records view, keeping the current codes. */
  const showCompanyListings = (company: string, codes?: string[]) => {
    const next = { ...appliedFilters, keyword: company, productCodes: codes?.length ? codes : appliedFilters.productCodes };
    setFilters(next);
    setViewMode("records");
    setSelected(null);
    setSelectedDevice(null);
    setUdiCompany(null);
    runSearch(0, "records", next);
  };

  /** Filter by a value clicked in the results (code pill, class badge, country, name); pending sidebar edits go with it. */
  const applyValueFilter = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setCodeDraft("");
    runSearch(0, viewMode, next);
  };
  const addCodeFilter = (code: string) => {
    const value = code.trim().toUpperCase();
    if (!value || filters.productCodes.includes(value)) return;
    applyValueFilter({ productCodes: [...filters.productCodes, value] });
  };
  const toggleClassFilter = (deviceClass: string) => applyValueFilter({ deviceClass: filters.deviceClass === deviceClass ? "" : deviceClass });
  const toggleCountryFilter = (country: string) => applyValueFilter({ country: filters.country === country ? "" : country });

  /** Open the Devices (UDI) view for one labeler and the current codes. */
  const openUdiView = (labeler: string, codes?: string[]) => {
    const next = { ...appliedFilters, keyword: labeler, productCodes: codes?.length ? codes : appliedFilters.productCodes };
    setFilters(next);
    setViewMode("udi");
    setSelected(null);
    setSelectedDevice(null);
    setUdiCompany(null);
    runSearch(0, "udi", next);
  };

  const applyRecent = (entry: RecentSearch) => {
    const params = new URLSearchParams(entry.params);
    const state = filtersFromParams(params);
    const sort = asRecordSort(params.get("sort"));
    setFilters(state.filters);
    setViewMode(state.view);
    setRecordSort(sort);
    setCodeDraft("");
    if (state.filters.codeMatch === "all" && matrixSortKey === "productCode") {
      setMatrixSortKey("company");
      setMatrixDir("asc");
    }
    runSearch(0, state.view, state.filters, limit, sort);
  };

  const reset = () => {
    searchSeq.current += 1;
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCodeDraft("");
    setCodeCounts(null);
    setRecords([]);
    setUdiDevices([]);
    setTotal(0);
    setSkip(0);
    setError("");
    setLoading(false);
    setLoadingNote("");
    setSelected(null);
    setSelectedDevice(null);
    setUdiCompany(null);
    setFetchedAt(null);
    setRecordSort("relevance");
    syncUrl(EMPTY_FILTERS, viewMode, "relevance");
  };

  const fetchAllMatching = async () => {
    const cap = Math.min(total, EXPORT_CAP);
    setExportProgress(`Downloading 0 of ${cap.toLocaleString()} records…`);
    const progress = (loaded: number, target: number) => setExportProgress(`Downloading ${loaded.toLocaleString()} of ${target.toLocaleString()} records…`);
    if (viewMode === "udi") {
      const { results } = await fetchListingPages<UdiRaw>(UDI_API, buildUdiSearch(appliedFilters), cap, progress, udiSortParam(recordSort));
      return results.map(normalizeUdi);
    }
    const { results } = await fetchListingPages<RecordItem>(API, buildSearch(appliedFilters), cap, progress, viewMode === "records" ? recordSortParam(recordSort) : "");
    return results;
  };

  const exportBaseName = () => {
    const codes = appliedFilters.productCodes;
    const codesPart = codes.length ? codes.join("+") : "all";
    const modePart = allTogether ? "-all-codes" : "";
    const prefix = viewMode === "matrix" ? "fda-devices-matrix" : viewMode === "udi" ? "fda-udi-devices" : "fda-devices";
    return `${prefix}-${codesPart}${modePart}-${new Date().toISOString().slice(0, 10)}`;
  };

  const exportCsv = async () => {
    if (!total || exportProgress) return;
    setError("");
    try {
      if (viewMode === "udi") {
        const all = (exportScope === "page" ? udiDevices : await fetchAllMatching()) as UdiDevice[];
        const labels = Object.fromEntries(UDI_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<UdiColumn, string>;
        const exportColumns = exportColumnIds.filter((id) => UDI_COLUMN_OPTIONS.some((option) => option.key === id)) as UdiColumn[];
        const chosen = exportColumns.length ? exportColumns : udiColumns;
        const value = (device: UdiDevice, column: UdiColumn): ExcelValue => ({
          company: device.company,
          brand: device.brand,
          model: device.model,
          primaryDi: device.primaryDi,
          codes: device.codeList.join("; "),
          premarket: device.premarket.length ? udiPremarketLabel(device) : (device.pmExempt ? "Exempt (none listed)" : "None listed"),
          rxOtc: device.rx ? "Rx" : device.otc ? "OTC" : "",
          published: device.publishDate,
          status: [device.recordStatus, device.distributionStatus].filter(Boolean).join(" · "),
          description: device.description,
          gmdn: device.gmdn.map((term) => term.name).join("; "),
          catalog: device.catalog,
          identifiers: device.identifiers.map((entry) => `${entry.id} (${entry.type || "DI"})`).join("; "),
        })[column];
        downloadExcel({
          filename: sanitizeExportFilename(exportFilename, exportBaseName()),
          sheetName: "GUDID devices",
          columns: chosen.map((column) => ({ header: labels[column], width: 24 })),
          rows: all.map((device) => chosen.map((column) => value(device, column))),
        });
      } else {
        const all = (exportScope === "page" ? records : await fetchAllMatching()) as RecordItem[];
        if (viewMode === "matrix") {
          const labels = Object.fromEntries(MATRIX_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<MatrixColumn, string>;
          const exportCoverage = companyCodeCoverage(all, appliedFilters);
          const value = (row: MatrixRow, column: MatrixColumn): ExcelValue => ({
            productCode: row.productCode,
            deviceType: row.deviceType,
            company: row.company,
            coverage: selectedCodes.filter((code) => exportCoverage.get(row.companyKey)?.has(code)).join("; "),
            listedDeviceCount: row.devices.length,
            registeredDevices: row.devices.join("; "),
            registrations: row.registrations,
            productListings: row.productListings,
            establishments: row.establishments,
            deviceClass: row.deviceClasses.join("; "),
            specialty: row.specialties.join("; "),
            countries: row.countries.join("; "),
            latestListing: row.latestListing,
          })[column];
          const exportColumns = (exportColumnIds.filter((id) => MATRIX_COLUMN_OPTIONS.some((option) => option.key === id)) as MatrixColumn[]);
          const chosen = orderMatrixColumns(exportColumns.length ? exportColumns : matrixColumns, matrixSortKey);
          // buildMatrix applies the same ANY/ALL company rollup the table uses, on the full export set.
          const rows = sortMatrixBy(buildMatrix(all, appliedFilters), matrixSortKey, matrixDir)
            .map((row) => chosen.map((column) => value(row, column)));
          downloadExcel({
            filename: sanitizeExportFilename(exportFilename, exportBaseName()),
            sheetName: "Company + devices",
            columns: chosen.map((column) => ({ header: labels[column], width: 22 })),
            rows,
          });
        } else {
          const labels = Object.fromEntries(RECORD_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<RecordColumn, string>;
          const exportColumns = (exportColumnIds.filter((id) => RECORD_COLUMN_OPTIONS.some((option) => option.key === id)) as RecordColumn[]);
          const chosen = exportColumns.length ? exportColumns : recordColumns;
          const rows = all.map((item) => {
            const matched = matchingProducts(item, appliedFilters);
            const shown = productFilterActive(appliedFilters) ? matched : item.products || [];
            const primary = shown[0];
            const values: Record<RecordColumn, ExcelValue> = {
              establishment: firmName(item),
              ownerOperator: companyName(item),
              primaryDevice: primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device",
              productCodes: [...new Set(shown.map((p) => p.product_code).filter(Boolean))].join("; "),
              listedProducts: shown.length,
              tradeNames: listedDeviceNames(item).join("; "),
              location: locationSummary(item),
              deviceClass: [...new Set(shown.map((p) => p.openfda?.device_class).filter(Boolean))].join("; "),
              listed: latestListed(shown),
              premarket: premarketSummary(item),
              expiry: item.registration?.reg_expiry_date_year ?? "",
              registrationNumber: item.registration?.registration_number ?? "",
              feiNumber: item.registration?.fei_number ?? "",
            };
            return chosen.map((column) => values[column]);
          });
          downloadExcel({
            filename: sanitizeExportFilename(exportFilename, exportBaseName()),
            sheetName: "FDA records",
            columns: chosen.map((column) => ({ header: labels[column], width: 22 })),
            rows,
          });
        }
      }
      setExportOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The export could not be completed.");
    } finally {
      setExportProgress("");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      setError("Could not copy the link — copy it from the address bar instead.");
    }
  };

  const pageCount = isUdi ? udiDevices.length : records.length;
  const rangeLabel = useMemo(() => {
    if (!total) return isUdi ? "0 devices" : "0 records";
    return `${(skip + 1).toLocaleString()}–${Math.min(skip + pageCount, total).toLocaleString()} of ${total.toLocaleString()}${isUdi ? " devices" : ""}`;
  }, [pageCount, skip, total, isUdi]);

  const drawerProducts = useMemo(() => {
    if (!selected) return [];
    const matched = new Set(matchingProducts(selected, appliedFilters));
    return [...(selected.products || [])]
      .map((product) => ({ product, matches: matched.has(product) }))
      .sort((a, b) => Number(b.matches) - Number(a.matches));
  }, [selected, appliedFilters]);

  const switchView = (nextView: ViewMode) => {
    if (nextView === viewMode) return;
    setViewMode(nextView);
    setSelected(null);
    setSelectedDevice(null);
    if (hasSearched) {
      runSearch(0, nextView, appliedFilters);
    } else {
      syncUrl(appliedFilters, nextView, recordSort);
    }
  };

  const activeColumnOptions: readonly { key: string; label: string; hint: string }[] = isUdi ? UDI_COLUMN_OPTIONS : isMatrix ? MATRIX_COLUMN_OPTIONS : RECORD_COLUMN_OPTIONS;
  const activeColumns: readonly string[] = isUdi ? udiColumns : isMatrix ? matrixColumns : recordColumns;
  const toggleActiveColumn = (key: string) => {
    if (isUdi) toggleColumn<UdiColumn>(setUdiColumns, key as UdiColumn);
    else if (isMatrix) toggleColumn<MatrixColumn>(setMatrixColumns, key as MatrixColumn);
    else toggleColumn<RecordColumn>(setRecordColumns, key as RecordColumn);
  };
  const resetActiveColumns = () => {
    if (isUdi) setUdiColumns(DEFAULT_UDI_COLUMNS);
    else if (isMatrix) setMatrixColumns(DEFAULT_MATRIX_COLUMNS);
    else setRecordColumns(DEFAULT_RECORD_COLUMNS);
  };

  const openExport = () => {
    setExportColumnIds([...activeColumns]);
    if (!exportFilenameCustom) setExportFilename(`${exportBaseName()}.xlsx`);
    setExportOpen(true);
  };

  const exportCount = Math.min(total, EXPORT_CAP);
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const freshnessHint = "\"FDA data as of\" is the date openFDA last rebuilt this dataset — records newer than that aren't published yet. \"Pulled\" is when this page last called the live API.";
  const nothingToShow = isUdi ? !udiDevices.length : isMatrix ? !matrixRows.length : !records.length;
  const showNoResults = hasSearched && !loading && !error && nothingToShow;
  const showEmpty = nothingToShow && !loading && !showNoResults;
  const appliedCodesLabel = appliedFilters.productCodes.join(" + ");
  const visibleMatrixColumns = orderMatrixColumns(matrixColumns, matrixSortKey);
  const showCodeNames = selectedCodes.length > 0 && selectedCodes.length <= 3;
  const activeDatasetDate = isUdi ? udiUpdated : datasetUpdated;

  const pendingChanges = hasSearched ? pendingFilterChanges(filters, appliedFilters, viewMode, codeDraft) : [];
  type AppliedChip = { key: string; label: string; kind: "keyword" | "code" | "match" | "country" | "state" | "class" | "establishment"; value: string };
  const appliedChips: AppliedChip[] = hasSearched ? [
    ...(appliedFilters.keyword.trim() ? [{ key: "kw", label: `“${appliedFilters.keyword.trim()}”`, kind: "keyword" as const, value: "" }] : []),
    ...appliedFilters.productCodes.map((code) => ({ key: `code-${code}`, label: code, kind: "code" as const, value: code })),
    ...(allTogether ? [{ key: "match", label: isUdi ? "Every code on the device" : "Every code per company", kind: "match" as const, value: "" }] : []),
    ...(appliedFilters.country.trim() && !isUdi ? [{ key: "country", label: regionName(appliedFilters.country.trim().toUpperCase()), kind: "country" as const, value: "" }] : []),
    ...(appliedFilters.state.trim() && !isUdi ? [{ key: "state", label: `State ${appliedFilters.state.trim().toUpperCase()}`, kind: "state" as const, value: "" }] : []),
    ...(appliedFilters.deviceClass ? [{ key: "class", label: appliedFilters.deviceClass === "U" ? "Unclassified" : `Class ${appliedFilters.deviceClass}`, kind: "class" as const, value: "" }] : []),
    ...(appliedFilters.establishment && !isUdi ? [{ key: "est", label: appliedFilters.establishment.split(" ").slice(0, 4).join(" "), kind: "establishment" as const, value: "" }] : []),
  ] : [];
  const removeChip = (chip: AppliedChip) => {
    if (chip.kind === "code") removeCode(chip.value);
    else if (chip.kind === "match") setCodeMatch("any");
    else if (chip.kind === "keyword") applyValueFilter({ keyword: "" });
    else if (chip.kind === "country") applyValueFilter({ country: "" });
    else if (chip.kind === "state") applyValueFilter({ state: "" });
    else if (chip.kind === "class") applyValueFilter({ deviceClass: "" });
    else applyValueFilter({ establishment: "" });
  };

  /* ---- header sorting, explanations and column resizing ---- */
  const RECORD_UNSORTABLE = "";
  const UDI_UNSORTABLE = "";
  const cycleSort = (current: RecordSort, desc: RecordSort, asc: RecordSort): RecordSort => (current === desc ? asc : current === asc ? "relevance" : desc);
  const sortDirOf = (current: RecordSort, desc: RecordSort, asc: RecordSort): SortDir | null => (current === desc ? "desc" : current === asc ? "asc" : null);
  const matrixPreset = (Object.entries(MATRIX_SORT_PRESETS).find(([, preset]) => preset.key === matrixSortKey && preset.dir === matrixDir)?.[0] as MatrixSort | undefined) || "custom";
  const applyMatrixPreset = (value: string) => {
    if (!(value in MATRIX_SORT_PRESETS)) return;
    const preset = MATRIX_SORT_PRESETS[value as MatrixSort];
    setMatrixSortKey(preset.key);
    setMatrixDir(preset.dir);
  };

  const visibleRecordKeys: string[] = [...RECORD_COLUMN_OPTIONS.filter((option) => recordColumns.includes(option.key)).map((option) => option.key), "open"];
  const visibleUdiKeys: string[] = [...UDI_COLUMN_OPTIONS.filter((option) => udiColumns.includes(option.key)).map((option) => option.key), "open"];
  const activeKeys: string[] = isUdi ? visibleUdiKeys : isMatrix ? visibleMatrixColumns : visibleRecordKeys;
  const widths = colWidths[viewMode] || {};
  const fixedLayout = Object.keys(widths).length > 0;
  const widthOf = (key: string) => widths[key] ?? (key === "open" ? 48 : 160);
  const tableStyle = fixedLayout ? { tableLayout: "fixed" as const, width: `max(${activeKeys.reduce((sum, key) => sum + widthOf(key), 0)}px, 100%)`, minWidth: 0 } : undefined;
  const colgroup = fixedLayout ? <colgroup>{activeKeys.map((key) => <col key={key} style={{ width: `${widthOf(key)}px` }} />)}</colgroup> : null;

  const startResize = (event: ReactPointerEvent<HTMLElement>, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const th = handle.parentElement;
    const table = th?.closest("table");
    if (!th || !table) return;
    const view = viewMode;
    const keys = activeKeys;
    // Capture every column's current width so switching to a fixed layout does not shift anything.
    const measured: Record<string, number> = {};
    table.querySelectorAll("thead th").forEach((cell, index) => {
      const columnKey = keys[index];
      if (columnKey) measured[columnKey] = Math.round(cell.getBoundingClientRect().width);
    });
    setColWidths((current) => (Object.keys(current[view] || {}).length ? current : { ...current, [view]: measured }));
    resizeRef.current = { view, key, startX: event.clientX, startWidth: th.getBoundingClientRect().width };
    setResizing(key);
  };
  const resetWidth = (key: string) => setColWidths((current) => {
    const next = { ...(current[viewMode] || {}) };
    delete next[key];
    return { ...current, [viewMode]: next };
  });
  const recordHeaderSpec = (key: RecordColumn): HeaderSpec => {
    const option = RECORD_COLUMN_OPTIONS.find((entry) => entry.key === key)!;
    if (key === "listed") return { key, label: option.label, sortable: true, dir: sortDirOf(recordSort, "newest", "oldest"), hint: "Sort by listing date (openFDA)" };
    if (key === "expiry") return { key, label: option.label, sortable: true, dir: sortDirOf(recordSort, "expiry", "expirySoonest"), hint: "Sort by registration expiry year (openFDA)" };
    if (key === "listedProducts") return { key, label: option.label, numeric: true, sortable: false, dir: null, hint: "this count is computed from the rows on this page, not stored by openFDA." };
    return { key, label: option.label, sortable: false, dir: null, hint: RECORD_UNSORTABLE };
  };
  const matrixHeaderSpec = (column: MatrixColumn): HeaderSpec => {
    const option = MATRIX_COLUMN_OPTIONS.find((entry) => entry.key === column)!;
    if (column === "coverage") return { key: column, label: option.label, sortable: false, dir: null, hint: "it shows which selected codes each company holds; there is no single value to order by." };
    return { key: column, label: option.label, numeric: option.numeric, sortable: true, dir: matrixSortKey === column ? matrixDir : null, hint: "Sort by this column (every loaded row, on this device)" };
  };
  const udiHeaderSpec = (key: UdiColumn): HeaderSpec => {
    const option = UDI_COLUMN_OPTIONS.find((entry) => entry.key === key)!;
    if (key === "published") return { key, label: option.label, sortable: true, dir: sortDirOf(recordSort, "newest", "oldest"), hint: "Sort by GUDID publish date (openFDA)" };
    if (key === "identifiers") return { key, label: option.label, numeric: true, sortable: false, dir: null, hint: "this count comes from the record itself; openFDA cannot order by it." };
    return { key, label: option.label, sortable: false, dir: null, hint: UDI_UNSORTABLE };
  };
  const sortByHeader = (spec: HeaderSpec) => {
    if (!spec.sortable) return;
    // The click that ends a column drag lands on the header; never let it change the sort.
    if (resizeRef.current || Date.now() - dragEndedAt.current < 500) return;
    if (isMatrix) {
      const key = spec.key as MatrixSortKey;
      if (matrixSortKey === key) setMatrixDir(matrixDir === "asc" ? "desc" : "asc");
      else {
        setMatrixSortKey(key);
        setMatrixDir(MATRIX_NUMERIC_KEYS.includes(key) ? "desc" : "asc");
      }
      return;
    }
    if (spec.key === "expiry") changeRecordSort(cycleSort(recordSort, "expiry", "expirySoonest"));
    else changeRecordSort(cycleSort(recordSort, "newest", "oldest"));
  };
  const headerProps = { resizing, onSort: sortByHeader, onResizeStart: startResize, onResizeReset: resetWidth };

  const codeCountStrip = codeCounts && hasSearched && !error && (
    <div className="code-count-strip" aria-label="Matches per product code">
      <span className="strip-label"><Filter size={12} /> Per code{isUdi ? " · devices" : ""}</span>
      {codeCounts.map(({ code, count }) => (
        <span key={code} className={`code-count${count ? "" : " zero"}${codeUnknown(code) ? " unknown" : ""}`} title={codeUnknown(code) ? `openFDA has no product code ${code} — check the spelling` : codeLabel(code)}>
          <b>{code}</b> {count.toLocaleString()}
          {showCodeNames && codeInfo.get(code)?.name && <small>{codeInfo.get(code)?.name}</small>}
          {codeUnknown(code) && <small>not an FDA code</small>}
        </span>
      ))}
      {allTogether && !isUdi && (
        <span className={`code-count together${matrixCompanies ? "" : " zero"}`} title={`Companies whose listings cover ${appliedCodesLabel}`}>
          <b>All {appliedFilters.productCodes.length} codes</b> {matrixCompanies.toLocaleString()} {matrixCompanies === 1 ? "company" : "companies"}
        </span>
      )}
      {allTogether && isUdi && (
        <span className={`code-count together${total ? "" : " zero"}`} title={`Device records that carry ${appliedCodesLabel} together`}>
          <b>All {appliedFilters.productCodes.length} codes</b> {total.toLocaleString()} {total === 1 ? "device" : "devices"}
        </span>
      )}
    </div>
  );

  const matrixCell = (row: MatrixRow, column: MatrixColumn, repeat: boolean) => {
    switch (column) {
      case "productCode":
        return <td key={column}><button type="button" className="code-pill clickable" title={`${codeLabel(row.productCode)} — click to filter by this code`} onClick={() => addCodeFilter(row.productCode)}>{row.productCode}</button></td>;
      case "deviceType":
        return <td key={column}><b>{row.deviceType}</b></td>;
      case "company":
        return (
          <td key={column} className={repeat ? "company-repeat" : ""}>
            <div className="company-cell">
              <b>{row.company}</b>
              <button type="button" className="mini-action" onClick={() => showCompanyListings(row.company)} aria-label={`Show listings for ${row.company}`} title="Show this company's listings in the Records view"><ArrowUpRight size={13} /></button>
              <button type="button" className="mini-action" onClick={() => setUdiCompany({ company: row.company, alternates: [], codes: selectedCodes.length ? selectedCodes : [row.productCode], mode: appliedFilters.codeMatch })} aria-label={`Show GUDID devices for ${row.company}`} title="Check this company's GUDID device records (UDI) for these codes"><Barcode size={13} /></button>
            </div>
          </td>
        );
      case "coverage": {
        const held = coverage.get(row.companyKey) || new Set<string>();
        return (
          <td key={column}>
            <div className="coverage-row">
              {selectedCodes.length
                ? selectedCodes.map((code) => <span key={code} className={`code-pill${held.has(code) ? "" : " missing"}`} title={`${codeLabel(code)} — ${held.has(code) ? "held by this company" : "not held by this company"}`}>{code}</span>)
                : <span className="code-pill">{row.productCode}</span>}
            </div>
          </td>
        );
      }
      case "listedDeviceCount":
        return <td key={column} className="count-cell"><b>{row.devices.length.toLocaleString()}</b><span>Unique names</span></td>;
      case "registeredDevices":
        return <td key={column}><div className="device-name-list">{row.devices.length ? row.devices.map((device) => <span key={device}>{device}</span>) : <em>No proprietary names listed</em>}</div></td>;
      case "registrations":
        return <td key={column} className="count-cell"><b>{row.registrations.toLocaleString()}</b></td>;
      case "productListings":
        return <td key={column} className="count-cell"><b>{row.productListings.toLocaleString()}</b></td>;
      case "establishments":
        return <td key={column} className="count-cell"><b>{row.establishments.toLocaleString()}</b></td>;
      case "deviceClass":
        return <td key={column}><div className="pill-row">{row.deviceClasses.length ? row.deviceClasses.map((value) => <span key={value} className={`class-badge class-${value.toLowerCase()}`}>Class {value}</span>) : "—"}</div></td>;
      case "specialty":
        return <td key={column}><span className="cell-list">{row.specialties.join(" · ") || "—"}</span></td>;
      case "countries":
        return <td key={column}><div className="pill-row">{row.countries.length ? row.countries.map((value) => <span key={value} className="code-pill neutral">{value}</span>) : "—"}</div></td>;
      case "latestListing":
        return <td key={column}><b className="mono-value">{row.latestListing || "—"}</b></td>;
    }
  };

  const udiCell = (device: UdiDevice, column: UdiColumn) => {
    switch (column) {
      case "company":
        return <td key={column}><b>{device.company || "—"}</b><span>{device.duns ? `DUNS ${device.duns}` : "DUNS not listed"}</span></td>;
      case "brand":
        return <td key={column}><b>{device.brand || "Unnamed device"}</b><span>{device.description || "No description"}</span></td>;
      case "model":
        return <td key={column}><b className="mono-value">{device.model || "—"}</b><span>{device.catalog ? `Cat. ${device.catalog}` : "No catalog number"}</span></td>;
      case "primaryDi":
        return <td key={column}><b className="mono-value">{device.primaryDi || "—"}</b><span>{device.primaryAgency || "Agency unknown"} · {device.identifiers.length} identifier{device.identifiers.length === 1 ? "" : "s"}</span></td>;
      case "codes":
        return (
          <td key={column}>
            <div className="pill-row">
              {device.codeList.map((code) => <button key={code} type="button" className={`code-pill clickable${selectedCodes.includes(code) ? " hit" : " neutral"}`} title={`${codeLabel(code)} — click to filter by this code`} onClick={(e) => { e.stopPropagation(); addCodeFilter(code); }}>{code}</button>)}
              {!device.codeList.length && <span className="code-pill">—</span>}
            </div>
          </td>
        );
      case "premarket":
        return (
          <td key={column}>
            <div className="pill-row">
              {device.premarket.length
                ? device.premarket.map((entry) => {
                  const url = fdaPremarketUrl(entry.number);
                  return url
                    ? <a key={`${entry.number}-${entry.supplement}`} className="table-link mono-value" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open this submission on the FDA website">{entry.number}</a>
                    : <span key={`${entry.number}-${entry.supplement}`} className="mono-value">{entry.number}</span>;
                })
                : <span className="pm-none">None listed</span>}
              {device.pmExempt && <span className="pm-exempt">PM exempt</span>}
            </div>
          </td>
        );
      case "rxOtc":
        return <td key={column}><span className={`class-badge ${device.rx ? "class-2" : device.otc ? "class-1" : "class-u"}`}>{device.rx ? "Rx" : device.otc ? "OTC" : "—"}</span></td>;
      case "published":
        return <td key={column}><b className="mono-value">{device.publishDate || "—"}</b><span>{device.versionNumber ? `v${device.versionNumber}` : ""}{device.versionDate ? ` · ${device.versionDate}` : ""}</span></td>;
      case "status":
        return <td key={column}><b>{device.recordStatus || "—"}</b><span>{device.distributionStatus || ""}{device.distributionEnd ? ` · ended ${device.distributionEnd}` : ""}</span></td>;
      case "description":
        return <td key={column}><span className="cell-list">{device.description || "—"}</span></td>;
      case "gmdn":
        return <td key={column}><span className="cell-list">{device.gmdn.map((term) => term.name).join(" · ") || "—"}</span></td>;
      case "catalog":
        return <td key={column}><b className="mono-value">{device.catalog || "—"}</b></td>;
      case "identifiers":
        return <td key={column} className="count-cell"><b>{device.identifiers.length}</b><span>{device.identifiers.filter((entry) => /package/i.test(entry.type)).length} package</span></td>;
    }
  };

  return (
    <main>
      <SourceNav source="fda" view="explorer" status={`openFDA live${datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}`} statusState="connected" />

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> FDA DEVICE DATA</div>
        <div className="hero-grid">
          <div>
            <h1>Device registrations.<br /><em>Made searchable.</em></h1>
            <p>Search FDA registrations, listings and GUDID device identifiers.</p>
          </div>
          <div className="dataset-note" title={freshnessHint}>
            <Database size={20} />
            <div>
              <b>{datasetTotal ? `${datasetTotal.toLocaleString()} records` : "openFDA device registry"}</b>
              <span>{datasetUpdated ? `FDA data as of ${datasetUpdated}` : "Registrations & listings"}</span>
              <span>{checkedAt ? `Pulled ${checkedAt.toLocaleString([], dateTimeFormat)}` : "Contacting live API…"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`workspace ${filtersCollapsed ? "filters-collapsed" : ""}`} aria-label="Device data explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="filter-panel-inner">
          <div className="panel-heading">
            <div><span>02</span><h2>Filters</h2></div>
            <div className="panel-heading-actions">
              <button className="icon-button collapse-filter-panel" onClick={() => setFiltersCollapsed((current) => !current)} aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"} aria-expanded={!filtersCollapsed} title={filtersCollapsed ? "Expand filters" : "Collapse filters"}>{filtersCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            </div>
          </div>

          <div className="filter-group-heading"><span>Find</span><small>Name or code</small></div>

          <label className="field keyword-field">
            <span>Keywords</span>
            <div className="input-shell"><Search size={16} /><input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder={isUdi ? "Labeler, brand, model, description…" : "Company, device, trade name…"} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></div>
          </label>

          <div className="field">
            <span>Product codes</span>
            <div className="chip-input" onClick={() => codeInput.current?.focus()}>
              {filters.productCodes.map((code) => (
                <span key={code} className={`chip${codeUnknown(code) ? " unknown" : ""}`} title={codeUnknown(code) ? `openFDA has no product code ${code} — check the spelling` : codeLabel(code)}>
                  {code}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeCode(code); }} aria-label={`Remove ${code}`}><X size={11} /></button>
                </span>
              ))}
              <input
                ref={codeInput}
                value={codeDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/[,\s;]/.test(value)) commitCodes(value);
                  else setCodeDraft(value.toUpperCase());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (codeDraft.trim()) commitCodes(codeDraft);
                    else searchNow();
                  } else if (e.key === "Backspace" && !codeDraft && filters.productCodes.length) {
                    removeCode(filters.productCodes[filters.productCodes.length - 1]);
                  }
                }}
                onBlur={() => codeDraft.trim() && commitCodes(codeDraft)}
                list="product-code-options"
                placeholder={filters.productCodes.length ? "Add code…" : "e.g. QUH, OSM, SCR"}
                aria-label="Product codes"
              />
            </div>
            <datalist id="product-code-options">{PRESET.map((item) => <option key={item.code} value={item.code} label={item.name} />)}</datalist>
            <small className="field-hint">{viewMode === "records" ? "Add several codes — listings match any of them. Click a code in the results to add it." : "Type codes separated by commas, or click a code in the results to add it."}</small>
          </div>

          <button
            type="button"
            className={`preset-toggle ${presetActive ? "active" : ""}`}
            onClick={togglePreset}
            aria-pressed={presetActive}
            title={PRESET.map((p) => `${p.code} — ${p.name}`).join("\n")}
          >
            <Ear size={16} />
            <span className="preset-copy"><b>Hearing aid preset</b><em title={presetCounts ? "Listings per code in openFDA right now" : undefined}>{PRESET_CODES.map((code) => (presetCounts ? `${code} ${(presetCounts.get(code) ?? 0).toLocaleString()}` : code)).join(" · ")}</em></span>
            <span className="preset-state">{presetActive ? <><Check size={12} /> ON</> : "OFF"}</span>
          </button>

          {viewMode !== "records" && (
            <div className="field match-field" role="group" aria-label={isUdi ? "How several product codes combine per device" : "How several product codes combine per company"}>
              <span>Match</span>
              <div className="match-mode-switch">
                {CODE_MATCH_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={filters.codeMatch === mode.value ? "active" : ""}
                    aria-pressed={filters.codeMatch === mode.value}
                    title={mode.hint}
                    onClick={() => setCodeMatch(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <small className="field-hint">{matchHint}</small>
            </div>
          )}

          <div className="filter-group-heading narrow-heading">
            <span>Narrow</span>
            <small>{narrowFilterCount ? `${narrowFilterCount} selected` : "Optional"}</small>
          </div>

          <div className="two-col">
            <label className="field"><span>Device class</span><span className="select-wrap"><select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })}><option value="">Any class</option><option value="1">Class I</option><option value="2">Class II</option><option value="3">Class III</option><option value="U">Unclassified</option></select><ChevronDown size={14} /></span></label>
            <label className={`field${isUdi ? " inactive" : ""}`}><span>Country</span><span className="select-wrap"><select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} aria-label="Country"><option value="">Any country</option>{filters.country && !countryOptions.some((country) => country.code === filters.country) && <option value={filters.country}>{regionName(filters.country)}</option>}{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name} · {country.count.toLocaleString()}</option>)}</select><ChevronDown size={14} /></span></label>
          </div>

          {!!topCountries.length && !isUdi && <div className="country-quick" aria-label="Common countries">
            <span>Top</span>
            {topCountries.map((country) => <button key={country.code} type="button" className={filters.country === country.code ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, country: current.country === country.code ? "" : country.code }))} title={`${country.name} · ${country.count.toLocaleString()} records`}><b>{country.code}</b><em>{country.count >= 1000 ? `${Math.round(country.count / 1000)}K` : country.count.toLocaleString()}</em></button>)}
          </div>}

          {isUdi && <small className={`field-hint${udiIgnored.length ? " warn" : ""}`}>{udiIgnored.length ? `Ignored in Devices (UDI): ${udiIgnored.join(", ")} — GUDID records carry no location or establishment role.` : "GUDID device records carry no country, state or establishment role, so those filters do not apply here."}</small>}

          <details className={`more-filters${isUdi ? " inactive" : ""}`} open={Boolean(initial.filters.state || initial.filters.establishment)}>
            <summary><span>More filters</span>{(filters.state || filters.establishment) && <b>{[filters.state, filters.establishment].filter(Boolean).length}</b>}<ChevronDown size={14} /></summary>
            <div className="more-filter-fields">
              <label className="field"><span>State / region code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value.toUpperCase().slice(0, 3) })} placeholder="CA" maxLength={3} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
              <label className="field"><span>Establishment role</span><span className="select-wrap"><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All roles</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={14} /></span></label>
            </div>
          </details>

          <div className="query-actions">
            <button className={`primary${pendingChanges.length ? " attention" : ""}`} onClick={searchNow} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} {isUdi ? "Search devices" : "Search records"}</button>
            <button className="text-button" onClick={reset}>Clear all</button>
          </div>
          {pendingChanges.length > 0 && <small className="pending-note" role="status">{pendingChanges.length} unapplied change{pendingChanges.length === 1 ? "" : "s"} ({pendingChanges.join(", ")}) — press Search to update the results.</small>}
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title">
              <button className="icon-button filter-toggle" onClick={() => { setFiltersCollapsed(false); setFiltersOpen(true); }} aria-label="Open filters"><SlidersHorizontal size={18} /></button>
              <div>
                <span>03 / RESULTS{isUdi ? " · GUDID" : ""}</span>
                <h2>{!nothingToShow ? (isMatrix ? `${matrixCompanies.toLocaleString()} ${matrixCompanies === 1 ? "company" : "companies"}` : rangeLabel) : showNoResults ? (isMatrix ? "0 companies" : isUdi ? "0 devices" : "0 records") : (isUdi ? "Search devices" : "Search records")}</h2>
                {fetchedAt && (
                  <small className="fetch-meta" title={freshnessHint}>
                    {`Pulled ${fetchedAt.toLocaleString([], dateTimeFormat)}${activeDatasetDate ? ` · FDA data as of ${activeDatasetDate}` : ""}`}
                  </small>
                )}
              </div>
            </div>
            <div className="toolbar-actions">
              <div className="view-switch" role="group" aria-label="Results view">
                <button className={viewMode === "records" ? "active" : ""} onClick={() => switchView("records")}>Records</button>
                <button className={viewMode === "matrix" ? "active" : ""} onClick={() => switchView("matrix")}>Company + devices</button>
                <button className={viewMode === "udi" ? "active" : ""} onClick={() => switchView("udi")} title="FDA GUDID device identifiers (UDI) for the same codes">Devices (UDI)</button>
              </div>
              <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={15} /> Columns · {activeColumns.length}</summary>
                <div className="column-menu">
                  <div className="column-menu-head">
                    <div><b>Display columns</b><span>Saved on this device</span></div>
                    <span>{fixedLayout && <button type="button" onClick={() => setColWidths((current) => ({ ...current, [viewMode]: {} }))}>Reset widths</button>}<button type="button" onClick={resetActiveColumns}>Reset</button></span>
                  </div>
                  <div className="column-options">
                    {activeColumnOptions.map((option) => {
                      const checked = activeColumns.includes(option.key);
                      const onlyVisible = checked && activeColumns.length === 1;
                      return (
                        <label key={option.key} title={onlyVisible ? "Keep at least one column visible" : undefined}>
                          <input type="checkbox" checked={checked} disabled={onlyVisible} onChange={() => toggleActiveColumn(option.key)} />
                          <span><b>{option.label}</b><small>{option.hint}</small></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
              {isMatrix && <label className="matrix-sort">Sort <select value={matrixPreset} onChange={(e) => applyMatrixPreset(e.target.value)} aria-label="Sort company and device rows"><option value="company">Company A–Z</option><option value="code">Product code</option><option value="devices">Most devices</option><option value="registrations">Most registrations</option>{matrixPreset === "custom" && <option value="custom">{`${MATRIX_COLUMN_OPTIONS.find((option) => option.key === matrixSortKey)?.label || "Column"} ${matrixDir === "asc" ? "↑" : "↓"}`}</option>}</select></label>}
              {viewMode === "records" && <label className="matrix-sort">Sort <select value={recordSort} onChange={(e) => changeRecordSort(asRecordSort(e.target.value))} aria-label="Sort records">{RECORD_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
              {isUdi && <label className="matrix-sort">Sort <select value={UDI_SORT_OPTIONS.some((option) => option.value === recordSort) ? recordSort : "relevance"} onChange={(e) => changeRecordSort(asRecordSort(e.target.value))} aria-label="Sort devices">{UDI_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
              {activeFilters > 0 && <span className="filter-count"><Filter size={13} /> {activeFilters} active</span>}
              {!isMatrix && <label className="page-size">Rows <select value={limit} onChange={(e) => changeLimit(Number(e.target.value))} aria-label="Rows per page"><option>25</option><option>50</option><option>100</option></select></label>}
              <button
                className="secondary export-button"
                onClick={openExport}
                disabled={!total || loading || !!exportProgress}
                title={total > EXPORT_CAP ? `Exports the first ${EXPORT_CAP.toLocaleString()} matching records (openFDA limit)` : "Download matching records as Excel"}
              >
                <ArrowDownToLine size={15} /> Excel{total ? ` · ${exportCount.toLocaleString()}` : ""}
              </button>
              <button className="icon-button" onClick={copyLink} disabled={!fetchedAt} aria-label="Copy shareable link" title="Copy a shareable link to this exact view">{linkCopied ? <Check size={17} /> : <Link2 size={17} />}</button>
              <button className="icon-button" onClick={() => runSearch(skip, viewMode, appliedFilters)} disabled={loading} aria-label="Refresh results" title="Re-run this search"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
            </div>
          </div>

          {appliedChips.length > 0 && (
            <div className="applied-filters" aria-label="Applied filters">
              <span className="strip-label"><Filter size={12} /> Applied</span>
              {appliedChips.map((chip) => <span key={chip.key} className="applied-chip">{chip.label}<button type="button" onClick={() => removeChip(chip)} aria-label={`Remove filter ${chip.label}`} title="Remove this filter"><X size={11} /></button></span>)}
              <button type="button" className="text-button" onClick={reset}>Clear all</button>
            </div>
          )}

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Search interrupted</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

          {showEmpty ? (
            <div className="empty-state">
              <div className="empty-number">{datasetTotal ? `${Math.round(datasetTotal / 1000)}K` : "FDA"}</div>
              <PackageSearch size={34} />
              <h3>{isUdi ? <>Search FDA<br />device identifiers.</> : <>Search the FDA<br />device registry.</>}</h3>
              <p>{isUdi ? "Search live openFDA GUDID device records: GTINs, product codes, premarket submissions and labelers." : "Search live openFDA registration and listing records, then cross-check GUDID device identifiers."}</p>
              <div className="empty-actions">
                <button className="primary" onClick={() => runSearch(0)}><Database size={16} /> {isUdi ? "View devices" : "View records"}</button>
                <button className="secondary" onClick={applyPreset}><Ear size={15} /> Load the 6 hearing-aid codes</button>
              </div>
              {recent.length > 0 && (
                <div className="recent-searches" aria-label="Recent searches">
                  <span><History size={11} /> Recent searches on this device <button type="button" className="text-button" onClick={() => setRecent([])}>Clear</button></span>
                  <div>
                    {recent.map((entry) => (
                      <span key={entry.params} className="recent-chip">
                        <button type="button" onClick={() => applyRecent(entry)} title={entry.label}>{entry.label}</button>
                        <button type="button" className="recent-remove" onClick={() => setRecent((current) => current.filter((item) => item.params !== entry.params))} aria-label={`Forget ${entry.label}`} title="Forget this search"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : showNoResults ? (
            <>
              {codeCountStrip}
              <div className="empty-state no-results" role="status">
                <PackageSearch size={34} />
                <h3>{isMatrix && allTogether && records.length ? "No company holds every code." : isUdi && allTogether ? "No device carries every code." : isUdi ? "No devices match." : "No records match."}</h3>
                {isMatrix && allTogether && records.length ? (
                  <p>
                    No owner / operator has listings covering all of <b>{appliedCodesLabel}</b>.
                    {" "}{anyCompanies.toLocaleString()} {anyCompanies === 1 ? "company holds" : "companies hold"} at least one of them — switch to <b>Any selected code</b> to see them.
                  </p>
                ) : isUdi && allTogether ? (
                  <p>No GUDID device record carries <b>{appliedCodesLabel}</b> together{appliedFilters.keyword.trim() ? <> for “{appliedFilters.keyword.trim()}”</> : null}. Switch to <b>Any selected code</b> to see devices filed under at least one of them.</p>
                ) : (
                  <p>
                    Nothing in the openFDA {isUdi ? "GUDID device" : "registration and listing"} dataset matches this combination.
                    {unknownApplied.length > 0
                      ? <> <b>{unknownApplied.join(", ")}</b> {unknownApplied.length === 1 ? "is not" : "are not"} in FDA&apos;s product classification — check the spelling.</>
                      : isUdi ? " Try a brand or labeler name, or fewer codes." : " Try fewer filters, another country, or double-check the product codes."}
                  </p>
                )}
                <div className="empty-actions">
                  {allTogether && (records.length > 0 || isUdi) && <button className="primary" onClick={() => setCodeMatch("any")}>Match any selected code</button>}
                  <button className="secondary" onClick={reset}>Clear all filters</button>
                </div>
              </div>
            </>
          ) : (
            <>
              {codeCountStrip}
              {isMatrix && (
                <div className="matrix-note">
                  <div><Building2 size={16} /><span><b>{matrixRows.length.toLocaleString()} company-device rows</b> · {matrixCompanies.toLocaleString()} {matrixCompanies === 1 ? "company" : "companies"} · from {records.length.toLocaleString()} matching listings</span></div>
                  <span>{total > MATRIX_FETCH_CAP && `Grouping the first ${MATRIX_FETCH_CAP.toLocaleString()} of ${total.toLocaleString()} matches — coverage beyond that isn't checked · `}{allTogether && `Only companies whose listings cover ${appliedCodesLabel} are shown · `}{matrixSortKey === "company" ? "Each company's codes are listed together" : "Listed devices counts unique proprietary names"}; the barcode button checks GUDID devices for a company.</span>
                </div>
              )}
              {isUdi && (
                <div className="matrix-note">
                  <div><Barcode size={16} /><span><b>{total.toLocaleString()} GUDID device {total === 1 ? "record" : "records"}</b>{allTogether ? ` carrying ${appliedCodesLabel} together` : appliedFilters.productCodes.length ? ` under ${appliedFilters.productCodes.join(" / ")}` : ""}{udiUpdated ? ` · GUDID data as of ${udiUpdated}` : ""}</span></div>
                  <span>One row per device identifier record published by its labeler; “None listed” means the labeler declared no 510(k), PMA or De Novo number. Open a row for identifiers, GMDN terms and the labeler&apos;s registration listings.</span>
                </div>
              )}
              <div className="table-wrap" aria-live="polite">
                {viewMode === "records" ? <table className={`records-table${fixedLayout ? " table-fixed" : ""}`} style={tableStyle}>
                  {colgroup}
                  <thead><tr>
                    {RECORD_COLUMN_OPTIONS.filter((option) => recordColumns.includes(option.key)).map((option) => <HeaderCell key={option.key} spec={recordHeaderSpec(option.key)} {...headerProps} />)}
                    <HeaderCell spec={{ key: "open", label: "Open record", sortable: false, dir: null, hint: "", open: true }} {...headerProps} />
                  </tr></thead>
                  <tbody>
                    {records.map((item, index) => {
                      const matched = matchingProducts(item, appliedFilters);
                      const shown = productFilterActive(appliedFilters) ? matched : item.products || [];
                      const primary = shown[0];
                      const codes = [...new Set(shown.map((p) => p.product_code).filter(Boolean))] as string[];
                      const listingCount = item.products?.length || 0;
                      const tradeNames = listedDeviceNames(item);
                      return (
                        <tr key={`${item.registration?.registration_number || "record"}-${index}`} onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(item)}>
                          {recordColumns.includes("establishment") && <td><div className="name-cell"><b>{firmName(item)}</b><button type="button" className="mini-action row-filter" onClick={(e) => { e.stopPropagation(); applyValueFilter({ keyword: firmName(item) }); }} aria-label={`Only listings named ${firmName(item)}`} title="Only listings with this name"><ListFilter size={12} /></button></div><span>{item.establishment_type?.[0] || "Role not listed"}</span></td>}
                          {recordColumns.includes("ownerOperator") && <td><div className="name-cell"><b>{companyName(item)}</b><button type="button" className="mini-action row-filter" onClick={(e) => { e.stopPropagation(); applyValueFilter({ keyword: companyName(item) }); }} aria-label={`Only listings for ${companyName(item)}`} title="Only listings for this owner / operator"><ListFilter size={12} /></button></div><span>Operator {item.registration?.owner_operator?.owner_operator_number || "—"}</span></td>}
                          {recordColumns.includes("primaryDevice") && <td><b>{primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device"}</b><span>{primary?.openfda?.medical_specialty_description || "Specialty unavailable"}</span></td>}
                          {recordColumns.includes("productCodes") && <td>
                            <div className="pill-row">
                              {codes.slice(0, 3).map((code) => <button key={code} type="button" className="code-pill clickable" title={`${codeLabel(code)} — click to filter by this code`} onClick={(e) => { e.stopPropagation(); addCodeFilter(code); }}>{code}</button>)}
                              {codes.length > 3 && <span className="pill-more">+{codes.length - 3}</span>}
                              {!codes.length && <span className="code-pill">—</span>}
                            </div>
                          </td>}
                          {recordColumns.includes("listedProducts") && <td className="count-cell"><b>{shown.length.toLocaleString()}</b><span>{productFilterActive(appliedFilters) ? `${matched.length} of ${listingCount} match` : "Product entries"}</span></td>}
                          {recordColumns.includes("tradeNames") && <td><div className="device-name-list compact">{tradeNames.length ? tradeNames.slice(0, 5).map((name) => <span key={name}>{name}</span>) : <em>None listed</em>}{tradeNames.length > 5 && <em>+{tradeNames.length - 5} more</em>}</div></td>}
                          {recordColumns.includes("location") && <td><b>{[item.registration?.city, item.registration?.state_code].filter(Boolean).join(", ") || (item.registration?.iso_country_code ? "" : "Location unavailable")}</b>{item.registration?.iso_country_code && <span><button type="button" className={`code-pill neutral clickable${appliedFilters.country === item.registration.iso_country_code ? " hit" : ""}`} onClick={(e) => { e.stopPropagation(); toggleCountryFilter(item.registration?.iso_country_code || ""); }} title={`${regionName(item.registration.iso_country_code)} — click to filter by this country`}>{item.registration.iso_country_code}</button></span>}</td>}
                          {recordColumns.includes("listed") && <td><b className="mono-value">{latestListed(shown) || "—"}</b></td>}
                          {recordColumns.includes("deviceClass") && <td>{primary?.openfda?.device_class ? <button type="button" className={`class-badge clickable class-${primary.openfda.device_class}`} onClick={(e) => { e.stopPropagation(); toggleClassFilter(primary.openfda?.device_class || ""); }} title="Click to filter by this device class">Class {primary.openfda.device_class}</button> : <span className="class-badge class-u">—</span>}</td>}
                          {recordColumns.includes("premarket") && <td><PremarketLinks item={item} stop /></td>}
                          {recordColumns.includes("expiry") && <td><b>{item.registration?.reg_expiry_date_year || "—"}</b></td>}
                          {recordColumns.includes("registrationNumber") && <td><b className="mono-value">{item.registration?.registration_number || "—"}</b></td>}
                          {recordColumns.includes("feiNumber") && <td><b className="mono-value">{item.registration?.fei_number || "—"}</b></td>}
                          <td><ArrowRight size={17} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table> : isMatrix ? <table className={`matrix-table${fixedLayout ? " table-fixed" : ""}`} style={tableStyle}>
                  {colgroup}
                  <thead><tr>
                    {visibleMatrixColumns.map((column) => <HeaderCell key={column} spec={matrixHeaderSpec(column)} {...headerProps} />)}
                  </tr></thead>
                  <tbody>
                    {matrixRows.map((row, index) => {
                      const sameCompanyAsPrevious = index > 0 && matrixRows[index - 1].companyKey === row.companyKey;
                      const grouped = matrixSortKey === "company";
                      return (
                        <tr key={row.key} className={grouped && index > 0 && !sameCompanyAsPrevious ? "group-start" : undefined}>
                          {visibleMatrixColumns.map((column) => matrixCell(row, column, grouped && sameCompanyAsPrevious))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table> : <table className={`records-table udi-table${fixedLayout ? " table-fixed" : ""}`} style={tableStyle}>
                  {colgroup}
                  <thead><tr>
                    {UDI_COLUMN_OPTIONS.filter((option) => udiColumns.includes(option.key)).map((option) => <HeaderCell key={option.key} spec={udiHeaderSpec(option.key)} {...headerProps} />)}
                    <HeaderCell spec={{ key: "open", label: "Open device", sortable: false, dir: null, hint: "", open: true }} {...headerProps} />
                  </tr></thead>
                  <tbody>
                    {udiDevices.map((device) => (
                      <tr key={device.key} onClick={() => setSelectedDevice(device)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelectedDevice(device)}>
                        {UDI_COLUMN_OPTIONS.filter((option) => udiColumns.includes(option.key)).map((option) => udiCell(device, option.key))}
                        <td><ArrowRight size={17} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
              </div>
              {!isMatrix && <div className="pagination">
                <span>{rangeLabel}</span>
                <div><button className="secondary" onClick={() => runSearch(Math.max(0, skip - limit), viewMode, appliedFilters)} disabled={skip === 0 || loading}><ArrowLeft size={15} /> Previous</button><button className="secondary" onClick={() => runSearch(skip + limit, viewMode, appliedFilters)} disabled={skip + pageCount >= total || loading}>Next <ArrowRight size={15} /></button></div>
              </div>}
            </>
          )}
          {(loading || exportProgress) && <div className="loading-layer"><div className="loading-note"><LoaderCircle className="spin" size={28} /><span>{exportProgress || loadingNote || (isUdi ? "Searching FDA GUDID…" : "Searching openFDA…")}</span></div></div>}
        </section>
      </section>

      {selected && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <aside className="drawer" aria-label="Registration details">
            <div className="drawer-top"><span>RECORD DETAIL</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button></div>
            <div className="drawer-hero"><span className="record-id">REG {selected.registration?.registration_number || "—"}</span><h2>{firmName(selected)}</h2><p><MapPin size={15} /> {locationSummary(selected)}{companyName(selected) !== firmName(selected) ? ` · ${companyName(selected)}` : ""}</p></div>
            <div className="detail-stats">
              <div><span>FEI number</span><b>{selected.registration?.fei_number || "—"}</b></div>
              <div><span>Expiry year</span><b>{selected.registration?.reg_expiry_date_year || "—"}</b></div>
              <div><span>Products</span><b>{selected.products?.length || 0}</b></div>
              <div><span>510(k) / PMA</span><b><PremarketLinks item={selected} /></b></div>
            </div>
            <section className="detail-section"><h3><Building2 size={16} /> Establishment roles</h3><div className="chips">{selected.establishment_type?.map((type) => <span key={type}>{type}</span>) || <span>Not listed</span>}</div></section>
            <section className="detail-section">
              <h3>
                <PackageSearch size={16} /> Device listings
                {productFilterActive(appliedFilters) && <i className="listing-note">{drawerProducts.filter((entry) => entry.matches).length} of {drawerProducts.length} match filter</i>}
              </h3>
              <div className="product-list">
                {drawerProducts.length ? drawerProducts.map(({ product, matches }, index) => (
                  <article key={`${product.product_code}-${index}`} className={productFilterActive(appliedFilters) && !matches ? "dim" : ""}>
                    <div>
                      {product.product_code
                        ? <a className="code-pill link" href={fdaProductCodeUrl(product.product_code)} target="_blank" rel="noreferrer" title={`${codeLabel(product.product_code)} — open the FDA product classification page`}>{product.product_code} <ExternalLink size={10} /></a>
                        : <span className="code-pill">—</span>}
                      <span>
                        {productFilterActive(appliedFilters) && matches && <span className="match-tag">Match</span>}
                        <span className={`class-badge class-${product.openfda?.device_class || "u"}`}>{product.openfda?.device_class ? `Class ${product.openfda.device_class}` : "Unclassified"}</span>
                      </span>
                    </div>
                    <h4>{product.openfda?.device_name || "Unnamed device"}</h4>
                    <p>{product.openfda?.medical_specialty_description || "Specialty unavailable"} · Regulation {product.openfda?.regulation_number || "—"}{product.created_date ? ` · Listed ${product.created_date}` : ""}</p>
                  </article>
                )) : <p>No device listings attached.</p>}
              </div>
            </section>
            {listedDeviceNames(selected).length > 0 && (
              <section className="detail-section">
                <h3>Trade names</h3>
                <div className="chips">{listedDeviceNames(selected).map((name) => <span key={name}>{name}</span>)}</div>
              </section>
            )}
            <section className="detail-section">
              <h3><Barcode size={16} /> GUDID devices (UDI) <i className="listing-note">{companyName(selected)} · {listingCodesForUdi(selected, appliedFilters).join(" / ") || "any code"}</i></h3>
              <UdiCompanyPanel
                company={companyName(selected)}
                alternates={[firmName(selected)]}
                codes={listingCodesForUdi(selected, appliedFilters)}
                mode="any"
                aliases={aliasesFor(companyName(selected))}
                onAddAlias={(name) => addAlias(companyName(selected), name)}
                onRemoveAlias={(name) => removeAlias(companyName(selected), name)}
                onOpenDevicesView={(labeler) => openUdiView(labeler, listingCodesForUdi(selected, appliedFilters))}
                onSelectDevice={(device) => { setSelected(null); setSelectedDevice(device); }}
              />
            </section>
            <section className="detail-section raw-section"><details><summary>View raw JSON <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected, null, 2)}</pre></details></section>
          </aside>
        </div>
      )}

      {selectedDevice && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelectedDevice(null)}>
          <aside className="drawer" aria-label="GUDID device details">
            <div className="drawer-top"><span>GUDID DEVICE · UDI</span><button className="icon-button" onClick={() => setSelectedDevice(null)} aria-label="Close details"><X size={19} /></button></div>
            <div className="drawer-hero">
              <span className="record-id">{selectedDevice.company || "Unknown labeler"}</span>
              <h2>{selectedDevice.brand || "Unnamed device"}</h2>
              <p><Barcode size={15} /> {selectedDevice.model || "No model number"}{selectedDevice.catalog ? ` · Cat. ${selectedDevice.catalog}` : ""}{selectedDevice.primaryDi && <> · <a href={accessGudidUrl(selectedDevice.primaryDi)} target="_blank" rel="noreferrer">AccessGUDID <ExternalLink size={11} /></a></>}</p>
            </div>
            <UdiDeviceDetail device={selectedDevice} highlight={selectedCodes} codeLabel={codeLabel} onShowListings={showCompanyListings} />
          </aside>
        </div>
      )}

      {udiCompany && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setUdiCompany(null)}>
          <aside className="drawer" aria-label="GUDID devices for company">
            <div className="drawer-top"><span>GUDID DEVICES · UDI</span><button className="icon-button" onClick={() => setUdiCompany(null)} aria-label="Close"><X size={19} /></button></div>
            <div className="drawer-hero">
              <span className="record-id">{udiCompany.codes.join(" + ") || "All codes"}{udiCompany.codes.length > 1 ? (udiCompany.mode === "all" ? " · every code per device" : " · any code") : ""}</span>
              <h2>{udiCompany.company}</h2>
              <p><Barcode size={15} /> Device identifier records this labeler published to FDA&apos;s GUDID</p>
            </div>
            <section className="detail-section">
              <UdiCompanyPanel
                company={udiCompany.company}
                alternates={udiCompany.alternates}
                codes={udiCompany.codes}
                mode={udiCompany.mode}
                aliases={aliasesFor(udiCompany.company)}
                onAddAlias={(name) => addAlias(udiCompany.company, name)}
                onRemoveAlias={(name) => removeAlias(udiCompany.company, name)}
                onOpenDevicesView={(labeler) => openUdiView(labeler, udiCompany.codes)}
                onSelectDevice={(device) => { setUdiCompany(null); setSelectedDevice(device); }}
              />
            </section>
          </aside>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        title="Pack this workbook."
        countLabel="Choose columns and which rows to include."
        note={isMatrix ? "Uses the company + devices view." : isUdi ? "Uses the Devices (UDI) view." : "Uses the records view."}
        toggles={activeColumnOptions.map((option) => ({ id: option.key, label: option.label, hint: option.hint }))}
        selected={exportColumnIds}
        confirming={!!exportProgress}
        filename={exportFilename}
        scope={exportScope}
        clickableLinks={false}
        pageCount={pageCount}
        allCount={exportCount}
        filters={[
          appliedFilters.keyword,
          ...appliedFilters.productCodes,
          allTogether ? (isUdi ? "Every code on the device" : "Companies holding all codes") : "",
          isUdi ? "" : appliedFilters.country,
          appliedFilters.deviceClass && `Class ${appliedFilters.deviceClass}`,
          viewMode !== "matrix" && recordSort !== "relevance" ? (isUdi ? UDI_SORT_OPTIONS : RECORD_SORT_OPTIONS).find((option) => option.value === recordSort)?.label || "" : "",
        ].filter(Boolean) as string[]}
        onFilename={(value) => { setExportFilename(value); setExportFilenameCustom(true); }}
        onScope={setExportScope}
        onChange={setExportColumnIds}
        onUseVisible={() => setExportColumnIds([...activeColumns])}
        onCancel={() => !exportProgress && setExportOpen(false)}
        onConfirm={() => void exportCsv()}
      />
    </main>
  );
}

/** Company first when rows are grouped by company; otherwise the canonical column order. */
function orderMatrixColumns(columns: readonly MatrixColumn[], sortKey: MatrixSortKey): MatrixColumn[] {
  const order: MatrixColumn[] = sortKey === "company" ? ["company", "coverage", ...MATRIX_KEYS.filter((key) => key !== "company" && key !== "coverage")] : MATRIX_KEYS;
  return order.filter((key) => columns.includes(key));
}
