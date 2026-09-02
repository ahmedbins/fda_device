"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Columns3,
  Ear,
  Layers,
  Link2,
  LoaderCircle,
  MapPin,
  PackageSearch,
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
  PRESET,
  PRESET_CODES,
  type CodeMatchMode,
  type ExplorerFilters as Filters,
  type ExplorerView as ViewMode,
  type MatrixRow,
  type MatrixSort,
  type RecordItem,
  applyCodeMatch,
  buildMatrix,
  buildSearch,
  companyName,
  fetchOpenFda,
  filtersFromParams,
  filtersToParams,
  firmName,
  listedDeviceNames,
  locationSummary,
  matchingProducts,
  parseCodes,
  premarketSummary,
  productFilterActive,
  sortMatrixRows,
} from "../fda-shared";
import { downloadExcel, type ExcelValue } from "../excel-export";
import { ExportDialog, sanitizeExportFilename } from "../export-dialog";
import { NextShell } from "./shell";
import "./next.css";

type CountryOption = { code: string; count: number; name: string };
type RecordColumn = "establishment" | "ownerOperator" | "primaryDevice" | "productCodes" | "listedProducts" | "tradeNames" | "location" | "deviceClass" | "premarket" | "expiry" | "registrationNumber" | "feiNumber";
type MatrixColumn = "productCode" | "deviceType" | "company" | "listedDeviceCount" | "registeredDevices" | "registrations" | "productListings" | "establishments" | "deviceClass" | "specialty" | "countries" | "latestListing";

const RECORD_COLUMN_OPTIONS: { key: RecordColumn; label: string; hint: string }[] = [
  { key: "establishment", label: "Establishment", hint: "Registered facility and its role" },
  { key: "ownerOperator", label: "Owner / operator", hint: "Parent company or legal operator" },
  { key: "primaryDevice", label: "Device type", hint: "First matching FDA device type" },
  { key: "productCodes", label: "Codes", hint: "Matching FDA product codes" },
  { key: "listedProducts", label: "Listed", hint: "Matching product entries on the listing" },
  { key: "tradeNames", label: "Trade names", hint: "Proprietary device names" },
  { key: "location", label: "Location", hint: "City, state and country" },
  { key: "deviceClass", label: "Class", hint: "FDA regulatory class" },
  { key: "premarket", label: "510(k) / PMA", hint: "Premarket submission behind the listing" },
  { key: "expiry", label: "Expiry", hint: "Registration expiry year" },
  { key: "registrationNumber", label: "Registration #", hint: "FDA registration number" },
  { key: "feiNumber", label: "FEI", hint: "FDA establishment identifier" },
];

const MATRIX_COLUMN_OPTIONS: { key: MatrixColumn; label: string; hint: string }[] = [
  { key: "productCode", label: "Code", hint: "FDA product code" },
  { key: "deviceType", label: "Device type", hint: "FDA device classification name" },
  { key: "company", label: "Company", hint: "Owner / operator" },
  { key: "listedDeviceCount", label: "Devices", hint: "Unique proprietary names for this company and code" },
  { key: "registeredDevices", label: "Registered devices", hint: "Unique proprietary device names" },
  { key: "registrations", label: "Registrations", hint: "Distinct FDA registration records" },
  { key: "productListings", label: "Listings", hint: "Raw matching product entries" },
  { key: "establishments", label: "Establishments", hint: "Distinct registered facilities" },
  { key: "deviceClass", label: "Class", hint: "FDA regulatory classes" },
  { key: "specialty", label: "Specialty", hint: "FDA specialty descriptions" },
  { key: "countries", label: "Countries", hint: "Countries represented by matching facilities" },
  { key: "latestListing", label: "Latest listing", hint: "Newest product created date in the group" },
];

const DEFAULT_RECORD_COLUMNS: RecordColumn[] = ["establishment", "primaryDevice", "productCodes", "listedProducts", "location", "deviceClass", "premarket"];
const DEFAULT_MATRIX_COLUMNS: MatrixColumn[] = ["productCode", "deviceType", "company", "listedDeviceCount", "registeredDevices", "registrations"];
const EXPORT_CAP = 26000; // openFDA pagination ceiling: skip<=25000 + limit<=1000
const DEVICE_CLASSES: [string, string][] = [["", "Any class"], ["1", "Class I"], ["2", "Class II"], ["3", "Class III"], ["U", "Unclassified"]];
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

