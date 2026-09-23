"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Award,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Columns3,
  Database,
  ExternalLink,
  Factory,
  Filter,
  Globe,
  Link2,
  ListChecks,
  LoaderCircle,
  MapPin,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { AppliedFilters, DrawerTop, HeaderCell, useEscapeToClose, RecentSearches, recentSearchParams, columnSharesKey, useColumnWidths, useRecentSearches, useScrollShadow, type HeaderSpec } from "./explorer-tools";
import { DEFAULT_IECEE_PRESET, IECEE_PRESETS, getIeceePreset, presetForQuery } from "./iecee-config";
import {
  EMPTY_IECEE_FILTERS,
  IECEE_CATEGORIES,
  IECEE_CATEGORIES_URL,
  IECEE_EXPORT_CAP,
  IECEE_PAGE_SIZES,
  IECEE_PUBLIC_SEARCH_URL,
  IECEE_SORT_OPTIONS,
  IECEE_SOURCE_LABEL,
  IECEE_STATUSES,
  IECEE_TYPES,
  baseStandard,
  countIeceeFilters,
  describeIeceeFilters,
  ieceeAppliedChips,
  ieceeCategoryLabel,
  ieceeCategoryName,
  ieceeRefBase,
  ieceeSourcePresentation,
  ieceeStateFromParams,
  ieceeStateToParams,
  isIeceeFamilyMember,
  normalizeIeceeFilters,
  normalizeStandard,
  parseIeceeQuery,
  removeIeceeChip,
  type IeceeAppliedChip,
  type IeceeCertificate,
  type IeceeCertificateDetail,
  type IeceeFacetOption,
  type IeceeFilters,
  type IeceeSearchResult,
  type IeceeSort,
  type IeceeStatus,
  type IeceeUrlState,
} from "./iecee-core";
import { IECEE_RESULT_WINDOW } from "./iecee-relay";
import { clearIeceeCache, fetchIeceeCertificate, fetchIeceeCertificatesAll, fetchIeceeTrademarks, searchIecee, type IeceeTrademarkOption } from "./iecee-service";
import { downloadExcel, type ExcelColumn, type ExcelValue } from "./excel-export";
import { ExportDialog, asExportLink, defaultExportFilename, loadExportSettings, sanitizeExportFilename, saveExportSettings } from "./export-dialog";

