"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
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
  type OpenFdaMeta,
  type RecentSearch,
  type RecordItem,
  type RecordSort,
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
  premarketSummary,
  productFilterActive,
  recordSortParam,
  rememberSearch,
  sortMatrixRows,
} from "./fda-shared";
import SourceNav from "./source-nav";
import { downloadExcel, type ExcelValue } from "./excel-export";
import { ExportDialog, sanitizeExportFilename } from "./export-dialog";

type CountryOption = { code: string; count: number; name: string };
type RecordColumn = "establishment" | "ownerOperator" | "primaryDevice" | "productCodes" | "listedProducts" | "tradeNames" | "location" | "deviceClass" | "premarket" | "expiry" | "registrationNumber" | "feiNumber";
type MatrixColumn = "productCode" | "deviceType" | "company" | "coverage" | "listedDeviceCount" | "registeredDevices" | "registrations" | "productListings" | "establishments" | "deviceClass" | "specialty" | "countries" | "latestListing";

const RECORD_COLUMN_OPTIONS: { key: RecordColumn; label: string; hint: string }[] = [
  { key: "establishment", label: "Establishment", hint: "Registered facility name" },
  { key: "ownerOperator", label: "Owner / operator", hint: "Parent company or legal operator" },
  { key: "primaryDevice", label: "Primary device", hint: "First matching FDA device type" },
  { key: "productCodes", label: "Product codes", hint: "Matching FDA product codes" },
  { key: "listedProducts", label: "Listed products", hint: "Matching product entries on the record" },
  { key: "tradeNames", label: "Trade names", hint: "Proprietary device names" },
  { key: "location", label: "Location", hint: "City, state and country" },
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

const DEFAULT_RECORD_COLUMNS: RecordColumn[] = ["establishment", "primaryDevice", "productCodes", "listedProducts", "location", "deviceClass"];
const DEFAULT_MATRIX_COLUMNS: MatrixColumn[] = ["productCode", "deviceType", "company", "coverage", "listedDeviceCount", "registeredDevices", "registrations"];

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
  if (view === "records" && sort !== "relevance") params.set("sort", sort);
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

export default function Home() {
  const [initial] = useState(initialStateFromUrl);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [codeDraft, setCodeDraft] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [skip, setSkip] = useState(0);
  const [recordSort, setRecordSort] = useState<RecordSort>(initial.sort);
  const [loading, setLoading] = useState(false);
  const [loadingNote, setLoadingNote] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [exportProgress, setExportProgress] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "page">("all");
  const [exportFilename, setExportFilename] = useState("");
  const [exportFilenameCustom, setExportFilenameCustom] = useState(false);
  const [exportColumnIds, setExportColumnIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [datasetUpdated, setDatasetUpdated] = useState("");
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [codeCounts, setCodeCounts] = useState<{ code: string; count: number }[] | null>(null);
  const [codeInfo, setCodeInfo] = useState<Map<string, CodeInfo | null>>(() => new Map());
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [recentReady, setRecentReady] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [recordColumns, setRecordColumns] = useState<RecordColumn[]>(DEFAULT_RECORD_COLUMNS);
  const [matrixColumns, setMatrixColumns] = useState<MatrixColumn[]>(DEFAULT_MATRIX_COLUMNS);
  const [columnPrefsReady, setColumnPrefsReady] = useState(false);
  const [apiCountries, setApiCountries] = useState<CountryOption[]>([]);
  // With ALL on, a company's codes belong together, so company order is the natural default.
  const [matrixSort, setMatrixSort] = useState<MatrixSort>(initial.filters.codeMatch === "all" ? "company" : "code");
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

  /** ALL only exists in the Company + devices view, and only changes anything with two or more applied codes. */
  const allTogether = viewMode === "matrix" && codeMatchApplies(appliedFilters);
  const matchHint = filters.codeMatch === "all"
    ? (filters.productCodes.length > 1
      ? "Only companies whose listings cover every selected code, listed company by company."
      : "All needs two or more codes — add another to require every code per company.")
    : "Companies with a listing for at least one selected code.";

  const codeLabel = (code: string) => codeInfo.get(code)?.name || CODE_NAMES.get(code) || `Product code ${code}`;
  const codeUnknown = (code: string) => codeInfo.has(code) && codeInfo.get(code) === null;

  /** Company + devices groups; with ALL, only companies covering every selected code survive. */
  const matrixRows = useMemo(
    () => sortMatrixRows(buildMatrix(records, appliedFilters), matrixSort),
    [records, appliedFilters, matrixSort],
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
      setLoading(true);
      setLoadingNote("");
      try {
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
        setTotal(data.meta?.results?.total || 0);
        setSkip(requestedView === "matrix" ? 0 : nextSkip);
        setAppliedFilters(nextFilters);
        setFetchedAt(new Date());
        setCheckedAt(new Date());
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        syncUrl(nextFilters, requestedView, nextSort);
        if (nextSkip === 0) setRecent((current) => rememberSearch(current, nextFilters, requestedView));
        if (nextFilters.productCodes.length) {
          const countParams = new URLSearchParams({ count: "products.product_code", limit: "1000" });
          if (search) countParams.set("search", search);
          fetchOpenFda<{ term?: string; count?: number }>(`${API}?${countParams.toString()}`)
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
        setRecords([]);
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
    if (initial.autorun) queueMicrotask(() => runSearch(0, initial.view, initial.filters, 25, initial.sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const savedRecords = JSON.parse(localStorage.getItem("fda-record-columns") || "null") as RecordColumn[] | null;
      const savedMatrix = JSON.parse(localStorage.getItem("fda-matrix-columns") || "null") as MatrixColumn[] | null;
      const validRecords = savedRecords?.filter((key) => RECORD_COLUMN_OPTIONS.some((option) => option.key === key));
      let validMatrix = savedMatrix?.filter((key) => MATRIX_COLUMN_OPTIONS.some((option) => option.key === key));
      // One-time migration: surface the "Codes held" column for people who saved their columns before it existed.
      if (validMatrix?.length && !validMatrix.includes("coverage") && !localStorage.getItem("fda-matrix-columns-coverage")) {
        const at = validMatrix.indexOf("company");
        validMatrix = at >= 0 ? [...validMatrix.slice(0, at + 1), "coverage", ...validMatrix.slice(at + 1)] : [...validMatrix, "coverage"];
      }
      localStorage.setItem("fda-matrix-columns-coverage", "1");
      queueMicrotask(() => {
        if (validRecords?.length) setRecordColumns(validRecords);
        if (validMatrix?.length) setMatrixColumns(validMatrix);
        setColumnPrefsReady(true);
      });
    } catch {
      // Ignore malformed local preferences and use the defaults.
      queueMicrotask(() => setColumnPrefsReady(true));
    }
  }, []);

  useEffect(() => {
    if (!columnPrefsReady) return;
    localStorage.setItem("fda-record-columns", JSON.stringify(recordColumns));
    localStorage.setItem("fda-matrix-columns", JSON.stringify(matrixColumns));
  }, [columnPrefsReady, recordColumns, matrixColumns]);

  useEffect(() => {
    const saved = localStorage.getItem("fda-filter-panel-collapsed") === "1";
    let storedRecent: RecentSearch[] = [];
    try {
      storedRecent = parseRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY));
    } catch {
      storedRecent = [];
    }
    queueMicrotask(() => {
      setFiltersCollapsed(saved);
      setFilterPanelPrefsReady(true);
      setRecent((current) => (current.length ? current : storedRecent));
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
    } catch {
      // Storage may be full or blocked; recent searches are a convenience only.
    }
  }, [recentReady, recent]);

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

  const toggleRecordColumn = (key: RecordColumn) => {
    setRecordColumns((current) => current.includes(key)
      ? (current.length > 1 ? current.filter((column) => column !== key) : current)
      : [...current, key]);
  };

  const toggleMatrixColumn = (key: MatrixColumn) => {
    setMatrixColumns((current) => current.includes(key)
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

  /** ANY/ALL is a client-side rollup over the listings already loaded, so switching is instant — no new request. */
  const setCodeMatch = (mode: CodeMatchMode) => {
    if (mode === "all" && matrixSort === "code") setMatrixSort("company");
    if (filters.codeMatch === mode && appliedFilters.codeMatch === mode) return;
    setFilters((current) => ({ ...current, codeMatch: mode }));
    if (!hasSearched) return;
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
    if (hasSearched && viewMode === "records") runSearch(0, "records", appliedFilters, limit, nextSort);
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

  /** Jump from a Company + devices row to that company's listings, keeping the current codes and narrowing filters. */
  const showCompanyListings = (company: string) => {
    const next = { ...appliedFilters, keyword: company };
    setFilters(next);
    setViewMode("records");
    runSearch(0, "records", next);
  };

  const applyRecent = (entry: RecentSearch) => {
    const params = new URLSearchParams(entry.params);
    const state = filtersFromParams(params);
    const sort = asRecordSort(params.get("sort"));
    setFilters(state.filters);
    setViewMode(state.view);
    setRecordSort(sort);
    setCodeDraft("");
    if (state.filters.codeMatch === "all" && matrixSort === "code") setMatrixSort("company");
    runSearch(0, state.view, state.filters, limit, sort);
  };

  const reset = () => {
    searchSeq.current += 1;
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCodeDraft("");
    setCodeCounts(null);
    setRecords([]);
    setTotal(0);
    setSkip(0);
    setError("");
    setLoading(false);
    setLoadingNote("");
    setSelected(null);
    setFetchedAt(null);
    setRecordSort("relevance");
    syncUrl(EMPTY_FILTERS, viewMode, "relevance");
  };

  const fetchAllMatching = async () => {
    const cap = Math.min(total, EXPORT_CAP);
    setExportProgress(`Downloading 0 of ${cap.toLocaleString()} records…`);
    const { results } = await fetchListingPages<RecordItem>(API, buildSearch(appliedFilters), cap, (loaded, target) => {
      setExportProgress(`Downloading ${loaded.toLocaleString()} of ${target.toLocaleString()} records…`);
    }, viewMode === "records" ? recordSortParam(recordSort) : "");
    return results;
  };

  const exportBaseName = () => {
    const codes = appliedFilters.productCodes;
    const codesPart = codes.length ? codes.join("+") : "all";
    const modePart = allTogether ? "-all-codes" : "";
    return `${viewMode === "matrix" ? "fda-devices-matrix" : "fda-devices"}-${codesPart}${modePart}-${new Date().toISOString().slice(0, 10)}`;
  };

  const exportCsv = async () => {
    if (!total || exportProgress) return;
    setError("");
    try {
      const all = exportScope === "page" ? records : await fetchAllMatching();
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
        const chosen = orderMatrixColumns(exportColumns.length ? exportColumns : matrixColumns, matrixSort);
        // buildMatrix applies the same ANY/ALL company rollup the table uses, on the full export set.
        const rows = sortMatrixRows(buildMatrix(all, appliedFilters), matrixSort)
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

  const rangeLabel = useMemo(() => {
    if (!total) return "0 records";
    return `${(skip + 1).toLocaleString()}–${Math.min(skip + records.length, total).toLocaleString()} of ${total.toLocaleString()}`;
  }, [records.length, skip, total]);

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
    if (hasSearched) {
      runSearch(0, nextView, appliedFilters);
    } else {
      syncUrl(appliedFilters, nextView, recordSort);
    }
  };

  const openExport = () => {
    setExportColumnIds(viewMode === "matrix" ? matrixColumns : recordColumns);
    if (!exportFilenameCustom) setExportFilename(`${exportBaseName()}.xlsx`);
    setExportOpen(true);
  };

  const exportCount = Math.min(total, EXPORT_CAP);
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const freshnessHint = "\"FDA data as of\" is the date openFDA last rebuilt this dataset — records newer than that aren't published yet. \"Pulled\" is when this page last called the live API.";
  const nothingToShow = viewMode === "matrix" ? !matrixRows.length : !records.length;
  const showNoResults = hasSearched && !loading && !error && nothingToShow;
  const showEmpty = nothingToShow && !loading && !showNoResults;
  const appliedCodesLabel = appliedFilters.productCodes.join(" + ");
  const visibleMatrixColumns = orderMatrixColumns(matrixColumns, matrixSort);
  const showCodeNames = selectedCodes.length > 0 && selectedCodes.length <= 3;

  const codeCountStrip = codeCounts && hasSearched && !error && (
    <div className="code-count-strip" aria-label="Matches per product code">
      <span className="strip-label"><Filter size={12} /> Per code</span>
      {codeCounts.map(({ code, count }) => (
        <span key={code} className={`code-count${count ? "" : " zero"}${codeUnknown(code) ? " unknown" : ""}`} title={codeUnknown(code) ? `openFDA has no product code ${code} — check the spelling` : codeLabel(code)}>
          <b>{code}</b> {count.toLocaleString()}
          {showCodeNames && codeInfo.get(code)?.name && <small>{codeInfo.get(code)?.name}</small>}
          {codeUnknown(code) && <small>not an FDA code</small>}
        </span>
      ))}
      {allTogether && (
        <span className={`code-count together${matrixCompanies ? "" : " zero"}`} title={`Companies whose listings cover ${appliedCodesLabel}`}>
          <b>All {appliedFilters.productCodes.length} codes</b> {matrixCompanies.toLocaleString()} {matrixCompanies === 1 ? "company" : "companies"}
        </span>
      )}
    </div>
  );

  const matrixCell = (row: MatrixRow, column: MatrixColumn, repeat: boolean) => {
    switch (column) {
      case "productCode":
        return <td key={column}><span className="code-pill" title={codeLabel(row.productCode)}>{row.productCode}</span></td>;
      case "deviceType":
        return <td key={column}><b>{row.deviceType}</b></td>;
      case "company":
        return (
          <td key={column} className={repeat ? "company-repeat" : ""}>
            <div className="company-cell">
              <b>{row.company}</b>
              <button type="button" className="mini-action" onClick={() => showCompanyListings(row.company)} aria-label={`Show listings for ${row.company}`} title="Show this company's listings in the Records view"><ArrowUpRight size={13} /></button>
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

  return (
    <main>
      <SourceNav source="fda" view="explorer" status={`openFDA live${datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}`} statusState="connected" />

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> FDA DEVICE DATA</div>
        <div className="hero-grid">
          <div>
            <h1>Device registrations.<br /><em>Made searchable.</em></h1>
            <p>Search FDA registrations and listings.</p>
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
            <div className="input-shell"><Search size={16} /><input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="Company, device, trade name…" onKeyDown={(e) => e.key === "Enter" && searchNow()} /></div>
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
            {viewMode === "matrix" ? (
              <>
                <div className="match-mode" role="group" aria-label="How several product codes combine per company">
                  <span className="match-mode-label">Match</span>
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
                </div>
                <small className="field-hint">{matchHint}</small>
              </>
            ) : (
              <small className="field-hint">Add several codes — listings match any of them. Switch to Company + devices to require every code per company.</small>
            )}
          </div>

          <button
            type="button"
            className={`preset-toggle ${presetActive ? "active" : ""}`}
            onClick={togglePreset}
            aria-pressed={presetActive}
            title={PRESET.map((p) => `${p.code} — ${p.name}`).join("\n")}
          >
            <Ear size={16} />
            <span className="preset-copy"><b>Hearing aid preset</b><em>{PRESET_CODES.join(" · ")}</em></span>
            <span className="preset-state">{presetActive ? <><Check size={12} /> ON</> : "OFF"}</span>
          </button>

          <div className="filter-group-heading narrow-heading">
            <span>Narrow</span>
            <small>{narrowFilterCount ? `${narrowFilterCount} selected` : "Optional"}</small>
          </div>

          <div className="two-col">
            <label className="field"><span>Device class</span><span className="select-wrap"><select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })}><option value="">Any class</option><option value="1">Class I</option><option value="2">Class II</option><option value="3">Class III</option><option value="U">Unclassified</option></select><ChevronDown size={14} /></span></label>
            <label className="field"><span>Country</span><input value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value.toUpperCase().slice(0, 2) })} list="country-options" placeholder="US" maxLength={2} autoComplete="off" onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
          </div>
          <datalist id="country-options">{countryOptions.map((country) => <option key={country.code} value={country.code} label={`${country.name} · ${country.count.toLocaleString()} records`} />)}</datalist>

          {!!topCountries.length && <div className="country-quick" aria-label="Common countries">
            <span>Top</span>
            {topCountries.map((country) => <button key={country.code} type="button" className={filters.country === country.code ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, country: current.country === country.code ? "" : country.code }))} title={`${country.name} · ${country.count.toLocaleString()} records`}><b>{country.code}</b><em>{country.count >= 1000 ? `${Math.round(country.count / 1000)}K` : country.count.toLocaleString()}</em></button>)}
          </div>}

          <details className="more-filters" open={Boolean(initial.filters.state || initial.filters.establishment)}>
            <summary><span>More filters</span>{(filters.state || filters.establishment) && <b>{[filters.state, filters.establishment].filter(Boolean).length}</b>}<ChevronDown size={14} /></summary>
            <div className="more-filter-fields">
              <label className="field"><span>State / region code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value.toUpperCase().slice(0, 3) })} placeholder="CA" maxLength={3} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
              <label className="field"><span>Establishment role</span><span className="select-wrap"><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All roles</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={14} /></span></label>
            </div>
          </details>

          <div className="query-actions">
            <button className="primary" onClick={searchNow} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Search records</button>
            <button className="text-button" onClick={reset}>Clear all</button>
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title">
              <button className="icon-button filter-toggle" onClick={() => { setFiltersCollapsed(false); setFiltersOpen(true); }} aria-label="Open filters"><SlidersHorizontal size={18} /></button>
              <div>
                <span>03 / RESULTS</span>
                <h2>{!nothingToShow ? (viewMode === "matrix" ? `${matrixCompanies.toLocaleString()} ${matrixCompanies === 1 ? "company" : "companies"}` : rangeLabel) : showNoResults ? (viewMode === "matrix" ? "0 companies" : "0 records") : "Search records"}</h2>
                {fetchedAt && (
                  <small className="fetch-meta" title={freshnessHint}>
                    {`Pulled ${fetchedAt.toLocaleString([], dateTimeFormat)}${datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}`}
                  </small>
                )}
              </div>
            </div>
            <div className="toolbar-actions">
              <div className="view-switch" role="group" aria-label="Results view">
                <button className={viewMode === "records" ? "active" : ""} onClick={() => switchView("records")}>Records</button>
                <button className={viewMode === "matrix" ? "active" : ""} onClick={() => switchView("matrix")}>Company + devices</button>
              </div>
              <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={15} /> Columns · {viewMode === "records" ? recordColumns.length : matrixColumns.length}</summary>
                <div className="column-menu">
                  <div className="column-menu-head">
                    <div><b>Display columns</b><span>Saved on this device</span></div>
                    <button type="button" onClick={() => viewMode === "records" ? setRecordColumns(DEFAULT_RECORD_COLUMNS) : setMatrixColumns(DEFAULT_MATRIX_COLUMNS)}>Reset</button>
                  </div>
                  <div className="column-options">
                    {(viewMode === "records" ? RECORD_COLUMN_OPTIONS : MATRIX_COLUMN_OPTIONS).map((option) => {
                      const checked = viewMode === "records"
                        ? recordColumns.includes(option.key as RecordColumn)
                        : matrixColumns.includes(option.key as MatrixColumn);
                      const onlyVisible = checked && (viewMode === "records" ? recordColumns.length === 1 : matrixColumns.length === 1);
                      return (
                        <label key={option.key} title={onlyVisible ? "Keep at least one column visible" : undefined}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={onlyVisible}
                            onChange={() => viewMode === "records"
                              ? toggleRecordColumn(option.key as RecordColumn)
                              : toggleMatrixColumn(option.key as MatrixColumn)}
                          />
                          <span><b>{option.label}</b><small>{option.hint}</small></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
              {viewMode === "matrix" && <label className="matrix-sort">Sort <select value={matrixSort} onChange={(e) => setMatrixSort(e.target.value as MatrixSort)} aria-label="Sort company and device rows"><option value="company">Company A–Z</option><option value="code">Product code</option><option value="devices">Most devices</option><option value="registrations">Most registrations</option></select></label>}
              {viewMode === "records" && <label className="matrix-sort">Sort <select value={recordSort} onChange={(e) => changeRecordSort(asRecordSort(e.target.value))} aria-label="Sort records">{RECORD_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
              {activeFilters > 0 && <span className="filter-count"><Filter size={13} /> {activeFilters} active</span>}
              {viewMode === "records" && <label className="page-size">Rows <select value={limit} onChange={(e) => changeLimit(Number(e.target.value))} aria-label="Rows per page"><option>25</option><option>50</option><option>100</option></select></label>}
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

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Search interrupted</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

          {showEmpty ? (
            <div className="empty-state">
              <div className="empty-number">{datasetTotal ? `${Math.round(datasetTotal / 1000)}K` : "FDA"}</div>
              <PackageSearch size={34} />
              <h3>Search the FDA<br />device registry.</h3>
              <p>Search live openFDA registration and listing records.</p>
              <div className="empty-actions">
                <button className="primary" onClick={() => runSearch(0)}><Database size={16} /> View records</button>
                <button className="secondary" onClick={applyPreset}><Ear size={15} /> Load the 6 hearing-aid codes</button>
              </div>
              {recent.length > 0 && (
                <div className="recent-searches" aria-label="Recent searches">
                  <span><History size={11} /> Recent searches on this device</span>
                  <div>
                    {recent.map((entry) => <button key={entry.params} type="button" onClick={() => applyRecent(entry)} title={entry.label}>{entry.label}</button>)}
                  </div>
                </div>
              )}
            </div>
          ) : showNoResults ? (
            <>
              {codeCountStrip}
              <div className="empty-state no-results" role="status">
                <PackageSearch size={34} />
                <h3>{allTogether && records.length ? "No company holds every code." : "No records match."}</h3>
                {allTogether && records.length ? (
                  <p>
                    No owner / operator has listings covering all of <b>{appliedCodesLabel}</b>.
                    {" "}{anyCompanies.toLocaleString()} {anyCompanies === 1 ? "company holds" : "companies hold"} at least one of them — switch to <b>Any selected code</b> to see them.
                  </p>
                ) : (
                  <p>
                    Nothing in the openFDA registration and listing dataset matches this combination.
                    {unknownApplied.length > 0
                      ? <> <b>{unknownApplied.join(", ")}</b> {unknownApplied.length === 1 ? "is not" : "are not"} in FDA&apos;s product classification — check the spelling.</>
                      : " Try fewer filters, another country, or double-check the product codes."}
                  </p>
                )}
                <div className="empty-actions">
                  {allTogether && records.length > 0 && <button className="primary" onClick={() => setCodeMatch("any")}>Match any selected code</button>}
                  <button className="secondary" onClick={reset}>Clear all filters</button>
                </div>
              </div>
            </>
          ) : (
            <>
              {codeCountStrip}
              {viewMode === "matrix" && (
                <div className="matrix-note">
                  <div><Building2 size={16} /><span><b>{matrixRows.length.toLocaleString()} company-device rows</b> · {matrixCompanies.toLocaleString()} {matrixCompanies === 1 ? "company" : "companies"} · from {records.length.toLocaleString()} matching listings</span></div>
                  <span>{total > MATRIX_FETCH_CAP && `Grouping the first ${MATRIX_FETCH_CAP.toLocaleString()} of ${total.toLocaleString()} matches — coverage beyond that isn't checked · `}{allTogether && `Only companies whose listings cover ${appliedCodesLabel} are shown · `}{matrixSort === "company" ? "Each company's codes are listed together" : "Listed devices counts unique proprietary names"}; Excel export fetches every available match.</span>
                </div>
              )}
              <div className="table-wrap" aria-live="polite">
                {viewMode === "records" ? <table className="records-table">
                  <thead><tr>
                    {recordColumns.includes("establishment") && <th>Establishment</th>}
                    {recordColumns.includes("ownerOperator") && <th>Owner / operator</th>}
                    {recordColumns.includes("primaryDevice") && <th>Primary device</th>}
                    {recordColumns.includes("productCodes") && <th>Product codes</th>}
                    {recordColumns.includes("listedProducts") && <th className="numeric-head">Listed products</th>}
                    {recordColumns.includes("tradeNames") && <th>Trade names</th>}
                    {recordColumns.includes("location") && <th>Location</th>}
                    {recordColumns.includes("deviceClass") && <th>Class</th>}
                    {recordColumns.includes("premarket") && <th>510(k) / PMA</th>}
                    {recordColumns.includes("expiry") && <th>Expiry</th>}
                    {recordColumns.includes("registrationNumber") && <th>Registration #</th>}
                    {recordColumns.includes("feiNumber") && <th>FEI number</th>}
                    <th aria-label="Open record" />
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
                          {recordColumns.includes("establishment") && <td><b>{firmName(item)}</b><span>{item.establishment_type?.[0] || "Role not listed"}</span></td>}
                          {recordColumns.includes("ownerOperator") && <td><b>{companyName(item)}</b><span>Operator {item.registration?.owner_operator?.owner_operator_number || "—"}</span></td>}
                          {recordColumns.includes("primaryDevice") && <td><b>{primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device"}</b><span>{primary?.openfda?.medical_specialty_description || "Specialty unavailable"}</span></td>}
                          {recordColumns.includes("productCodes") && <td>
                            <div className="pill-row">
                              {codes.slice(0, 3).map((code) => <span key={code} className="code-pill" title={codeLabel(code)}>{code}</span>)}
                              {codes.length > 3 && <span className="pill-more">+{codes.length - 3}</span>}
                              {!codes.length && <span className="code-pill">—</span>}
                            </div>
                          </td>}
                          {recordColumns.includes("listedProducts") && <td className="count-cell"><b>{shown.length.toLocaleString()}</b><span>{productFilterActive(appliedFilters) ? `${matched.length} of ${listingCount} match` : "Product entries"}</span></td>}
                          {recordColumns.includes("tradeNames") && <td><div className="device-name-list compact">{tradeNames.length ? tradeNames.slice(0, 5).map((name) => <span key={name}>{name}</span>) : <em>None listed</em>}{tradeNames.length > 5 && <em>+{tradeNames.length - 5} more</em>}</div></td>}
                          {recordColumns.includes("location") && <td><b>{locationSummary(item)}</b></td>}
                          {recordColumns.includes("deviceClass") && <td><span className={`class-badge class-${primary?.openfda?.device_class || "u"}`}>{primary?.openfda?.device_class ? `Class ${primary.openfda.device_class}` : "—"}</span></td>}
                          {recordColumns.includes("premarket") && <td><PremarketLinks item={item} stop /></td>}
                          {recordColumns.includes("expiry") && <td><b>{item.registration?.reg_expiry_date_year || "—"}</b></td>}
                          {recordColumns.includes("registrationNumber") && <td><b className="mono-value">{item.registration?.registration_number || "—"}</b></td>}
                          {recordColumns.includes("feiNumber") && <td><b className="mono-value">{item.registration?.fei_number || "—"}</b></td>}
                          <td><ArrowRight size={17} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table> : <table className="matrix-table">
                  <thead><tr>
                    {visibleMatrixColumns.map((column) => {
                      const option = MATRIX_COLUMN_OPTIONS.find((entry) => entry.key === column)!;
                      return <th key={column} className={option.numeric ? "numeric-head" : undefined}>{option.label}</th>;
                    })}
                  </tr></thead>
                  <tbody>
                    {matrixRows.map((row, index) => {
                      const sameCompanyAsPrevious = index > 0 && matrixRows[index - 1].companyKey === row.companyKey;
                      const grouped = matrixSort === "company";
                      return (
                        <tr key={row.key} className={grouped && index > 0 && !sameCompanyAsPrevious ? "group-start" : undefined}>
                          {visibleMatrixColumns.map((column) => matrixCell(row, column, grouped && sameCompanyAsPrevious))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>}
              </div>
              {viewMode === "records" && <div className="pagination">
                <span>{rangeLabel}</span>
                <div><button className="secondary" onClick={() => runSearch(Math.max(0, skip - limit), viewMode, appliedFilters)} disabled={skip === 0 || loading}><ArrowLeft size={15} /> Previous</button><button className="secondary" onClick={() => runSearch(skip + limit, viewMode, appliedFilters)} disabled={skip + records.length >= total || loading}>Next <ArrowRight size={15} /></button></div>
              </div>}
            </>
          )}
          {(loading || exportProgress) && <div className="loading-layer"><LoaderCircle className="spin" size={28} /><span>{exportProgress || loadingNote || "Searching openFDA…"}</span></div>}
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
            <section className="detail-section raw-section"><details><summary>View raw JSON <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected, null, 2)}</pre></details></section>
          </aside>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        title="Pack this workbook."
        countLabel="Choose columns and which rows to include."
        note={viewMode === "matrix" ? "Uses the company + devices view." : "Uses the records view."}
        toggles={(viewMode === "matrix" ? MATRIX_COLUMN_OPTIONS : RECORD_COLUMN_OPTIONS).map((option) => ({ id: option.key, label: option.label, hint: option.hint }))}
        selected={exportColumnIds}
        confirming={!!exportProgress}
        filename={exportFilename}
        scope={exportScope}
        clickableLinks={false}
        pageCount={records.length}
        allCount={exportCount}
        filters={[
          appliedFilters.keyword,
          ...appliedFilters.productCodes,
          allTogether ? "Companies holding all codes" : "",
          appliedFilters.country,
          appliedFilters.deviceClass && `Class ${appliedFilters.deviceClass}`,
          viewMode === "records" && recordSort !== "relevance" ? RECORD_SORT_OPTIONS.find((option) => option.value === recordSort)?.label || "" : "",
        ].filter(Boolean) as string[]}
        onFilename={(value) => { setExportFilename(value); setExportFilenameCustom(true); }}
        onScope={setExportScope}
        onChange={setExportColumnIds}
        onUseVisible={() => setExportColumnIds(viewMode === "matrix" ? matrixColumns : recordColumns)}
        onCancel={() => !exportProgress && setExportOpen(false)}
        onConfirm={() => void exportCsv()}
      />
    </main>
  );
}

/** Company first when rows are grouped by company; otherwise the canonical column order. */
function orderMatrixColumns(columns: readonly MatrixColumn[], sort: MatrixSort): MatrixColumn[] {
  const order: MatrixColumn[] = sort === "company" ? ["company", "coverage", ...MATRIX_KEYS.filter((key) => key !== "company" && key !== "coverage")] : MATRIX_KEYS;
  return order.filter((key) => columns.includes(key));
}