function syncUrl(filters: Filters, view: ViewMode) {
  if (typeof window === "undefined") return;
  const query = filtersToParams(filters, view).toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function initialStateFromUrl() {
  if (typeof window === "undefined") return { filters: EMPTY_FILTERS, view: "records" as ViewMode, autorun: false };
  return filtersFromParams(new URLSearchParams(window.location.search));
}

function classBadge(value?: string) {
  return <span className={`nx-class c${value || "u"}`}>{value ? `Class ${value}` : "—"}</span>;
}

export default function FdaExplorerNext() {
  const [initial] = useState(initialStateFromUrl);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [codeDraft, setCodeDraft] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [exportProgress, setExportProgress] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "page">("all");
  const [exportFilename, setExportFilename] = useState("");
  const [exportFilenameCustom, setExportFilenameCustom] = useState(false);
  const [exportColumnIds, setExportColumnIds] = useState<string[]>([]);
  const [datasetUpdated, setDatasetUpdated] = useState("");
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [codeCounts, setCodeCounts] = useState<{ code: string; count: number }[] | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [recordColumns, setRecordColumns] = useState<RecordColumn[]>(DEFAULT_RECORD_COLUMNS);
  const [matrixColumns, setMatrixColumns] = useState<MatrixColumn[]>(DEFAULT_MATRIX_COLUMNS);
  const [columnPrefsReady, setColumnPrefsReady] = useState(false);
  const [apiCountries, setApiCountries] = useState<CountryOption[]>([]);
  const [matrixSort, setMatrixSort] = useState<MatrixSort>("code");
  const keywordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const morePicker = useRef<HTMLDetailsElement>(null);
  const searchSeq = useRef(0);

  const hasSearched = fetchedAt !== null;
  const presetActive = filters.productCodes.length === PRESET_CODES.length && PRESET_CODES.every((code) => filters.productCodes.includes(code));
  const allTogether = appliedFilters.codeMatch === "all" && appliedFilters.productCodes.length > 1;
  const moreCount = [filters.state.trim(), filters.establishment].filter(Boolean).length;
  const matchHint = filters.codeMatch === "all"
    ? (filters.productCodes.length > 1
      ? "All codes: only listings that carry every selected code on the same FDA filing."
      : "All codes needs two or more codes — add another to require them on the same listing.")
    : filters.productCodes.length > 1
      ? "Any code: listings that carry at least one selected code."
      : "Type product codes separated by commas or spaces. Press / to jump to search.";

  /** Client-side guard: every displayed listing must itself satisfy the ANY/ALL rule, whatever the API returned. */
  const visibleRecords = useMemo(
    () => applyCodeMatch(records, appliedFilters.productCodes, appliedFilters.codeMatch),
    [records, appliedFilters.productCodes, appliedFilters.codeMatch],
  );

  const runSearch = useCallback(
    async (nextSkip = 0, requestedView: ViewMode = viewMode, nextFilters: Filters = filters, nextLimit: number = limit) => {
      const seq = ++searchSeq.current;
      setError("");
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(requestedView === "matrix" ? 1000 : nextLimit),
          skip: String(requestedView === "matrix" ? 0 : nextSkip),
        });
        const search = buildSearch(nextFilters);
        if (search) params.set("search", search);
        const data = await fetchOpenFda<RecordItem>(`${API}?${params.toString()}`);
        if (seq !== searchSeq.current) return;
        setRecords(data.results);
        setTotal(data.meta?.results?.total || 0);
        setSkip(requestedView === "matrix" ? 0 : nextSkip);
        setAppliedFilters(nextFilters);
        setFetchedAt(new Date());
        setSelected((current) => (current && data.results.includes(current) ? current : null));
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        syncUrl(nextFilters, requestedView);
        if (nextFilters.productCodes.length) {
          const countSearch = buildSearch({ ...nextFilters, codeMatch: "any" });
          const countParams = new URLSearchParams({ count: "products.product_code", limit: "1000" });
          if (countSearch) countParams.set("search", countSearch);
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
        if (seq === searchSeq.current) setLoading(false);
      }
    },
    [filters, limit, viewMode],
  );

  useEffect(() => {
    fetchOpenFda(`${API}?limit=1`)
      .then((data) => {
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        if (data.meta?.results?.total) setDatasetTotal(data.meta.results.total);
      })
      .catch(() => {});
    const countryParams = new URLSearchParams({ count: "registration.iso_country_code", limit: "250" });
    fetchOpenFda<{ term?: string; count?: number }>(`${API}?${countryParams.toString()}`)
      .then((data) => {
        setApiCountries(
          data.results
            .filter((entry) => entry.term)
            .map((entry) => {
              const code = String(entry.term).toUpperCase();
              return { code, count: entry.count || 0, name: regionName(code) };
            })
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
    if (initial.autorun) queueMicrotask(() => runSearch(0, initial.view, initial.filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const savedRecords = JSON.parse(localStorage.getItem("nx-fda-record-columns") || "null") as RecordColumn[] | null;
      const savedMatrix = JSON.parse(localStorage.getItem("nx-fda-matrix-columns") || "null") as MatrixColumn[] | null;
      const validRecords = savedRecords?.filter((key) => RECORD_COLUMN_OPTIONS.some((option) => option.key === key));
      const validMatrix = savedMatrix?.filter((key) => MATRIX_COLUMN_OPTIONS.some((option) => option.key === key));
      queueMicrotask(() => {
        if (validRecords?.length) setRecordColumns(validRecords);
        if (validMatrix?.length) setMatrixColumns(validMatrix);
        setColumnPrefsReady(true);
      });
    } catch {
      queueMicrotask(() => setColumnPrefsReady(true));
    }
  }, []);

  useEffect(() => {
    if (!columnPrefsReady) return;
    localStorage.setItem("nx-fda-record-columns", JSON.stringify(recordColumns));
    localStorage.setItem("nx-fda-matrix-columns", JSON.stringify(matrixColumns));
  }, [columnPrefsReady, recordColumns, matrixColumns]);

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      [columnPicker.current, morePicker.current].forEach((picker) => {
        if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
      });
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        keywordInput.current?.focus();
      } else if (event.key === "Escape") {
        let closed = false;
        [columnPicker.current, morePicker.current].forEach((picker) => {
          if (picker?.open) { picker.open = false; closed = true; }
        });
        if (!closed) setSelected(null);
      }
    };
    document.addEventListener("pointerdown", closePopovers);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closePopovers);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

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
    if (parsed.length) setFilters((prev) => ({ ...prev, productCodes: [...new Set([...prev.productCodes, ...parsed])] }));
    setCodeDraft("");
  };

  const removeCode = (code: string) => {
    const next = { ...filters, productCodes: filters.productCodes.filter((c) => c !== code) };
    setFilters(next);
    if (hasSearched) runSearch(0, viewMode, next);
  };

  const applyFilters = (next: Filters) => {
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
      applyFilters({ ...filters, productCodes: [...PRESET_CODES] });
    }
  };

  const setCodeMatch = (mode: CodeMatchMode) => {
    if (filters.codeMatch === mode && appliedFilters.codeMatch === mode) return;
    const next = { ...filters, codeMatch: mode };
    setFilters(next);
    if (!hasSearched) return;
    if (Math.max(next.productCodes.length, appliedFilters.productCodes.length) > 1) {
      runSearch(0, viewMode, next);
    } else {
      const applied = { ...appliedFilters, codeMatch: mode };
      setAppliedFilters(applied);
      syncUrl(applied, viewMode);
    }
  };

  const changeLimit = (nextLimit: number) => {
    setLimit(nextLimit);
    if (hasSearched) runSearch(0, viewMode, appliedFilters, nextLimit);
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
    setSelected(null);
    setFetchedAt(null);
    syncUrl(EMPTY_FILTERS, viewMode);
    keywordInput.current?.focus();
  };

  const switchView = (nextView: ViewMode) => {
    if (nextView === viewMode) return;
    setViewMode(nextView);
    setSelected(null);
    if (hasSearched) runSearch(0, nextView, appliedFilters);
    else syncUrl(appliedFilters, nextView);
  };

  const fetchAllMatching = async () => {
    const cap = Math.min(total, EXPORT_CAP);
    const all: RecordItem[] = [];
    const search = buildSearch(appliedFilters);
    for (let offset = 0; offset < cap; offset += 1000) {
      setExportProgress(`Downloading ${Math.min(offset + 1000, cap).toLocaleString()} of ${cap.toLocaleString()} records…`);
      const params = new URLSearchParams({ limit: String(Math.min(1000, cap - offset)), skip: String(offset) });
      if (search) params.set("search", search);
      const data = await fetchOpenFda<RecordItem>(`${API}?${params.toString()}`);
      all.push(...data.results);
      if (!data.results.length) break;
    }
    return all;
  };

  const exportBaseName = () => {
    const codes = appliedFilters.productCodes;
    const codesPart = codes.length ? codes.join("+") : "all";
    return `${viewMode === "matrix" ? "fda-devices-matrix" : "fda-devices"}-${codesPart}${allTogether ? "-all-codes" : ""}-${new Date().toISOString().slice(0, 10)}`;
  };

  const openExport = () => {
    setExportColumnIds(viewMode === "matrix" ? matrixColumns : recordColumns);
    if (!exportFilenameCustom) setExportFilename(`${exportBaseName()}.xlsx`);
    setExportOpen(true);
  };

  const exportExcel = async () => {
    if (!total || exportProgress) return;
    setError("");
    try {
      const fetched = exportScope === "page" ? visibleRecords : await fetchAllMatching();
      const all = applyCodeMatch(fetched, appliedFilters.productCodes, appliedFilters.codeMatch);
      if (viewMode === "matrix") {
        const labels = Object.fromEntries(MATRIX_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<MatrixColumn, string>;
        const value = (row: MatrixRow, column: MatrixColumn): ExcelValue => ({
          productCode: row.productCode, deviceType: row.deviceType, company: row.company,
          listedDeviceCount: row.devices.length, registeredDevices: row.devices.join("; "),
          registrations: row.registrations, productListings: row.productListings, establishments: row.establishments,
          deviceClass: row.deviceClasses.join("; "), specialty: row.specialties.join("; "),
          countries: row.countries.join("; "), latestListing: row.latestListing,
        })[column];
        const exportColumns = exportColumnIds.filter((id) => MATRIX_COLUMN_OPTIONS.some((option) => option.key === id)) as MatrixColumn[];
        const chosen = exportColumns.length ? exportColumns : matrixColumns;
        downloadExcel({
          filename: sanitizeExportFilename(exportFilename, exportBaseName()),
          sheetName: "Company + devices",
          columns: chosen.map((column) => ({ header: labels[column], width: 22 })),
          rows: sortMatrixRows(buildMatrix(all, appliedFilters), matrixSort).map((row) => chosen.map((column) => value(row, column))),
        });
      } else {
        const labels = Object.fromEntries(RECORD_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<RecordColumn, string>;
        const exportColumns = exportColumnIds.filter((id) => RECORD_COLUMN_OPTIONS.some((option) => option.key === id)) as RecordColumn[];
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

  const matrixRows = useMemo(
    () => sortMatrixRows(buildMatrix(visibleRecords, appliedFilters), matrixSort),
    [visibleRecords, appliedFilters, matrixSort],
  );

  const drawerProducts = useMemo(() => {
    if (!selected) return [];
    const matched = new Set(matchingProducts(selected, appliedFilters));
    return [...(selected.products || [])]
      .map((product) => ({ product, matches: matched.has(product) }))
      .sort((a, b) => Number(b.matches) - Number(a.matches));
  }, [selected, appliedFilters]);

  const exportCount = Math.min(total, EXPORT_CAP);
  const timeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const showNoResults = hasSearched && !loading && !error && !visibleRecords.length;
  const showEmpty = !visibleRecords.length && !loading && !showNoResults;
  const appliedCodesLabel = appliedFilters.productCodes.join(" + ");
  const rangeLabel = total
    ? `${(skip + 1).toLocaleString()}–${Math.min(skip + visibleRecords.length, total).toLocaleString()} of ${total.toLocaleString()}`
    : "0 records";
  const heading = !hasSearched
    ? "FDA registrations & listings"
    : viewMode === "matrix"
      ? `${matrixRows.length.toLocaleString()} company · device groups`
      : `${total.toLocaleString()} listing${total === 1 ? "" : "s"}`;
  const subheading = !hasSearched
    ? "openFDA registration & listing records"
    : viewMode === "matrix"
      ? `from ${visibleRecords.length.toLocaleString()} matching listings${total > 1000 ? ` (first 1,000 of ${total.toLocaleString()})` : ""}`
      : `showing ${rangeLabel}`;

  const codeCountStrip = codeCounts && hasSearched && !error && (
    <div className="nx-counts" aria-label="Matches per product code">
      <span className="nx-counts-label">{allTogether ? "Each code alone" : "Per code"}</span>
      {codeCounts.map(({ code, count }) => (
        <span key={code} className={`nx-count${count ? "" : " zero"}`} title={CODE_NAMES.get(code) || `Product code ${code}`}>
          <b>{code}</b> {count.toLocaleString()}
        </span>
      ))}
      {allTogether && (
        <span className={`nx-count together${total ? "" : " zero"}`} title={`Listings that carry ${appliedCodesLabel} on the same record`}>
          <b>All {appliedFilters.productCodes.length} together</b> {total.toLocaleString()}
        </span>
      )}
    </div>
  );

  const columnMenu = (
    <details ref={columnPicker} className="nx-pop">
      <summary className="nx-btn"><Columns3 size={14} /> Columns · {viewMode === "records" ? recordColumns.length : matrixColumns.length}</summary>
      <div className="nx-pop-menu">
        <div className="nx-pop-head"><b>Columns</b><button type="button" onClick={() => viewMode === "records" ? setRecordColumns(DEFAULT_RECORD_COLUMNS) : setMatrixColumns(DEFAULT_MATRIX_COLUMNS)}>Reset</button></div>
        <div className="nx-pop-scroll">
          {(viewMode === "records" ? RECORD_COLUMN_OPTIONS : MATRIX_COLUMN_OPTIONS).map((option) => {
            const checked = viewMode === "records" ? recordColumns.includes(option.key as RecordColumn) : matrixColumns.includes(option.key as MatrixColumn);
            const onlyVisible = checked && (viewMode === "records" ? recordColumns.length === 1 : matrixColumns.length === 1);
            return (
              <label key={option.key} className="nx-check" title={onlyVisible ? "Keep at least one column visible" : undefined}>
                <input type="checkbox" checked={checked} disabled={onlyVisible} onChange={() => viewMode === "records" ? toggleRecordColumn(option.key as RecordColumn) : toggleMatrixColumn(option.key as MatrixColumn)} />
                <span>{option.label}<small>{option.hint}</small></span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );

  return (
    <NextShell active="fda-explorer">
      <header className="nx-topbar">
        <div className="nx-search-row">
          <div className="nx-search">
            <Search size={15} />
            <input
              ref={keywordInput}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && searchNow()}
              placeholder="Search company, device type or trade name…"
              aria-label="Keywords"
            />
            {filters.keyword && <button type="button" className="nx-clear" onClick={() => setFilters({ ...filters, keyword: "" })} aria-label="Clear keywords"><X size={13} /></button>}
            <kbd>/</kbd>
          </div>
          <button type="button" className="nx-btn primary" onClick={searchNow} disabled={loading}>
            {loading ? <LoaderCircle className="nx-spin" size={14} /> : <Search size={14} />} Run search
          </button>
          <button type="button" className="nx-btn ghost" onClick={reset}>Clear</button>
        </div>
        <div className="nx-query-row">
          <span className="nx-query-label">Codes</span>
          <div className="nx-codes" onClick={() => codeInput.current?.focus()}>
            {filters.productCodes.map((code) => (
              <span key={code} className="nx-code-chip" title={CODE_NAMES.get(code) || `Product code ${code}`}>
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
              list="nx-product-code-options"
              placeholder={filters.productCodes.length ? "Add code…" : "Product codes, e.g. QUH, OSM, SCR"}
              aria-label="Product codes"
            />
            <datalist id="nx-product-code-options">{PRESET.map((item) => <option key={item.code} value={item.code} label={item.name} />)}</datalist>
          </div>
          <div className="nx-seg" role="group" aria-label="How several product codes combine">
            {CODE_MATCH_MODES.map((mode) => (
              <button key={mode.value} type="button" className={filters.codeMatch === mode.value ? "active" : ""} aria-pressed={filters.codeMatch === mode.value} title={mode.hint} onClick={() => setCodeMatch(mode.value)}>
                {mode.value === "any" ? "Any code" : "All codes"}
              </button>
            ))}
          </div>
          <button type="button" className={`nx-preset ${presetActive ? "on" : ""}`} onClick={togglePreset} aria-pressed={presetActive} title={PRESET.map((p) => `${p.code} — ${p.name}`).join("\n")}>
            <Ear size={13} /> Hearing aids · 6 {presetActive && <Check size={12} />}
          </button>
          <span className="nx-divider" />
          <label className={`nx-select ${filters.country ? "on" : ""}`}>
            <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} aria-label="Country">
              <option value="">Any country</option>
              {filters.country && !apiCountries.some((country) => country.code === filters.country) && <option value={filters.country}>{regionName(filters.country)}</option>}
              {apiCountries.slice(0, 40).map((country) => <option key={country.code} value={country.code}>{country.name} · {country.count.toLocaleString()}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <label className={`nx-select ${filters.deviceClass ? "on" : ""}`}>
            <select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })} aria-label="Device class">
              {DEVICE_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <details ref={morePicker} className="nx-pop left">
            <summary className={`nx-select ${moreCount ? "on" : ""}`}><SlidersHorizontal size={13} /> More{moreCount ? ` · ${moreCount}` : ""} <ChevronDown size={13} /></summary>
            <div className="nx-pop-menu">
              <label className="nx-field"><span>State / region code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value.toUpperCase().slice(0, 3) })} placeholder="CA" maxLength={3} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
              <label className="nx-field"><span>Establishment role</span><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All roles</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            </div>
          </details>
          <span className="nx-hint">{matchHint}</span>
        </div>
      </header>

      <div className="nx-results-bar">
        <h1>{heading}<small>{subheading}</small></h1>
        {codeCountStrip}
        <div className="nx-toolbar-right">
          <div className="nx-seg" role="group" aria-label="Results view">
            <button type="button" className={viewMode === "records" ? "active" : ""} onClick={() => switchView("records")}>Records</button>
            <button type="button" className={viewMode === "matrix" ? "active" : ""} onClick={() => switchView("matrix")}>Company + devices</button>
          </div>
          {viewMode === "matrix" && (
            <label className="nx-select">
              <select value={matrixSort} onChange={(e) => setMatrixSort(e.target.value as MatrixSort)} aria-label="Sort company and device rows">
                <option value="code">Sort: product code</option><option value="devices">Sort: most devices</option><option value="registrations">Sort: most registrations</option><option value="company">Sort: company A–Z</option>
              </select>
              <ChevronDown size={13} />
            </label>
          )}
          {columnMenu}
          {viewMode === "records" && (
            <label className="nx-select">
              <select value={limit} onChange={(e) => changeLimit(Number(e.target.value))} aria-label="Rows per page"><option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option></select>
              <ChevronDown size={13} />
            </label>
          )}
          <button type="button" className="nx-btn" onClick={openExport} disabled={!total || loading || !!exportProgress} title={total > EXPORT_CAP ? `Exports the first ${EXPORT_CAP.toLocaleString()} matching records (openFDA limit)` : "Download matching records as Excel"}>
            <ArrowDownToLine size={14} /> Excel{total ? ` · ${exportCount.toLocaleString()}` : ""}
          </button>
          <button type="button" className="nx-btn icon" onClick={copyLink} disabled={!fetchedAt} aria-label="Copy shareable link" title="Copy a shareable link to this exact view">{linkCopied ? <Check size={14} /> : <Link2 size={14} />}</button>
          <button type="button" className="nx-btn icon" onClick={() => runSearch(skip, viewMode, appliedFilters)} disabled={loading} aria-label="Refresh results" title="Re-run this search"><RefreshCw className={loading ? "nx-spin" : ""} size={14} /></button>
        </div>
      </div>

      <div className={`nx-workbench ${selected ? "with-detail" : ""}`}>
        <div className="nx-table-area">
          {error && <div className="nx-error" role="alert"><CircleAlert size={16} /><div><b>Search interrupted</b><span>{error}</span></div><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}

          {showEmpty ? (
            <div className="nx-empty">
              <PackageSearch size={30} />
              <h2>Start from a question.</h2>
              <p>{datasetTotal ? `${datasetTotal.toLocaleString()} listings` : "openFDA"}{datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}. Pick a starting point or type codes and keywords above.</p>
              <div className="nx-quick">
                <button type="button" onClick={() => applyFilters({ ...EMPTY_FILTERS, productCodes: [...PRESET_CODES] })}><b>Hearing-aid competitors</b><span>The six tracked codes: <code>{PRESET_CODES.join(" · ")}</code>.</span></button>
                <button type="button" onClick={() => applyFilters({ ...EMPTY_FILTERS, productCodes: ["QDD", "QUH"], codeMatch: "all" })}><b>Same-listing self-fitting aids</b><span>Listings carrying <code>QDD</code> and <code>QUH</code> on one filing.</span></button>
                <button type="button" onClick={() => applyFilters({ ...EMPTY_FILTERS, keyword: "Sonova" })}><b>Sonova listings</b><span>Every record that names Sonova.</span></button>
                <button type="button" onClick={() => runSearch(0)}><b>Browse everything</b><span>Page through the whole registry, newest openFDA order.</span></button>
              </div>
            </div>
          ) : showNoResults ? (
            <div className="nx-empty" role="status">
              <PackageSearch size={30} />
              <h2>No listings match.</h2>
              {allTogether ? (
                <p>No single FDA listing carries <b>{appliedCodesLabel}</b> together. Each openFDA record is one product filing, so a company with separate listings for these codes does not count. Switch to <b>Any code</b> to see listings with at least one of them.</p>
              ) : (
                <p>Nothing in the openFDA registration and listing dataset matches this combination. Try fewer filters, another country, or double-check the product codes.</p>
              )}
              <div className="nx-empty-actions">
                {allTogether && <button type="button" className="nx-btn primary" onClick={() => setCodeMatch("any")}>Match any code</button>}
                <button type="button" className="nx-btn" onClick={reset}>Clear all filters</button>
              </div>
            </div>
          ) : (
            <>
              {viewMode === "matrix" && (
                <div className="nx-matrix-note">
                  <span><Building2 size={13} /> <b>{matrixRows.length.toLocaleString()}</b> company · device groups from <b>{visibleRecords.length.toLocaleString()}</b> listings</span>
                  {allTogether && <span><Layers size={13} /> only listings carrying {appliedCodesLabel} together are grouped</span>}
                  <span>Devices counts unique proprietary names · Excel fetches every available match</span>
                </div>
              )}
              <div className="nx-table-wrap" aria-live="polite">
                {viewMode === "records" ? (
                  <table className="nx-table">
                    <thead><tr>
                      {recordColumns.includes("establishment") && <th>Establishment</th>}
                      {recordColumns.includes("ownerOperator") && <th>Owner / operator</th>}
                      {recordColumns.includes("primaryDevice") && <th>Device type</th>}
                      {recordColumns.includes("productCodes") && <th>Codes</th>}
                      {recordColumns.includes("listedProducts") && <th className="nx-num">Listed</th>}
                      {recordColumns.includes("tradeNames") && <th>Trade names</th>}
                      {recordColumns.includes("location") && <th>Location</th>}
                      {recordColumns.includes("deviceClass") && <th>Class</th>}
                      {recordColumns.includes("premarket") && <th>510(k) / PMA</th>}
                      {recordColumns.includes("expiry") && <th>Expiry</th>}
                      {recordColumns.includes("registrationNumber") && <th>Registration #</th>}
                      {recordColumns.includes("feiNumber") && <th>FEI</th>}
                    </tr></thead>
                    <tbody>
                      {visibleRecords.map((item, index) => {
                        const matched = matchingProducts(item, appliedFilters);
                        const shown = productFilterActive(appliedFilters) ? matched : item.products || [];
                        const primary = shown[0];
                        const codes = [...new Set(shown.map((p) => p.product_code).filter(Boolean))] as string[];
                        const tradeNames = listedDeviceNames(item);
                        const isSelected = selected === item;
                        return (
                          <tr key={`${item.registration?.registration_number || "record"}-${index}`} className={isSelected ? "selected" : ""} onClick={() => setSelected(isSelected ? null : item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(item)} aria-selected={isSelected}>
                            {recordColumns.includes("establishment") && <td><b>{firmName(item)}</b><span className="sub">{item.establishment_type?.[0] || "Role not listed"}</span></td>}
                            {recordColumns.includes("ownerOperator") && <td><b>{companyName(item)}</b><span className="sub">Operator {item.registration?.owner_operator?.owner_operator_number || "—"}</span></td>}
                            {recordColumns.includes("primaryDevice") && <td><b>{primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device"}</b><span className="sub">{primary?.openfda?.medical_specialty_description || "Specialty unavailable"}</span></td>}
                            {recordColumns.includes("productCodes") && <td>{codes.length ? codes.slice(0, 4).map((code) => <span key={code} className="nx-code">{code}</span>) : <span className="nx-code dim">—</span>}{codes.length > 4 && <span className="nx-code dim">+{codes.length - 4}</span>}</td>}
                            {recordColumns.includes("listedProducts") && <td className="nx-num"><b>{shown.length.toLocaleString()}</b><span className="sub">{productFilterActive(appliedFilters) ? `of ${item.products?.length || 0}` : "entries"}</span></td>}
                            {recordColumns.includes("tradeNames") && <td><div className="nx-names">{tradeNames.length ? tradeNames.slice(0, 3).map((name) => <span key={name} title={name}>{name}</span>) : <em>None listed</em>}{tradeNames.length > 3 && <em>+{tradeNames.length - 3} more</em>}</div></td>}
                            {recordColumns.includes("location") && <td>{locationSummary(item)}</td>}
                            {recordColumns.includes("deviceClass") && <td>{classBadge(primary?.openfda?.device_class)}</td>}
                            {recordColumns.includes("premarket") && <td className="nx-mono">{premarketSummary(item) || "—"}</td>}
                            {recordColumns.includes("expiry") && <td className="nx-mono">{item.registration?.reg_expiry_date_year || "—"}</td>}
                            {recordColumns.includes("registrationNumber") && <td className="nx-mono">{item.registration?.registration_number || "—"}</td>}
                            {recordColumns.includes("feiNumber") && <td className="nx-mono">{item.registration?.fei_number || "—"}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="nx-table">
                    <thead><tr>
                      {matrixColumns.includes("productCode") && <th>Code</th>}
                      {matrixColumns.includes("deviceType") && <th>Device type</th>}
                      {matrixColumns.includes("company") && <th>Company</th>}
                      {matrixColumns.includes("listedDeviceCount") && <th className="nx-num">Devices</th>}
                      {matrixColumns.includes("registeredDevices") && <th>Registered devices</th>}
                      {matrixColumns.includes("registrations") && <th className="nx-num">Registrations</th>}
                      {matrixColumns.includes("productListings") && <th className="nx-num">Listings</th>}
                      {matrixColumns.includes("establishments") && <th className="nx-num">Establishments</th>}
                      {matrixColumns.includes("deviceClass") && <th>Class</th>}
                      {matrixColumns.includes("specialty") && <th>Specialty</th>}
                      {matrixColumns.includes("countries") && <th>Countries</th>}
                      {matrixColumns.includes("latestListing") && <th>Latest listing</th>}
                    </tr></thead>
                    <tbody>
                      {matrixRows.map((row) => (
                        <tr key={row.key} tabIndex={0}>
                          {matrixColumns.includes("productCode") && <td><span className="nx-code">{row.productCode}</span></td>}
                          {matrixColumns.includes("deviceType") && <td><b>{row.deviceType}</b></td>}
                          {matrixColumns.includes("company") && <td><b>{row.company}</b></td>}
                          {matrixColumns.includes("listedDeviceCount") && <td className="nx-num"><b>{row.devices.length.toLocaleString()}</b></td>}
                          {matrixColumns.includes("registeredDevices") && <td><div className="nx-names">{row.devices.length ? row.devices.map((device) => <span key={device} title={device}>{device}</span>) : <em>No proprietary names listed</em>}</div></td>}
                          {matrixColumns.includes("registrations") && <td className="nx-num"><b>{row.registrations.toLocaleString()}</b></td>}
                          {matrixColumns.includes("productListings") && <td className="nx-num"><b>{row.productListings.toLocaleString()}</b></td>}
                          {matrixColumns.includes("establishments") && <td className="nx-num"><b>{row.establishments.toLocaleString()}</b></td>}
                          {matrixColumns.includes("deviceClass") && <td>{row.deviceClasses.length ? row.deviceClasses.map((value) => <span key={value}>{classBadge(value)} </span>) : "—"}</td>}
                          {matrixColumns.includes("specialty") && <td>{row.specialties.join(" · ") || "—"}</td>}
                          {matrixColumns.includes("countries") && <td>{row.countries.length ? row.countries.map((value) => <span key={value} className="nx-code dim">{value}</span>) : "—"}</td>}
                          {matrixColumns.includes("latestListing") && <td className="nx-mono">{row.latestListing || "—"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
          {(loading || exportProgress) && <div className="nx-loading"><LoaderCircle className="nx-spin" size={18} /><span>{exportProgress || "Searching openFDA…"}</span></div>}
        </div>

        {selected && (
          <aside className="nx-detail" aria-label="Listing details">
            <div className="nx-detail-head">
              <div>
                <span className="nx-eyebrow">Listing · REG {selected.registration?.registration_number || "—"}</span>
                <h2>{firmName(selected)}</h2>
                <p><MapPin size={12} /> {locationSummary(selected)}{selected.registration?.owner_operator?.firm_name && selected.registration.owner_operator.firm_name !== firmName(selected) ? ` · ${selected.registration.owner_operator.firm_name}` : ""}</p>
              </div>
              <button type="button" className="nx-btn icon" onClick={() => setSelected(null)} aria-label="Close details"><X size={15} /></button>
            </div>
            <div className="nx-kv">
              <div><span>Registration #</span><b>{selected.registration?.registration_number || "—"}</b></div>
              <div><span>FEI number</span><b>{selected.registration?.fei_number || "—"}</b></div>
              <div><span>510(k) / PMA</span><b>{premarketSummary(selected) || "—"}</b></div>
              <div><span>Expiry year</span><b>{selected.registration?.reg_expiry_date_year || "—"}</b></div>
              <div><span>Owner / operator</span><b className="sans">{companyName(selected)}</b></div>
              <div><span>Products on listing</span><b>{selected.products?.length || 0}</b></div>
            </div>
            <section className="nx-detail-section">
              <h3><Building2 size={13} /> Establishment roles</h3>
              <div className="nx-chips">{selected.establishment_type?.length ? selected.establishment_type.map((type) => <span key={type}>{type}</span>) : <span>Not listed</span>}</div>
            </section>
            <section className="nx-detail-section">
              <h3><PackageSearch size={13} /> Device listings{productFilterActive(appliedFilters) && <i>{drawerProducts.filter((entry) => entry.matches).length} of {drawerProducts.length} match filter</i>}</h3>
              {drawerProducts.length ? drawerProducts.map(({ product, matches }, index) => (
                <article key={`${product.product_code}-${index}`} className={`nx-product ${productFilterActive(appliedFilters) && !matches ? "dim" : ""}`}>
                  <div><span className="nx-code">{product.product_code || "—"}</span>{classBadge(product.openfda?.device_class)}{productFilterActive(appliedFilters) && matches && <span className="nx-tag">Match</span>}</div>
                  <h4>{product.openfda?.device_name || "Unnamed device"}</h4>
                  <p>{product.openfda?.medical_specialty_description || "Specialty unavailable"} · Regulation {product.openfda?.regulation_number || "—"}{product.created_date ? ` · Listed ${product.created_date}` : ""}</p>
                </article>
              )) : <p>No device listings attached.</p>}
            </section>
            {listedDeviceNames(selected).length > 0 && (
              <section className="nx-detail-section">
                <h3>Trade names</h3>
                <div className="nx-chips">{listedDeviceNames(selected).map((name) => <span key={name}>{name}</span>)}</div>
              </section>
            )}
            <section className="nx-detail-section">
              <details><summary>Raw openFDA record</summary><pre>{JSON.stringify(selected, null, 2)}</pre></details>
            </section>
          </aside>
        )}
      </div>

      <footer className="nx-status">
        <span className="nx-dot" aria-hidden="true" />
        <span className="nx-live">openFDA live</span>
        {datasetUpdated && <span title="The date openFDA last rebuilt this dataset — newer records aren't published yet.">FDA data as of {datasetUpdated}</span>}
        {fetchedAt && <span title="When this page last called the live API.">Pulled {fetchedAt.toLocaleString([], timeFormat)}</span>}
        {datasetTotal > 0 && <span>{datasetTotal.toLocaleString()} listings in dataset</span>}
        <div className="right">
          {viewMode === "records" && hasSearched && total > 0 && (
            <>
              <span><b>{rangeLabel}</b></span>
              <div className="nx-pager">
                <button type="button" className="nx-btn icon" onClick={() => runSearch(Math.max(0, skip - limit), viewMode, appliedFilters)} disabled={skip === 0 || loading} aria-label="Previous page"><ArrowLeft size={14} /></button>
                <button type="button" className="nx-btn icon" onClick={() => runSearch(skip + limit, viewMode, appliedFilters)} disabled={skip + visibleRecords.length >= total || loading} aria-label="Next page"><ArrowRight size={14} /></button>
              </div>
            </>
          )}
        </div>
      </footer>

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
        pageCount={visibleRecords.length}
        allCount={exportCount}
        filters={[
          appliedFilters.keyword,
          ...appliedFilters.productCodes,
          allTogether ? "All codes on the same listing" : "",
          appliedFilters.country,
          appliedFilters.deviceClass && `Class ${appliedFilters.deviceClass}`,
        ].filter(Boolean) as string[]}
        onFilename={(value) => { setExportFilename(value); setExportFilenameCustom(true); }}
        onScope={setExportScope}
        onChange={setExportColumnIds}
        onUseVisible={() => setExportColumnIds(viewMode === "matrix" ? matrixColumns : recordColumns)}
        onCancel={() => !exportProgress && setExportOpen(false)}
        onConfirm={() => void exportExcel()}
      />
    </NextShell>
  );
}