type ColumnKey = "ref" | "manufacturer" | "trademark" | "product" | "category" | "standards" | "nd" | "ncb" | "issued" | "status" | "type" | "updated" | "open";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "ref", label: "Certificate", hint: "IECEE certificate reference number" },
  { key: "manufacturer", label: "Manufacturer", hint: "Manufacturer named on the certificate" },
  { key: "trademark", label: "Trademark", hint: "Trademark or brand on the certificate" },
  { key: "product", label: "Product", hint: "Product description" },
  { key: "category", label: "Category", hint: "CB Scheme product category" },
  { key: "standards", label: "Standards", hint: "Base IEC standards cited (editions in the drawer)" },
  { key: "nd", label: "National differences", hint: "Countries whose national differences were assessed (loaded per certificate)" },
  { key: "ncb", label: "Certification body", hint: "Issuing National Certification Body" },
  { key: "issued", label: "Issued", hint: "Certificate issue date" },
  { key: "status", label: "Status", hint: "Valid, cancelled or suspended" },
  { key: "type", label: "Type", hint: "CB Test Certificate, EMC, Component and other types" },
  { key: "updated", label: "Updated", hint: "Last update recorded by IECEE" },
  { key: "open", label: "Open record", hint: "Official certificate page on certificates.iecee.org" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["ref", "manufacturer", "trademark", "product", "category", "standards", "nd", "ncb", "issued", "status", "open"];
/** Columns added to the defaults after launch. A saved layout gains each one once; after that the user's choice stands. */
const LATER_DEFAULT_COLUMNS: ColumnKey[] = ["nd"];
const COLUMNS_SEEN_KEY = "iecee-explorer-columns-seen";
/** The search index has no national differences, so the column loads each visible row's full record, a few at a time. */
const ND_CONCURRENCY = 6;
const ND_PREVIEW = 12;
const IECEE_EXPORT_TOGGLES = [
  { id: "ref", label: "Certificate number", required: true },
  { id: "type", label: "Certificate type" },
  { id: "status", label: "Status" },
  { id: "issued", label: "Issue date" },
  { id: "updated", label: "Last updated" },
  { id: "expires", label: "Expiry date" },
  { id: "manufacturer", label: "Manufacturer" },
  { id: "trademark", label: "Trademark" },
  { id: "product", label: "Product" },
  { id: "categories", label: "Product categories" },
  { id: "standards", label: "Base standards" },
  { id: "scopes", label: "Standards with editions" },
  { id: "nationalDifferences", label: "National differences (loads each certificate)" },
  { id: "ncb", label: "Certification body" },
  { id: "ncbCountry", label: "Certification body country" },
  { id: "id", label: "IECEE record id" },
  { id: "link", label: "Certificate link" },
  { id: "source", label: "Source" },
  { id: "retrievedAt", label: "Retrieved at" },
];
const DEFAULT_IECEE_EXPORT = ["ref", "type", "status", "issued", "manufacturer", "trademark", "product", "categories", "standards", "ncb", "link"];
const IECEE_VISIBLE_TO_EXPORT: Partial<Record<ColumnKey, string[]>> = {
  ref: ["ref"],
  manufacturer: ["manufacturer"],
  trademark: ["trademark"],
  product: ["product"],
  category: ["categories"],
  standards: ["standards"],
  nd: ["nationalDifferences"],
  ncb: ["ncb", "ncbCountry"],
  issued: ["issued"],
  status: ["status"],
  type: ["type"],
  updated: ["updated"],
  open: ["link"],
};
const CATEGORY_PREVIEW = 8;
/** Before a search there are no counts to rank by, so the categories this team meets most come first. */
const CATEGORY_PREVIEW_ORDER = ["MED", "ITAV", "HOUS", "EMC", "BATT", "TRON", "OFF", "MEAS"];

type AppliedState = IeceeUrlState;

function initialState(): AppliedState & { autorun: boolean } {
  const preset = getIeceePreset(DEFAULT_IECEE_PRESET);
  const fallback: AppliedState & { autorun: boolean } = { filters: { ...EMPTY_IECEE_FILTERS, query: preset?.query || "" }, sort: "issued-desc", pageSize: 25, page: 0, presetId: preset?.id || "", autorun: !!preset };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const parsed = ieceeStateFromParams(params);
  const requestedPreset = getIeceePreset(params.get("preset"));
  const anyFilter = countIeceeFilters(parsed.filters) > 0;
  if (requestedPreset && !parsed.filters.query) parsed.filters = { ...parsed.filters, query: requestedPreset.query };
  const browseAll = params.get("all") === "1";
  const useDefault = !anyFilter && !params.has("preset") && !requestedPreset && !browseAll;
  if (useDefault) return fallback;
  return { ...parsed, presetId: requestedPreset?.id || presetForQuery(parsed.filters.query)?.id || "", autorun: browseAll || countIeceeFilters(parsed.filters) > 0 };
}

/** `browseAll` marks a deliberate search with no filters, so a reload runs it instead of the default preset. */
function syncUrl(state: AppliedState, browseAll = false) {
  if (typeof window === "undefined") return;
  const params = ieceeStateToParams(state);
  if (browseAll) params.set("all", "1");
  const value = params.toString();
  window.history.replaceState(null, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

function displayDate(value?: string) {
  if (!value) return "—";
  // Full timestamps (last update) show their local day, as the drawer does; bare days stay as written.
  const date = value.length > 10 ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function displayDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** "Canada (CA)"; entries that are not ISO codes, such as "EU Group Differences", stay as written. */
function nationalDifferenceLabel(code: string) {
  const name = countryName(code);
  return name === code ? code : `${name} (${code})`;
}

function facetOptions(base: { key: string; label: string }[], facets: IeceeFacetOption[] | undefined, selected: string[]) {
  const byKey = new Map((facets || []).map((option) => [option.key, option]));
  const known = base.map((item) => ({ key: item.key, label: item.label, count: byKey.get(item.key)?.count ?? (facets ? 0 : undefined), total: byKey.get(item.key)?.total ?? (facets ? 0 : undefined) }));
  const extra = (facets || []).filter((option) => !base.some((item) => item.key === option.key)).map((option) => ({ key: option.key, label: option.label, count: option.count, total: option.total }));
  const all = [...known, ...extra];
  if (facets?.length) all.sort((a, b) => (b.total || 0) - (a.total || 0) || a.label.localeCompare(b.label));
  return all.map((option) => ({ ...option, checked: selected.includes(option.key) }));
}

type DetailState = {
  id: number;
  status: "loading" | "done" | "error";
  detail?: IeceeCertificateDetail;
  error?: string;
  family?: IeceeCertificate[];
};

export default function IeceeExplorerPage() {
  const [initial] = useState(initialState);
  const [applied, setApplied] = useState<AppliedState>({ filters: initial.filters, sort: initial.sort, pageSize: initial.pageSize, page: initial.page, presetId: initial.presetId });
  const [draftQuery, setDraftQuery] = useState(initial.filters.query);
  const [draftTrademark, setDraftTrademark] = useState(initial.filters.trademark);
  const [standardDraft, setStandardDraft] = useState("");
  const [result, setResult] = useState<IeceeSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<IeceeCertificate | null>(null);
  const [drawerWide, setDrawerWide] = useState(false);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [nationalDiffs, setNationalDiffs] = useState<Map<number, string[] | "error">>(() => new Map());
  useEscapeToClose(!!selected, () => setSelected(null));
  // The pane is a normal column above 720px; this only opens the off-canvas drawer on phones.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllNcbs, setShowAllNcbs] = useState(false);
  const [trademarkOptions, setTrademarkOptions] = useState<IeceeTrademarkOption[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState(() => loadExportSettings("iecee-excel-export", {
    groups: DEFAULT_IECEE_EXPORT,
    scope: "all",
    unique: false,
    clickableLinks: true,
    filename: "",
  }));
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const parsed = (JSON.parse(localStorage.getItem("iecee-explorer-columns") || "[]") as ColumnKey[]).filter((key) => COLUMN_OPTIONS.some((option) => option.key === key));
      if (!parsed.length) return DEFAULT_COLUMNS;
      const seen = JSON.parse(localStorage.getItem(COLUMNS_SEEN_KEY) || "[]") as string[];
      for (const key of LATER_DEFAULT_COLUMNS) {
        if (seen.includes(key) || parsed.includes(key)) continue;
        const after = DEFAULT_COLUMNS.slice(DEFAULT_COLUMNS.indexOf(key) + 1).find((next) => parsed.includes(next));
        parsed.splice(after ? parsed.indexOf(after) : parsed.length, 0, key);
      }
      return parsed;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const request = useRef<AbortController | null>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const widthTools = useColumnWidths(columnSharesKey("iecee"), columns);
  const tableScroll = useScrollShadow([columns]);
  const recents = useRecentSearches("iecee-recent-searches");
  const rememberRecent = recents.remember;

  const filters = applied.filters;
  const facets = result?.facets;
  const typeLabels = useMemo(() => new Map([...Object.entries(IECEE_TYPES), ...(facets?.type || []).map((option) => [option.key, option.label] as const)]), [facets]);
  const statusOptions = useMemo(() => facetOptions(IECEE_STATUSES.map((status) => ({ key: status.code, label: status.label })), facets?.status, filters.statuses), [facets, filters.statuses]);
  const typeOptions = useMemo(() => facetOptions(Object.entries(IECEE_TYPES).map(([key, label]) => ({ key, label })), facets?.type, filters.types), [facets, filters.types]);
  const categoryOptions = useMemo(() => facetOptions([...CATEGORY_PREVIEW_ORDER, ...Object.keys(IECEE_CATEGORIES).filter((key) => !CATEGORY_PREVIEW_ORDER.includes(key))].map((key) => ({ key, label: key })), facets?.categories, filters.categories), [facets, filters.categories]);
  const visibleCategories = showAllCategories ? categoryOptions : categoryOptions.filter((option, index) => option.checked || (facets ? (option.total || 0) > 0 && index < CATEGORY_PREVIEW : index < CATEGORY_PREVIEW));
  const standardSuggestions = useMemo(() => (facets?.standards || []).filter((option) => !filters.standards.includes(option.key)).slice(0, 8), [facets, filters.standards]);
  const ncbOptions = useMemo(() => (facets?.ncbs || []).map((option) => ({ ...option, checked: filters.ncbs.includes(option.key) })), [facets, filters.ncbs]);
  const visibleNcbs = showAllNcbs ? ncbOptions : ncbOptions.filter((option, index) => index < 6 || option.checked);
  const appliedChips = useMemo(() => ieceeAppliedChips(filters, typeLabels), [filters, typeLabels]);
  const pendingChanges = useMemo(() => {
    const pending: string[] = [];
    if (parseIeceeQuery(draftQuery) !== filters.query) pending.push("search text");
    if (draftTrademark.trim() !== filters.trademark) pending.push("trademark");
    if (standardDraft.trim()) pending.push("standard not added yet");
    return pending;
  }, [draftQuery, draftTrademark, filters.query, filters.trademark, standardDraft]);
  const total = result?.total ?? 0;
  const reachable = Math.min(total, IECEE_RESULT_WINDOW);
  const pageCount = Math.max(1, Math.ceil(reachable / applied.pageSize));
  const visibleCertificates = result?.certificates || [];
  const activePreset = getIeceePreset(applied.presetId);
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const sourcePresentation = ieceeSourcePresentation(!!retrievedAt);

  const execute = useCallback(async (next: AppliedState, force = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const clean: AppliedState = { ...next, filters: normalizeIeceeFilters(next.filters) };
    setApplied(clean);
    setLoading(true);
    setError("");
    setSearched(true);
    setSelected(null);
    if (force) {
      clearIeceeCache();
      setNationalDiffs(new Map());
    }
    const browseAll = countIeceeFilters(clean.filters) === 0;
    syncUrl(clean, browseAll);
    try {
      let page = await searchIecee({ filters: clean.filters, from: clean.page * clean.pageSize, size: clean.pageSize, sort: clean.sort, signal: controller.signal, fresh: force });
      if (controller.signal.aborted) return;
      // A page past the end (an old link, or fewer matches than before) lands on the last page instead of "no matches".
      const lastPage = Math.max(0, Math.ceil(Math.min(page.total, IECEE_RESULT_WINDOW) / clean.pageSize) - 1);
      if (!page.certificates.length && page.total > 0 && clean.page > lastPage) {
        clean.page = lastPage;
        setApplied({ ...clean });
        syncUrl(clean, browseAll);
        page = await searchIecee({ filters: clean.filters, from: lastPage * clean.pageSize, size: clean.pageSize, sort: clean.sort, signal: controller.signal });
        if (controller.signal.aborted) return;
      }
      setResult(page);
      setRetrievedAt(new Date(page.retrievedAt));
      rememberRecent(recentSearchParams(ieceeStateToParams(clean).toString()), describeIeceeFilters(clean.filters));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "The IECEE certificate search could not be reached.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [rememberRecent]);

  useEffect(() => {
    if (initial.autorun) queueMicrotask(() => execute({ filters: initial.filters, sort: initial.sort, pageSize: initial.pageSize, page: initial.page, presetId: initial.presetId }));
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("iecee-explorer-columns", JSON.stringify(columns));
      localStorage.setItem(COLUMNS_SEEN_KEY, JSON.stringify(LATER_DEFAULT_COLUMNS));
    } catch {
      // Column choices are a convenience only.
    }
  }, [columns]);

  const showNationalDiffs = columns.includes("nd");
  const pageCertificates = result?.certificates;
  useEffect(() => {
    if (!showNationalDiffs || !pageCertificates?.length) return;
    const controller = new AbortController();
    const queue = pageCertificates.map((certificate) => certificate.id);
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        const found = await fetchIeceeCertificate(id, controller.signal).then((detail) => detail.nationalDifferences, () => "error" as const);
        if (controller.signal.aborted) return;
        setNationalDiffs((current) => current.get(id) === found ? current : new Map(current).set(id, found));
      }
    };
    for (let lane = 0; lane < ND_CONCURRENCY; lane += 1) void worker();
    return () => controller.abort();
  }, [showNationalDiffs, pageCertificates]);

  useEffect(() => {
    const query = draftTrademark.trim();
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchIeceeTrademarks(query).then((options) => {
        if (!cancelled) setTrademarkOptions(options);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftTrademark]);

  useEffect(() => {
    if (!selected) return;
    const id = selected.id;
    const controller = new AbortController();
    const base = ieceeRefBase(selected.refNumber);
    const familyRequest = searchIecee({ filters: { ...EMPTY_IECEE_FILTERS, query: `"${base}"` }, size: 50, sort: "issued-desc", signal: controller.signal })
      .then((page) => page.certificates.filter((certificate) => isIeceeFamilyMember(certificate.refNumber, base)))
      .catch(() => [] as IeceeCertificate[]);
    fetchIeceeCertificate(id, controller.signal)
      .then(async (detail) => {
        const family = await familyRequest;
        if (controller.signal.aborted) return;
        setDetailState({ id, status: "done", detail, family });
        setNationalDiffs((current) => new Map(current).set(id, detail.nationalDifferences));
      })
      .catch(async (caught) => {
        const family = await familyRequest;
        if (!controller.signal.aborted) setDetailState({ id, status: "error", error: caught instanceof Error ? caught.message : "The certificate record could not be loaded.", family });
      });
    return () => controller.abort();
  }, [selected]);

  const draftFilters = (): IeceeFilters => ({ ...filters, query: parseIeceeQuery(draftQuery), trademark: draftTrademark.trim() });

  const applyFilters = (patch: Partial<IeceeFilters>) => {
    const nextFilters = normalizeIeceeFilters({ ...draftFilters(), ...patch });
    void execute({ ...applied, filters: nextFilters, page: 0, presetId: presetForQuery(nextFilters.query)?.id || "" });
  };

  const runSearch = (force = false) => {
    const nextFilters = normalizeIeceeFilters(draftFilters());
    if (standardDraft.trim()) {
      const standard = normalizeStandard(standardDraft);
      if (standard && !nextFilters.standards.includes(standard)) nextFilters.standards = [...nextFilters.standards, standard];
      setStandardDraft("");
    }
    void execute({ ...applied, filters: nextFilters, page: 0, presetId: presetForQuery(nextFilters.query)?.id || "" }, force);
  };

  const toggleValue = (key: keyof Pick<IeceeFilters, "statuses" | "types" | "categories" | "standards" | "ncbs">, value: string) => {
    const current = filters[key] as string[];
    applyFilters({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] } as Partial<IeceeFilters>);
  };

  const addStandard = (value: string) => {
    const standard = normalizeStandard(value);
    if (!standard) return;
    setStandardDraft("");
    if (filters.standards.includes(standard)) return;
    applyFilters({ standards: [...filters.standards, standard] });
  };

  const removeChip = (chip: IeceeAppliedChip) => {
    if (chip.kind === "query") setDraftQuery("");
    if (chip.kind === "trademark") setDraftTrademark("");
    const nextFilters = removeIeceeChip(draftFilters(), chip);
    if (chip.kind === "query") nextFilters.query = "";
    if (chip.kind === "trademark") nextFilters.trademark = "";
    void execute({ ...applied, filters: nextFilters, page: 0, presetId: presetForQuery(nextFilters.query)?.id || "" });
  };

  const changeSort = (sort: IeceeSort) => void execute({ ...applied, sort, page: 0 });
  const sortDirOf = (desc: IeceeSort, asc: IeceeSort) => (applied.sort === desc ? "desc" as const : applied.sort === asc ? "asc" as const : null);
  const headerSpec = (column: ColumnKey): HeaderSpec => {
    const option = COLUMN_OPTIONS.find((entry) => entry.key === column)!;
    if (column === "open") return { key: column, label: option.label, sortable: false, dir: null, open: true };
    if (column === "issued") return { key: column, label: option.label, sortable: true, dir: sortDirOf("issued-desc", "issued-asc"), hint: "Sort by issue date (IECEE index)" };
    if (column === "updated") return { key: column, label: option.label, sortable: true, dir: sortDirOf("updated-desc", "updated-asc"), hint: "Sort by last update (IECEE index)" };
    if (column === "ref") return { key: column, label: option.label, sortable: true, dir: sortDirOf("ref-desc", "ref-asc"), hint: "Sort by certificate number (IECEE index)" };
    return { key: column, label: option.label, sortable: false, dir: null };
  };
  const sortByHeader = (spec: HeaderSpec) => {
    if (!spec.sortable || widthTools.justDragged()) return;
    if (spec.key === "issued") changeSort(applied.sort === "issued-desc" ? "issued-asc" : "issued-desc");
    else if (spec.key === "updated") changeSort(applied.sort === "updated-desc" ? "updated-asc" : "updated-desc");
    else if (spec.key === "ref") changeSort(applied.sort === "ref-asc" ? "ref-desc" : "ref-asc");
  };
  const changePageSize = (pageSize: number) => void execute({ ...applied, pageSize, page: 0 });
  const changePage = (page: number) => void execute({ ...applied, page: Math.max(0, Math.min(pageCount - 1, page)) });

  const reset = () => {
    request.current?.abort();
    setDraftQuery("");
    setDraftTrademark("");
    setStandardDraft("");
    setApplied({ filters: EMPTY_IECEE_FILTERS, sort: applied.sort, pageSize: applied.pageSize, page: 0, presetId: "" });
    setResult(null);
    setError("");
    setSearched(false);
    setRetrievedAt(null);
    setSelected(null);
    setLoading(false);
    syncUrl({ filters: EMPTY_IECEE_FILTERS, sort: applied.sort, pageSize: applied.pageSize, page: 0, presetId: "" });
  };

  const applyPreset = (id: string) => {
    const preset = getIeceePreset(id);
    if (!preset) return;
    setDraftQuery(preset.query);
    void execute({ ...applied, filters: { ...filters, query: preset.query, trademark: draftTrademark.trim() }, page: 0, presetId: preset.id });
  };

  const filterByManufacturer = (name: string) => {
    const query = `"${name.replace(/"/g, "")}"`;
    setDraftQuery(query);
    void execute({ ...applied, filters: { ...filters, query, trademark: draftTrademark.trim() }, page: 0, presetId: "" });
  };

  const exportWorkbook = async () => {
    const include = new Set(exportOptions.groups.includes("ref") ? exportOptions.groups : ["ref", ...exportOptions.groups]);
    const filename = sanitizeExportFilename(exportOptions.filename, defaultExportFilename("iecee-certificates"));
    saveExportSettings("iecee-excel-export", { ...exportOptions, groups: [...include], filename });
    setExporting(true);
    setExportProgress("");
    try {
      let rows = visibleCertificates;
      if (exportOptions.scope !== "page") {
        const all = await fetchIeceeCertificatesAll({
          filters,
          sort: applied.sort,
          cap: IECEE_EXPORT_CAP,
          onProgress: (loaded, expected) => setExportProgress(`Loading certificates ${loaded.toLocaleString()} of ${expected.toLocaleString()}…`),
        });
        rows = all.certificates;
      }
      // The search index has no national differences, so each certificate's record is loaded (from the table's cache where it can be).
      const differences = new Map<number, string[] | "error">(nationalDiffs);
      if (include.has("nationalDifferences")) {
        const queue = rows.filter((certificate) => !Array.isArray(differences.get(certificate.id))).map((certificate) => certificate.id);
        const needed = queue.length;
        let loaded = 0;
        const worker = async () => {
          for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            differences.set(id, await fetchIeceeCertificate(id).then((detail) => detail.nationalDifferences, () => "error" as const));
            loaded += 1;
            setExportProgress(`Loading national differences ${loaded.toLocaleString()} of ${needed.toLocaleString()}…`);
          }
        };
        await Promise.all(Array.from({ length: ND_CONCURRENCY }, worker));
      }
      const link = (text: string, url: string) => asExportLink(text, url, exportOptions.clickableLinks);
      const fields: { id: string; column: ExcelColumn; value: (certificate: IeceeCertificate) => ExcelValue }[] = [
        { id: "ref", column: { header: "Certificate number", width: 22 }, value: (certificate) => certificate.refNumber },
        { id: "type", column: { header: "Certificate type", width: 24 }, value: (certificate) => certificate.typeLabel },
        { id: "status", column: { header: "Status", width: 12 }, value: (certificate) => certificate.statusLabel },
        { id: "issued", column: { header: "Issue date", type: "date", width: 14 }, value: (certificate) => certificate.issuedAt || "" },
        { id: "updated", column: { header: "Last updated", type: "date", width: 14 }, value: (certificate) => certificate.updatedAt?.slice(0, 10) || "" },
        { id: "expires", column: { header: "Expiry date", type: "date", width: 14 }, value: (certificate) => certificate.expiresAt || "" },
        { id: "manufacturer", column: { header: "Manufacturer", width: 32 }, value: (certificate) => certificate.manufacturer },
        { id: "trademark", column: { header: "Trademark", width: 22 }, value: (certificate) => certificate.trademark || "" },
        { id: "product", column: { header: "Product", width: 40 }, value: (certificate) => certificate.subject },
        { id: "categories", column: { header: "Product categories", width: 28 }, value: (certificate) => certificate.categories.map(ieceeCategoryLabel).join("; ") },
        { id: "standards", column: { header: "Base standards", width: 34 }, value: (certificate) => certificate.standards.join("; ") },
        { id: "scopes", column: { header: "Standards with editions", width: 60 }, value: (certificate) => certificate.scopes.join("; ") },
        { id: "nationalDifferences", column: { header: "National differences", width: 40 }, value: (certificate) => { const codes = differences.get(certificate.id); return codes === "error" ? "Could not be loaded" : codes ? codes.map(nationalDifferenceLabel).join("; ") || "None" : ""; } },
        { id: "ncb", column: { header: "Certification body", width: 34 }, value: (certificate) => certificate.ncb },
        { id: "ncbCountry", column: { header: "Certification body country", width: 22 }, value: (certificate) => certificate.ncbCountry || "" },
        { id: "id", column: { header: "IECEE record id", type: "number", width: 14 }, value: (certificate) => certificate.id },
        { id: "link", column: { header: "Certificate link", type: exportOptions.clickableLinks ? "link" : "text", width: 24 }, value: (certificate) => link("Open certificate", certificate.url) },
        { id: "source", column: { header: "Source", width: 30 }, value: () => IECEE_SOURCE_LABEL },
        { id: "retrievedAt", column: { header: "Retrieved at", width: 22 }, value: () => result?.retrievedAt || new Date().toISOString() },
      ];
      const selectedFields = fields.filter((field) => include.has(field.id));
      downloadExcel({
        filename,
        sheetName: "IECEE certificates",
        columns: selectedFields.map((field) => field.column),
        rows: rows.map((certificate) => selectedFields.map((field) => field.value(certificate))),
      });
      setExportOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The export could not be completed.");
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  const statusBadge = (certificate: Pick<IeceeCertificate, "status" | "statusLabel">, clickable = false) => (
    clickable
      ? <button type="button" className={`iecee-status clickable ${certificate.status.toLowerCase() || "unknown"}`} onClick={(event) => { event.stopPropagation(); toggleValue("statuses", certificate.status); }} title={filters.statuses.includes(certificate.status as IeceeStatus) ? "Remove this status filter" : "Only show certificates with this status"}>{certificate.statusLabel}</button>
      : <span className={`iecee-status ${certificate.status.toLowerCase() || "unknown"}`}>{certificate.statusLabel}</span>
  );

  const renderCell = (certificate: IeceeCertificate, column: ColumnKey) => {
    if (column === "ref") return <><b className="fcc-id">{certificate.refNumber}</b><span>{certificate.typeLabel}</span></>;
    if (column === "manufacturer") return <span className="name-cell"><b>{certificate.manufacturer || "—"}</b>{certificate.manufacturer && <button type="button" className="icon-button row-filter" onClick={(event) => { event.stopPropagation(); filterByManufacturer(certificate.manufacturer); }} aria-label={`Only show certificates naming ${certificate.manufacturer}`} title="Only this manufacturer"><Filter size={11} /></button>}</span>;
    if (column === "trademark") return <span className="cell-list">{certificate.trademark || "—"}</span>;
    if (column === "product") return <b className="product-cell">{certificate.subject || "—"}</b>;
    if (column === "category") return <span className="pill-row">{certificate.categories.length ? certificate.categories.map((code) => <button key={code} type="button" className={`code-pill clickable ${filters.categories.includes(code) ? "hit" : ""}`} title={`${ieceeCategoryName(code) || "Category"} — click to filter`} onClick={(event) => { event.stopPropagation(); toggleValue("categories", code); }}>{code}</button>) : <span className="code-pill neutral">—</span>}</span>;
    if (column === "standards") {
      const shown = certificate.standards.slice(0, 4);
      return <span className="pill-row" title={certificate.scopesJoined}>{shown.map((standard) => <button key={standard} type="button" className={`code-pill std clickable ${filters.standards.includes(standard) ? "hit" : ""}`} onClick={(event) => { event.stopPropagation(); toggleValue("standards", standard); }} title={`Click to filter by ${standard}`}>{standard}</button>)}{certificate.standards.length > shown.length && <span className="pill-more">+{certificate.standards.length - shown.length}</span>}{!certificate.standards.length && <span className="code-pill neutral">—</span>}</span>;
    }
    if (column === "nd") {
      const codes = nationalDiffs.get(certificate.id);
      if (codes === undefined) return <span className="nd-loading" aria-label="Loading national differences"><LoaderCircle className="spin" size={12} /></span>;
      if (codes === "error") return <span title="The certificate record could not be loaded. Open the row to retry.">—</span>;
      if (!codes.length) return <span className="code-pill neutral" title="No national differences recorded on this certificate">None</span>;
      const shown = codes.slice(0, ND_PREVIEW);
      return <span className="pill-row nd-row" title={codes.map(nationalDifferenceLabel).join(", ")}>{shown.map((code) => <span key={code} className="code-pill nd-pill">{code}</span>)}{codes.length > shown.length && <span className="pill-more">+{codes.length - shown.length}</span>}</span>;
    }
    if (column === "ncb") return <span className="name-cell"><span><b>{certificate.ncb || "—"}</b><span>{certificate.ncbCountry || ""}</span></span>{certificate.ncb && <button type="button" className="icon-button row-filter" onClick={(event) => { event.stopPropagation(); toggleValue("ncbs", certificate.ncb); }} aria-label={`Only show certificates issued by ${certificate.ncb}`} title="Only this certification body"><Filter size={11} /></button>}</span>;
    if (column === "issued") return <span className="date-cell">{displayDate(certificate.issuedAt)}</span>;
    if (column === "status") return statusBadge(certificate, true);
    if (column === "type") return <span className="cell-list">{certificate.typeLabel}</span>;
    if (column === "updated") return <span className="date-cell">{displayDate(certificate.updatedAt)}</span>;
    return <a className="open-record-button" href={certificate.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open <ExternalLink size={11} /></a>;
  };

  const detail = detailState && selected && detailState.id === selected.id ? detailState : null;
  const detailRecord = detail?.status === "done" ? detail.detail : undefined;
  const family = (detail?.family || []).filter((certificate) => selected && certificate.id !== selected.id);

  return (
    <main className="explorer-shell">
      <SourceNav
        source="iecee"
        view="explorer" status={sourcePresentation.status} statusState={error ? "error" : retrievedAt ? "connected" : "ready"}
        title={<>CB certificates. <em>Made searchable.</em></>}
        tagline="Search the IECEE CB Scheme certificate index by manufacturer, trademark, product, standard, body and status."
      />


      <section className={`workspace ${filtersCollapsed ? "filters-collapsed" : ""}`} aria-label="IECEE certificate explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="filter-panel-inner">
          <div className="panel-heading">
            <div><h2>Filters</h2></div>
            <div className="panel-heading-actions">
              <button className="icon-button collapse-filter-panel" onClick={() => setFiltersCollapsed((value) => !value)} aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"}>{filtersCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            </div>
          </div>

          <div className="fcc-source-block"><Database size={15} /><div><b>Official IECEE source</b><span>Certificate search index · relayed through this site</span></div></div>

          <div className="filter-group-heading"><span>Preset</span><small>Saved searches</small></div>
          <label className="field">
            <span>IECEE watch scope</span>
            <select value={applied.presetId} onChange={(event) => event.target.value ? applyPreset(event.target.value) : void execute({ ...applied, presetId: "" })}>
              <option value="">Custom search</option>
              {IECEE_PRESETS.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}
            </select>
            {activePreset && <small className="field-hint">{activePreset.description}. {activePreset.sourceNote}</small>}
          </label>

          <div className="filter-group-heading"><span>Find</span><small>Text on the certificate</small></div>
          <label className="field keyword-field">
            <span>Certificate search</span>
            <div className="input-shell"><Search size={16} /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Manufacturer, trademark, model, product or certificate number…" onKeyDown={(event) => event.key === "Enter" && runSearch()} /></div>
            <small className="field-hint">Matches words in the manufacturer, applicant, trademark, product, model and certificate-number text. Use quotes for an exact phrase.</small>
          </label>

          <div className="filter-group-heading narrow-heading"><span>Narrow</span><small>Applied on the IECEE index</small></div>
          <div className="field" role="group" aria-label="Certificate status">
            <span>Status</span>
            <div className="facet-list">
              {statusOptions.map((option) => <label key={option.key}><input type="checkbox" checked={option.checked} onChange={() => toggleValue("statuses", option.key)} /><b>{option.label}</b><span className={`facet-count ${option.count === 0 ? "zero" : ""}`}>{option.count === undefined ? "" : option.count.toLocaleString()}</span></label>)}
            </div>
          </div>
          <div className="field" role="group" aria-label="Product category">
            <span>Product category</span>
            <div className="facet-list">
              {visibleCategories.map((option) => <label key={option.key} title={ieceeCategoryName(option.key) || option.key}><input type="checkbox" checked={option.checked} onChange={() => toggleValue("categories", option.key)} /><span className="facet-text"><b>{option.key}</b><small>{ieceeCategoryName(option.key) || "Category code as reported by IECEE"}</small></span><span className={`facet-count ${option.count === 0 ? "zero" : ""}`}>{option.count === undefined ? "" : option.count.toLocaleString()}</span></label>)}
            </div>
            {categoryOptions.length > visibleCategories.length && <button type="button" className="text-button facet-more" onClick={() => setShowAllCategories(true)}>Show all {categoryOptions.length} categories</button>}
            {showAllCategories && <button type="button" className="text-button facet-more" onClick={() => setShowAllCategories(false)}>Show fewer</button>}
            <small className="field-hint">Category names follow the <a href={IECEE_CATEGORIES_URL} target="_blank" rel="noreferrer">IECEE product-category list</a>; the index itself only carries the codes.</small>
          </div>
          <div className="field" role="group" aria-label="Standards">
            <span>Standards</span>
            <div className="chip-input" onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
              {filters.standards.map((standard) => <span key={standard} className="chip">{standard}<button type="button" onClick={() => toggleValue("standards", standard)} aria-label={`Remove ${standard}`}><X size={11} /></button></span>)}
              <input value={standardDraft} onChange={(event) => setStandardDraft(event.target.value)} placeholder={filters.standards.length ? "Add another…" : "IEC 60601-1, IEC 62368-1:2018…"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addStandard(standardDraft); } else if (event.key === "Backspace" && !standardDraft && filters.standards.length) { toggleValue("standards", filters.standards[filters.standards.length - 1]); } }} onBlur={() => standardDraft.trim() && addStandard(standardDraft)} />
            </div>
            {filters.standards.length > 1 && <div className="match-mode" role="group" aria-label="How several standards combine">
              <span className="match-mode-label">Match</span>
              <div className="match-mode-switch">
                <button type="button" className={filters.standardMatch === "any" ? "active" : ""} aria-pressed={filters.standardMatch === "any"} onClick={() => applyFilters({ standardMatch: "any" })} title="Certificates citing at least one selected standard">Any standard</button>
                <button type="button" className={filters.standardMatch === "all" ? "active" : ""} aria-pressed={filters.standardMatch === "all"} onClick={() => applyFilters({ standardMatch: "all" })} title="Certificates citing every selected standard">All standards</button>
              </div>
            </div>}
            {standardSuggestions.length > 0 && <div className="facet-suggest" aria-label="Standards in this search">{standardSuggestions.map((option) => <button key={option.key} type="button" onClick={() => addStandard(option.key)} title={`Add ${option.key} to the filter`}>{option.key}<small>{option.count.toLocaleString()}</small></button>)}</div>}
            <small className="field-hint">A base standard such as IEC 60601-1 matches every edition; add an edition such as IEC 60601-1:2005 to narrow to it.</small>
          </div>
          <div className="field" role="group" aria-label="Certificate type">
            <span>Certificate type</span>
            <div className="facet-list">
              {typeOptions.filter((option) => option.checked || option.total === undefined || option.total > 0).map((option) => <label key={option.key}><input type="checkbox" checked={option.checked} onChange={() => toggleValue("types", option.key)} /><b>{option.label}</b><span className={`facet-count ${option.count === 0 ? "zero" : ""}`}>{option.count === undefined ? "" : option.count.toLocaleString()}</span></label>)}
            </div>
          </div>
          <div className="field" role="group" aria-label="Certification body">
            <span>Certification body (NCB)</span>
            {ncbOptions.length ? <div className="facet-list">
              {visibleNcbs.map((option) => <label key={option.key} title={option.key}><input type="checkbox" checked={option.checked} onChange={() => toggleValue("ncbs", option.key)} /><b>{option.label}</b><span className={`facet-count ${option.count === 0 ? "zero" : ""}`}>{option.count.toLocaleString()}</span></label>)}
            </div> : <small className="field-hint">Run a search to list the certification bodies behind the matching certificates.</small>}
            {ncbOptions.length > visibleNcbs.length && <button type="button" className="text-button facet-more" onClick={() => setShowAllNcbs(true)}>Show all {ncbOptions.length} bodies</button>}
            {showAllNcbs && ncbOptions.length > 6 && <button type="button" className="text-button facet-more" onClick={() => setShowAllNcbs(false)}>Show fewer</button>}
          </div>
          <label className="field">
            <span>Trademark</span>
            <input list="iecee-trademarks" value={draftTrademark} onChange={(event) => setDraftTrademark(event.target.value)} placeholder="PHONAK, SENNHEISER…" onKeyDown={(event) => event.key === "Enter" && runSearch()} />
            <datalist id="iecee-trademarks">{trademarkOptions.map((option) => <option key={option.key} value={option.key}>{`${option.label} (${option.count.toLocaleString()})`}</option>)}</datalist>
            <small className="field-hint">Exact trademark as indexed by IECEE; suggestions come from the official trademark lookup.</small>
          </label>
          <div className="two-col">
            <label className="field"><span>Issued from</span><input type="date" value={filters.issuedFrom} min={facets?.issueDates?.min} max={facets?.issueDates?.max} onChange={(event) => applyFilters({ issuedFrom: event.target.value })} /></label>
            <label className="field"><span>Issued to</span><input type="date" value={filters.issuedTo} min={facets?.issueDates?.min} max={facets?.issueDates?.max} onChange={(event) => applyFilters({ issuedTo: event.target.value })} /></label>
          </div>
          <small className="field-hint fcc-limit-note">The IECEE index exposes the first 10,000 matches of any search and does not publish certificate PDFs or test reports through its public interface.</small>

          <div className="query-actions">
            <button className={`primary ${pendingChanges.length ? "attention" : ""}`} onClick={() => runSearch()} disabled={loading}><Search size={15} /> Search certificates</button>
            <button className="text-button" onClick={reset}>Reset</button>
          </div>
          {pendingChanges.length > 0 && <small className="pending-note" role="status">{pendingChanges.length} unapplied change{pendingChanges.length === 1 ? "" : "s"} ({pendingChanges.join(", ")}) — press Search to update the results.</small>}
          <RecentSearches compact entries={recents.recent} onApply={(entry) => window.location.assign(`${window.location.pathname}?${entry.params}`)} onForget={recents.forget} onClear={recents.clear} />
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title"><div><h2>Certificates</h2>{retrievedAt && <small className="fetch-meta">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</small>}</div></div>
            <div className="toolbar-actions">
              <a className="secondary" href={IECEE_PUBLIC_SEARCH_URL} target="_blank" rel="noreferrer" title="Open the official IECEE certificate search">IECEE Search <ExternalLink size={13} /></a>
              <label className="matrix-sort">Sort <select value={applied.sort} onChange={(event) => changeSort(event.target.value as IeceeSort)}>{IECEE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={14} /> Columns <ChevronDown size={13} /></summary>
                <div className="column-menu"><div className="column-menu-head"><div><b>Visible columns</b><span>Choose certificate fields</span></div><span>{widthTools.fixedLayout && <button type="button" onClick={widthTools.resetWidths}>Reset widths</button>}<button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</button></span></div><div className="column-options">{COLUMN_OPTIONS.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => setColumns((current) => current.includes(option.key) ? current.length > 1 ? current.filter((item) => item !== option.key) : current : [...current, option.key])} disabled={columns.length === 1 && columns.includes(option.key)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</div></div>
              </details>
              <button className="icon-button" onClick={async () => { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }} aria-label="Copy shareable IECEE search URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
              <button className="icon-button" onClick={() => runSearch(true)} disabled={loading} aria-label="Refresh IECEE results" title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
              <button className="secondary export-button" onClick={() => { setExportOptions((current) => ({ ...current, filename: current.filename || defaultExportFilename("iecee-certificates") })); setExportOpen(true); }} disabled={!visibleCertificates.length || exporting}><ArrowDownToLine size={14} /> Excel</button>
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Filter size={17} /></button>
            </div>
          </div>

          <AppliedFilters chips={appliedChips} onRemove={(chip) => { const full = appliedChips.find((item) => item.key === chip.key); if (full) removeChip(full); }} onClear={reset} />

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>IECEE search needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {result?.capped && <div className="coverage-banner"><Database size={17} /><div><b>Only the first {IECEE_RESULT_WINDOW.toLocaleString()} of {total.toLocaleString()} matches are reachable</b><span>The IECEE index stops paging at 10,000 results. Add a category, standard, status or date range to reach the rest.</span></div></div>}
          {loading && <div className="loading-layer"><div className="loading-note"><LoaderCircle className="spin" size={24} /> Contacting the IECEE certificate index…</div></div>}

          {!searched && !loading ? <div className="empty-state"><div className="empty-number">CB</div><Award size={34} /><h3>Start with a certificate search.</h3><p>Search a manufacturer, trademark, model, product description or certificate number in the official IECEE CB Scheme certificate index, then narrow by status, product category, standard, certification body and issue date.</p></div>
          : searched && !loading && !error && result && !visibleCertificates.length ? <div className="empty-state"><div className="empty-number">0</div><Search size={34} /><h3>No IECEE certificates matched.</h3><p>Try fewer words, a manufacturer name instead of a model, or remove a status, category or standard filter.</p><div className="empty-actions"><button className="secondary" onClick={() => applyFilters({ statuses: [], types: [], categories: [], standards: [], ncbs: [], issuedFrom: "", issuedTo: "" })}>Clear narrow filters</button></div></div>
          : visibleCertificates.length > 0 && <>
            <div className="table-wrap" ref={tableScroll}><table className={`fcc-table iecee-table${widthTools.fixedLayout ? " table-fixed" : ""}`} style={widthTools.tableStyle}>{widthTools.colGroup}<thead><tr>{columns.map((column) => <HeaderCell key={column} spec={headerSpec(column)} resizing={widthTools.resizing} onSort={sortByHeader} onResizeStart={widthTools.startResize} onResizeReset={widthTools.resetWidth} />)}</tr></thead><tbody>{visibleCertificates.map((certificate) => <tr key={certificate.id} tabIndex={0} onClick={() => setSelected(certificate)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(certificate); } }}>{columns.map((column) => <td key={column}>{renderCell(certificate, column)}</td>)}</tr>)}</tbody></table></div>
            <div className="pagination"><span>{total.toLocaleString()} matching certificate{total === 1 ? "" : "s"}{result && result.unfilteredTotal !== total ? ` of ${result.unfilteredTotal.toLocaleString()} for this text` : ""} · page {applied.page + 1} of {pageCount.toLocaleString()}{retrievedAt && <small className="fetch-meta">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</small>}</span><label className="page-size">Rows <select value={applied.pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>{IECEE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div><button className="icon-button" onClick={() => changePage(applied.page - 1)} disabled={applied.page === 0 || loading} aria-label="Previous page">←</button><button className="icon-button" onClick={() => changePage(applied.page + 1)} disabled={applied.page + 1 >= pageCount || loading} aria-label="Next page">→</button></div></div>
          </>}
        </section>
      </section>

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <aside className={`drawer${drawerWide ? " drawer-wide" : ""}`} aria-label="IECEE certificate">
          <DrawerTop label="IECEE CB SCHEME CERTIFICATE" wide={drawerWide} onToggleWide={() => setDrawerWide((wide) => !wide)} onClose={() => setSelected(null)} />
          <div className="drawer-hero">
            <span className="record-id">{selected.typeLabel.toUpperCase()}</span>
            <h2 className="fcc-drawer-id">{selected.refNumber}</h2>
            <p><PackageSearch size={15} /> {detailRecord?.product || selected.subject || "—"}{detailRecord?.model ? ` · ${detailRecord.model}` : ""}</p>
            <p><Building2 size={15} /> {selected.manufacturer || "—"}{selected.trademark ? ` · ${selected.trademark}` : ""}</p>
            <p><MapPin size={15} /> {selected.ncb}{selected.ncbCountry ? `, ${selected.ncbCountry}` : ""} {statusBadge(selected)}</p>
            <div className="drawer-actions">
              <a className="secondary" href={selected.url} target="_blank" rel="noreferrer">Open on certificates.iecee.org <ExternalLink size={14} /></a>
              <button className="secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(selected.refNumber); setIdCopied(true); setTimeout(() => setIdCopied(false), 1500); }}>{idCopied ? <Check size={14} /> : <Clipboard size={14} />} {idCopied ? "Copied" : "Copy certificate number"}</button>
            </div>
          </div>
          <div className="detail-stats"><div><span>Issued</span><b>{displayDate(selected.issuedAt)}</b></div><div><span>Status</span><b>{detailRecord?.status.label || selected.statusLabel}</b></div><div><span>Category</span><b>{selected.categories.join(", ") || "—"}</b></div><div><span>Standards</span><b>{(detailRecord?.standards.length ?? selected.scopes.length) || 0}</b></div></div>

          {detail?.status === "error" && <div className="error-banner"><CircleAlert size={18} /><div><b>Full record not loaded</b><span>{detail.error} The fields below come from the search index.</span></div></div>}
          {!detail && <div className="udi-panel-loading"><LoaderCircle className="spin" size={14} /> Loading the full certificate record…</div>}

          <section className="detail-section"><h3><Award size={16} /> Certificate</h3><dl className="fcc-detail-list">
            <div><dt>Certificate number <small>IECEE source</small></dt><dd>{selected.refNumber}</dd></div>
            <div><dt>Type</dt><dd>{detailRecord?.type.label || selected.typeLabel}</dd></div>
            <div><dt>Status</dt><dd>{detailRecord?.status.label || selected.statusLabel}{detailRecord?.status.message ? ` — ${detailRecord.status.message}` : ""}</dd></div>
            {detailRecord?.cancellation && <div><dt>Cancellation</dt><dd>{[detailRecord.cancellation.date ? displayDate(detailRecord.cancellation.date) : "", detailRecord.cancellation.by ? `by ${detailRecord.cancellation.by}` : ""].filter(Boolean).join(" ") || "Recorded"}</dd></div>}
            <div><dt>Issue date</dt><dd>{displayDate(selected.issuedAt)}</dd></div>
            {detailRecord?.originIssuedAt && <div><dt>Original issue date</dt><dd>{displayDate(detailRecord.originIssuedAt)}</dd></div>}
            <div><dt>Last updated</dt><dd>{displayDateTime(detailRecord?.updatedAt || selected.updatedAt)}</dd></div>
            <div><dt>Expiry date</dt><dd>{selected.expiresAt || detailRecord?.expiresAt ? displayDate(detailRecord?.expiresAt || selected.expiresAt) : "None recorded"}</dd></div>
            {detailRecord?.schemeCode && <div><dt>Scheme code</dt><dd>{detailRecord.schemeCode}</dd></div>}
            {detailRecord?.refIssueNumber && <div><dt>Issue record number</dt><dd>{detailRecord.refIssueNumber}</dd></div>}
            <div><dt>IECEE record id</dt><dd>{selected.id}</dd></div>
          </dl></section>

          <section className="detail-section"><h3><Tag size={16} /> Product</h3><dl className="fcc-detail-list">
            <div><dt>Product</dt><dd>{detailRecord?.product || selected.subject || "—"}</dd></div>
            <div><dt>Model(s)</dt><dd className="prewrap">{detailRecord?.model || (detail?.status === "done" ? "—" : "Loading…")}</dd></div>
            <div><dt>Ratings</dt><dd className="prewrap">{detailRecord?.rating || (detail?.status === "done" ? "—" : "Loading…")}</dd></div>
            <div><dt>Trademark</dt><dd>{detailRecord?.trademark || selected.trademark || "—"}</dd></div>
            <div><dt>Product categories</dt><dd>{(detailRecord?.categories || selected.categories).map(ieceeCategoryLabel).join("; ") || "—"}</dd></div>
            {detailRecord?.additionalInfo && <div><dt>Additional information</dt><dd className="prewrap">{detailRecord.additionalInfo}</dd></div>}
          </dl></section>

          <section className="detail-section"><h3><ListChecks size={16} /> Standards and national differences</h3>
            <div className="chips standards-chips">{(detailRecord?.standards.length ? detailRecord.standards : selected.scopes).map((standard) => <button key={standard} type="button" className="chip-link" onClick={() => { setSelected(null); addStandard(baseStandard(standard)); }} title={`Filter by ${baseStandard(standard)}`}>{standard}</button>)}{!(detailRecord?.standards.length || selected.scopes.length) && <span>No standards recorded</span>}</div>
            <dl className="fcc-detail-list">
              <div><dt>National differences</dt><dd>{detailRecord ? detailRecord.nationalDifferences.length ? detailRecord.nationalDifferences.map(nationalDifferenceLabel).join(", ") : "None recorded" : "Loading…"}</dd></div>
              {detailRecord?.scopesComment && <div><dt>Scope comment</dt><dd className="prewrap">{detailRecord.scopesComment}</dd></div>}
              {detailRecord?.testReportRef && <div><dt>Test report reference</dt><dd>{detailRecord.testReportRef}</dd></div>}
              {detailRecord?.testingLab && <div><dt>Testing laboratory</dt><dd>{detailRecord.testingLab}</dd></div>}
              {detailRecord?.factoryAuditReportRef && <div><dt>Factory audit report</dt><dd>{detailRecord.factoryAuditReportRef}</dd></div>}
            </dl>
          </section>

          <section className="detail-section"><h3><Factory size={16} /> Parties</h3><dl className="fcc-detail-list">
            <div><dt>Manufacturer</dt><dd>{detailRecord?.manufacturers.length ? detailRecord.manufacturers.map((party) => party.address ? `${party.name} — ${party.address}` : party.name).join("; ") : selected.manufacturer || "—"}</dd></div>
            <div><dt>Factory</dt><dd>{detailRecord ? detailRecord.factories.length ? detailRecord.factories.map((party) => party.address ? `${party.name} — ${party.address}` : party.name).join("; ") : "Not published in the public record" : "Loading…"}</dd></div>
            <div><dt>Applicant</dt><dd>{detailRecord ? detailRecord.applicants.length ? detailRecord.applicants.map((party) => party.address ? `${party.name} — ${party.address}` : party.name).join("; ") : "Not published in the public record" : "Loading…"}</dd></div>
          </dl>{selected.manufacturer && <button className="secondary official-record-link" type="button" onClick={() => { setSelected(null); filterByManufacturer(selected.manufacturer); }}><Building2 size={14} /> All certificates naming this manufacturer</button>}</section>

          <section className="detail-section"><h3><ShieldCheck size={16} /> Certification body</h3><dl className="fcc-detail-list">
            <div><dt>NCB</dt><dd>{detailRecord?.ncb.name || selected.ncb || "—"}</dd></div>
            {detailRecord?.ncb.code && <div><dt>NCB code</dt><dd>{detailRecord.ncb.code}</dd></div>}
            <div><dt>Address</dt><dd>{detailRecord?.ncb.address || selected.ncbCountry || "—"}</dd></div>
          </dl><button className="secondary official-record-link" type="button" onClick={() => { setSelected(null); if (!filters.ncbs.includes(selected.ncb)) applyFilters({ ncbs: [...filters.ncbs, selected.ncb] }); }}><ShieldCheck size={14} /> Certificates from this body in the current search</button></section>

          <section className="detail-section"><h3><Globe size={16} /> Certificate family</h3>
            {!detail ? <p>Looking for modifications and amendments of {ieceeRefBase(selected.refNumber)}…</p> : family.length ? <div className="profile-records">{family.map((certificate) => <button key={certificate.id} type="button" onClick={() => setSelected(certificate)}><b>{certificate.refNumber}</b><span>{displayDate(certificate.issuedAt)} · {certificate.statusLabel} · {certificate.subject}</span></button>)}</div> : <p>No other certificates share the base number {ieceeRefBase(selected.refNumber)} in the index.</p>}
            <div className="section-note">Family members are found by searching the base certificate number and keeping references that extend it (for example -A1, /M1). This is a text match on certificate numbers, not an IECEE relationship field.</div>
          </section>

          <section className="detail-section"><h3><CalendarDays size={16} /> Evidence / source</h3><dl className="fcc-detail-list"><div><dt>Regulatory source</dt><dd>{IECEE_SOURCE_LABEL}</dd></div><div><dt>Certificate PDF</dt><dd>{detailRecord?.hasPdf ? "A PDF exists on the IECEE system; download requires the official site and is not exposed to the public API." : "Not exposed through the public API."}</dd></div><div><dt>Loaded in app</dt><dd>{retrievedAt ? retrievedAt.toLocaleString([], dateTimeFormat) : "—"}</dd></div></dl><a className="primary official-record-link" href={selected.url} target="_blank" rel="noreferrer">Open official certificate page <ExternalLink size={14} /></a></section>
          <section className="detail-section raw-section"><details><summary>View raw IECEE record <ChevronDown size={15} /></summary><pre>{JSON.stringify(detailRecord?.raw || selected.raw, null, 2)}</pre></details></section>
        </aside>
      </div>}

      <ExportDialog
        open={exportOpen}
        title="Pack this workbook."
        countLabel="Choose columns and which certificate rows to include."
        note={exportProgress || (exportOptions.scope !== "page" ? `Every matching certificate is fetched from the IECEE index, up to ${IECEE_EXPORT_CAP.toLocaleString()} rows.` : undefined)}
        toggles={IECEE_EXPORT_TOGGLES}
        selected={exportOptions.groups}
        confirming={exporting}
        filename={exportOptions.filename}
        scope={exportOptions.scope}
        clickableLinks={exportOptions.clickableLinks}
        pageCount={visibleCertificates.length}
        allCount={reachable}
        filters={appliedChips.map((chip) => chip.label)}
        onFilename={(filename) => setExportOptions((current) => ({ ...current, filename }))}
        onScope={(scope) => setExportOptions((current) => ({ ...current, scope }))}
        onClickableLinks={(clickableLinks) => setExportOptions((current) => ({ ...current, clickableLinks }))}
        onChange={(groups) => setExportOptions((current) => ({ ...current, groups }))}
        onUseVisible={() => setExportOptions((current) => ({
          ...current,
          groups: ["ref", ...columns.flatMap((column) => IECEE_VISIBLE_TO_EXPORT[column] || [])],
        }))}
        onCancel={() => !exporting && setExportOpen(false)}
        onConfirm={() => void exportWorkbook()}
      />
    </main>
  );
}
