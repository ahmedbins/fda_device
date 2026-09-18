"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Columns3,
  Database,
  ExternalLink,
  Filter,
  Link2,
  LoaderCircle,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { AppliedFilters, DrawerTop, HeaderCell, useEscapeToClose, RecentSearches, compareValues, navigateWithParams, toggleSort, recentSearchParams, columnSharesKey, useColumnWidths, useRecentSearches, useScrollShadow, type AppliedChip, type HeaderSpec, type SortDir } from "./explorer-tools";
import { DEFAULT_FCC_PRESET, FCC_PRESETS, getFccPreset } from "./fcc-config";
import {
  FCC_EAS_API,
  FCC_SEARCH_URL,
  FCC_SOURCE_LABEL,
  fccLocation,
  fccOfficialIdParts,
  fccSourcePresentation,
  formatFccRfBands,
  groupFccRecordsByGrantee,
  normalizeFccScope,
  parseFccScopes,
  type FccGranteeRegistration,
  type FccSearchResult,
  type NormalizedFccRecord,
} from "./fcc-core";
import { fccPublicRecordUrl } from "./fcc-index";
import { clearFccCache, fetchFccExhibits, importOfficialFccResponse, searchFcc } from "./fcc-service";
import { downloadExcel, type ExcelColumn, type ExcelValue } from "./excel-export";
import { ExportDialog, asExportLink, defaultExportFilename, loadExportSettings, sanitizeExportFilename, saveExportSettings } from "./export-dialog";

type ColumnKey = "fccId" | "grantee" | "granteeCode" | "authorizationDate" | "purpose" | "description" | "equipmentClass" | "rf" | "location" | "source" | "open";
type SortColumn = Exclude<ColumnKey, "open" | "source">;
type SortKey = `${SortColumn}-${SortDir}`;
const SORT_COLUMNS: SortColumn[] = ["fccId", "grantee", "granteeCode", "authorizationDate", "purpose", "description", "equipmentClass", "rf", "location"];
const DEFAULT_SORT: SortKey = "authorizationDate-desc";
const SORT_PRESETS: { value: SortKey; label: string }[] = [
  { value: "authorizationDate-desc", label: "Newest grant" },
  { value: "authorizationDate-asc", label: "Oldest grant" },
  { value: "fccId-asc", label: "FCC ID" },
  { value: "grantee-asc", label: "Grantee" },
];
const LEGACY_SORTS: Record<string, SortKey> = { "date-desc": "authorizationDate-desc", "date-asc": "authorizationDate-asc", "fcc-id": "fccId-asc", grantee: "grantee-asc" };

function parseSortKey(value: string | null): SortKey {
  if (!value) return DEFAULT_SORT;
  if (LEGACY_SORTS[value]) return LEGACY_SORTS[value];
  const match = value.match(/^(.+)-(asc|desc)$/);
  return match && (SORT_COLUMNS as string[]).includes(match[1]) ? value as SortKey : DEFAULT_SORT;
}

function splitSort(sort: SortKey): { key: SortColumn; dir: SortDir } {
  const at = sort.lastIndexOf("-");
  return { key: sort.slice(0, at) as SortColumn, dir: sort.slice(at + 1) as SortDir };
}
type ResultView = "records" | "grantees";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "fccId", label: "FCC ID", hint: "FCC-reported authorization identifier" },
  { key: "grantee", label: "Grantee", hint: "FCC-reported responsible party" },
  { key: "granteeCode", label: "Grantee code", hint: "Derived from a confirmed FCC grantee scope" },
  { key: "authorizationDate", label: "Authorization date", hint: "FCC grant date" },
  { key: "purpose", label: "Application purpose", hint: "FCC-reported application purpose" },
  { key: "description", label: "Equipment description", hint: "Official FCC grant notes" },
  { key: "equipmentClass", label: "Equipment class", hint: "Official FCC grant equipment class" },
  { key: "rf", label: "RF characteristics", hint: "Official EAS frequency range" },
  { key: "location", label: "Grantee location", hint: "FCC-reported city, state and country" },
  { key: "source", label: "Source", hint: "Authoritative regulatory source" },
  { key: "open", label: "Open record", hint: "Direct public page for this FCC ID" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["fccId", "grantee", "granteeCode", "authorizationDate", "purpose", "location", "source", "open"];
const PAGE_SIZES = [10, 25, 50, 100];
const FCC_EXPORT_TOGGLES = [
  { id: "fccId", label: "FCC ID", required: true },
  { id: "grantee", label: "Grantee" },
  { id: "granteeCode", label: "Grantee code" },
  { id: "productCode", label: "Product code" },
  { id: "authorizationDate", label: "Authorization date" },
  { id: "activity", label: "Activity category" },
  { id: "purpose", label: "FCC-reported purpose" },
  { id: "description", label: "Equipment description" },
  { id: "equipmentClass", label: "Equipment class" },
  { id: "rf", label: "RF characteristics" },
  { id: "location", label: "Grantee location" },
  { id: "publicLink", label: "Public FCC ID page" },
  { id: "exhibitCount", label: "Exhibit count" },
  { id: "exhibitTypes", label: "Exhibit types" },
  { id: "exhibitNames", label: "Exhibit document names" },
  { id: "firstExhibit", label: "First exhibit link" },
  { id: "confidential", label: "Confidential / metadata-only" },
  { id: "source", label: "Source" },
  { id: "sourceMode", label: "Source mode" },
  { id: "retrievedAt", label: "Retrieved at" },
];
const DEFAULT_FCC_EXPORT = ["fccId", "grantee", "granteeCode", "authorizationDate", "purpose", "location", "publicLink", "exhibitCount", "exhibitTypes", "exhibitNames", "firstExhibit"];
const FCC_VISIBLE_TO_EXPORT: Partial<Record<ColumnKey, string[]>> = {
  fccId: ["fccId"],
  grantee: ["grantee"],
  granteeCode: ["granteeCode"],
  authorizationDate: ["authorizationDate"],
  purpose: ["purpose", "activity"],
  description: ["description"],
  equipmentClass: ["equipmentClass"],
  rf: ["rf"],
  location: ["location"],
  open: ["publicLink"],
  source: ["source"],
};

function initialState() {
  const preset = getFccPreset(DEFAULT_FCC_PRESET);
  const fallback = { query: "", scopes: preset?.granteeCodes || [] as string[], from: "", to: "", purpose: "", sort: DEFAULT_SORT, pageSize: 25, resultView: "records" as ResultView, presetId: preset?.id || "", autorun: !!preset };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const query = normalizeFccScope(params.get("q") || "");
  const requestedPreset = getFccPreset(params.get("preset"));
  const urlScopes = parseFccScopes(params.get("ids") || "");
  const useDefaultPreset = !query && !urlScopes.length && !params.has("preset");
  const activePreset = requestedPreset || (useDefaultPreset ? preset : undefined);
  const scopes = urlScopes.length ? urlScopes : activePreset?.granteeCodes || [];
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const purpose = params.get("purpose") || "";
  const sort = parseSortKey(params.get("sort"));
  const requestedSize = Number(params.get("rows"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;
  const resultView = params.get("view") === "grantees" ? "grantees" as ResultView : "records" as ResultView;
  return { query, scopes, from, to, purpose, sort, pageSize, resultView, presetId: activePreset?.id || "", autorun: !!(query || scopes.length) };
}

function syncUrl(query: string, scopes: string[], from: string, to: string, purpose: string, sort: SortKey, pageSize: number, resultView: ResultView, presetId = "") {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (scopes.length) params.set("ids", scopes.join(","));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (purpose) params.set("purpose", purpose);
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  if (pageSize !== 25) params.set("rows", String(pageSize));
  if (resultView !== "records") params.set("view", resultView);
  if (presetId) params.set("preset", presetId);
  const value = params.toString();
  window.history.replaceState(null, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

function sortValue(record: NormalizedFccRecord, key: SortColumn): string | undefined {
  if (key === "fccId") return record.fccId;
  if (key === "grantee") return record.granteeName;
  if (key === "granteeCode") return record.granteeCode;
  if (key === "authorizationDate") return record.authorizationDate;
  if (key === "purpose") return record.applicationPurpose;
  if (key === "description") return record.equipmentDescription;
  if (key === "equipmentClass") return record.equipmentClasses?.join("; ");
  if (key === "rf") return formatFccRfBands(record.rfBands) || undefined;
  return fccLocation(record) === "—" ? undefined : fccLocation(record);
}

function sortRecords(records: NormalizedFccRecord[], sort: SortKey) {
  const { key, dir } = splitSort(sort);
  return [...records].sort((a, b) => compareValues(sortValue(a, key), sortValue(b, key), dir) || a.fccId.localeCompare(b.fccId) || (b.authorizationDate || "").localeCompare(a.authorizationDate || ""));
}

/** Short label for a search, used by the recent-searches list. */
function describeSearch(query: string, scopes: string[], purpose: string, from: string, to: string, presetLabel?: string) {
  return [presetLabel || [query, ...scopes].filter(Boolean).join(" + "), purpose, from ? `from ${from}` : "", to ? `to ${to}` : ""].filter(Boolean).join(" · ") || "FCC search";
}

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function FccExplorerPage() {
  const [initial] = useState(initialState);
  const [query, setQuery] = useState(initial.query);
  const [scopes, setScopes] = useState<string[]>(initial.scopes);
  const [scopeDraft, setScopeDraft] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [resultView, setResultView] = useState<ResultView>(initial.resultView);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState<NormalizedFccRecord[]>([]);
  const [grantees, setGrantees] = useState<FccGranteeRegistration[]>([]);
  const [searchMeta, setSearchMeta] = useState<FccSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState(() => loadExportSettings("fcc-excel-export", {
    groups: DEFAULT_FCC_EXPORT,
    scope: "all",
    unique: false,
    clickableLinks: true,
    filename: "",
  }));
  const [error, setError] = useState("");
  const [coverageNote, setCoverageNote] = useState("");
  const [importText, setImportText] = useState("");
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<NormalizedFccRecord | null>(null);
  const [drawerWide, setDrawerWide] = useState(false);
  const [selectedGrantee, setSelectedGrantee] = useState<string | null>(null);
  useEscapeToClose(!!(selected || selectedGrantee), () => { if (selectedGrantee) setSelectedGrantee(null); else setSelected(null); });
  // The pane is a normal column above 720px; this only opens the off-canvas drawer on phones.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    const saved = localStorage.getItem("fcc-explorer-columns");
    if (!saved) return DEFAULT_COLUMNS;
    try {
      const parsed = (JSON.parse(saved) as ColumnKey[]).filter((key) => COLUMN_OPTIONS.some((option) => option.key === key));
      if (!parsed.length) return DEFAULT_COLUMNS;
      const shortened = parsed.filter((key) => key !== "open");
      const looksLikeReplacedDefault = shortened.length === 4
        && shortened[0] === "fccId"
        && shortened[1] === "grantee"
        && shortened[2] === "authorizationDate"
        && shortened[3] === "purpose";
      if (looksLikeReplacedDefault) return DEFAULT_COLUMNS;
      return parsed.includes("open") ? parsed : [...parsed, "open"];
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const scopeInput = useRef<HTMLInputElement>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const request = useRef<AbortController | null>(null);
  const widthTools = useColumnWidths(columnSharesKey("fcc-records"), columns);
  const tableScroll = useScrollShadow([columns]);
  const recents = useRecentSearches("fcc-recent-searches");
  const rememberRecent = recents.remember;

  const effectiveScopes = useMemo(() => [...new Set([query, ...scopes].filter(Boolean))], [query, scopes]);
  const filteredRecords = useMemo(() => sortRecords(records.filter((record) => {
    if (from && (!record.authorizationDate || record.authorizationDate < from)) return false;
    if (to && (!record.authorizationDate || record.authorizationDate > to)) return false;
    if (purpose && record.purposeCategory !== purpose) return false;
    return true;
  }), sort), [records, from, purpose, to, sort]);
  const groupedRecords = useMemo(() => groupFccRecordsByGrantee(filteredRecords), [filteredRecords]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const visibleRecords = filteredRecords.slice(page * pageSize, page * pageSize + pageSize);

  const runSearch = useCallback(async (force = false) => {
    if (!effectiveScopes.length) {
      setError("Enter an FCC ID, an FCC-ID prefix, or a complete grantee code.");
      return;
    }
    if (effectiveScopes.some((scope) => scope.length < 3)) {
      setError("FCC searches must start with at least three characters.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setCoverageNote("");
    setSelected(null);
    setSelectedGrantee(null);
    setPage(0);
    setSearched(true);
    if (force) clearFccCache(effectiveScopes);
    syncUrl(query, scopes, from, to, purpose, sort, pageSize, resultView, presetId);
    try {
      const next = await searchFcc(effectiveScopes, controller.signal);
      if (controller.signal.aborted) return;
      setRecords(next.records);
      setGrantees(next.grantees);
      setSearchMeta(next);
      setRetrievedAt(new Date(next.retrievedAt));
      rememberRecent(recentSearchParams(window.location.search), describeSearch(query, scopes, purpose, from, to, getFccPreset(presetId)?.label));
      if (next.unresolvedScopes.length) setCoverageNote(`${next.unresolvedScopes.join(", ")} is outside the FCC scopes this site keeps current, and the FCC blocks automated requests for other scopes. Import the official FCC XML/JSON response below to analyze it here.`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setRecords([]);
      setError(caught instanceof Error ? caught.message : "The FCC Equipment Authorization source could not be reached.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [effectiveScopes, from, pageSize, presetId, purpose, query, rememberRecent, resultView, scopes, sort, to]);

  useEffect(() => {
    if (initial.autorun) queueMicrotask(() => runSearch());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected || selected.exhibits?.length) return;
    let cancelled = false;
    fetchFccExhibits(selected.fccId).then((exhibits) => {
      if (!cancelled && exhibits.length) setSelected((current) => current && current.fccId === selected.fccId ? { ...current, exhibits } : current);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    localStorage.setItem("fcc-explorer-columns", JSON.stringify(columns));
  }, [columns]);

  const commitScopes = (value: string) => {
    const parsed = parseFccScopes(value);
    if (parsed.length) setScopes((current) => [...new Set([...current, ...parsed])]);
    setScopeDraft("");
  };

  const reset = () => {
    request.current?.abort();
    setQuery(""); setScopes([]); setScopeDraft(""); setFrom(""); setTo(""); setPurpose(""); setPresetId("");
    setRecords([]); setGrantees([]); setSearchMeta(null); setCoverageNote(""); setError(""); setSearched(false); setRetrievedAt(null); setPage(0);
    syncUrl("", [], "", "", "", sort, pageSize, resultView);
  };

  const applyPreset = (id: string) => {
    const preset = getFccPreset(id);
    if (!preset) return;
    const params = new URLSearchParams({ preset: preset.id });
    window.location.assign(`${window.location.pathname}?${params}`);
  };

  const importOfficialResponse = () => {
    const imported = importOfficialFccResponse(importText, effectiveScopes);
    if (!imported.length) {
      setError("No FCC authorization records were found in that XML or JSON response.");
      return;
    }
    setRecords((current) => [...current, ...imported].filter((record, index, all) => all.findIndex((candidate) => candidate.fccId === record.fccId && candidate.authorizationDate === record.authorizationDate && candidate.applicationPurpose === record.applicationPurpose) === index));
    setRetrievedAt(new Date());
    setCoverageNote(`Imported ${imported.length} official FCC authorization record${imported.length === 1 ? "" : "s"} for this browser session.`);
    setError("");
    setSearched(true);
    setImportText("");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const exportWorkbook = async () => {
    const include = new Set(exportOptions.groups.includes("fccId") ? exportOptions.groups : ["fccId", ...exportOptions.groups]);
    const filename = sanitizeExportFilename(exportOptions.filename, defaultExportFilename("fcc-authorizations"));
    saveExportSettings("fcc-excel-export", { ...exportOptions, groups: [...include], filename });
    setExporting(true);
    try {
      const sourceRows = exportOptions.scope === "page" ? visibleRecords : filteredRecords;
      const rowsToExport = exportOptions.unique
        ? [...sourceRows.reduce((map, record) => {
          const current = map.get(record.fccId);
          if (!current || (record.authorizationDate || "") > (current.authorizationDate || "")) map.set(record.fccId, record);
          return map;
        }, new Map<string, NormalizedFccRecord>()).values()]
        : sourceRows;
      const wantExhibits = ["exhibitCount", "exhibitTypes", "exhibitNames", "firstExhibit", "confidential"].some((id) => include.has(id));
      const exhibitsById = new Map<string, NonNullable<NormalizedFccRecord["exhibits"]>>();
      if (wantExhibits) {
        const uniqueIds = [...new Set(rowsToExport.map((record) => record.fccId))].slice(0, 40);
        for (const fccId of uniqueIds) {
          const cached = rowsToExport.find((record) => record.fccId === fccId && record.exhibits?.length)?.exhibits || [];
          exhibitsById.set(fccId, cached.length ? cached : await fetchFccExhibits(fccId).catch(() => []));
        }
      }
      const link = (text: string, url: string) => asExportLink(text, url, exportOptions.clickableLinks);
      const fields: { id: string; column: ExcelColumn; value: (record: NormalizedFccRecord) => ExcelValue }[] = [
        { id: "fccId", column: { header: "FCC ID", width: 16 }, value: (record) => record.fccId },
        { id: "grantee", column: { header: "Grantee", width: 28 }, value: (record) => record.granteeName || "" },
        { id: "granteeCode", column: { header: "Grantee code", width: 14 }, value: (record) => record.granteeCode || "" },
        { id: "productCode", column: { header: "Product code", width: 16 }, value: (record) => record.fccProductCode || "" },
        { id: "authorizationDate", column: { header: "Authorization date", type: "date", width: 16 }, value: (record) => record.authorizationDate || "" },
        { id: "activity", column: { header: "Activity category", width: 24 }, value: (record) => record.purposeCategory || "" },
        { id: "purpose", column: { header: "FCC-reported purpose", width: 26 }, value: (record) => record.applicationPurpose || "" },
        { id: "description", column: { header: "Equipment description", width: 36 }, value: (record) => record.equipmentDescription || "" },
        { id: "equipmentClass", column: { header: "Equipment class", width: 28 }, value: (record) => (record.equipmentClasses || []).join("; ") },
        { id: "rf", column: { header: "RF characteristics", width: 28 }, value: (record) => formatFccRfBands(record.rfBands) },
        { id: "location", column: { header: "Grantee location", width: 22 }, value: (record) => fccLocation(record) === "—" ? "" : fccLocation(record) },
        { id: "publicLink", column: { header: "Public FCC ID page", type: exportOptions.clickableLinks ? "link" : "text", width: 22 }, value: (record) => link(record.fccId, fccPublicRecordUrl(record.fccId)) },
        { id: "exhibitCount", column: { header: "Exhibit count", type: "number", width: 14 }, value: (record) => (exhibitsById.get(record.fccId) || record.exhibits || []).length },
        { id: "exhibitTypes", column: { header: "Exhibit types", width: 32 }, value: (record) => [...new Set((exhibitsById.get(record.fccId) || record.exhibits || []).map((exhibit) => exhibit.exhibitType))].join("; ") },
        { id: "exhibitNames", column: { header: "Exhibit document names", width: 42 }, value: (record) => (exhibitsById.get(record.fccId) || record.exhibits || []).map((exhibit) => exhibit.name).join("; ") },
        { id: "firstExhibit", column: { header: "First exhibit", type: exportOptions.clickableLinks ? "link" : "text", width: 22 }, value: (record) => {
          const firstPublic = (exhibitsById.get(record.fccId) || record.exhibits || []).find((exhibit) => exhibit.url && !/metadata only/i.test(exhibit.confidentiality || ""));
          return firstPublic?.url ? link(firstPublic.name, firstPublic.url) : "";
        } },
        { id: "confidential", column: { header: "Confidential / metadata-only", width: 24 }, value: (record) => (exhibitsById.get(record.fccId) || record.exhibits || []).filter((exhibit) => exhibit.confidentiality).map((exhibit) => `${exhibit.name}: ${exhibit.confidentiality}`).join("; ") },
        { id: "source", column: { header: "Source", width: 14 }, value: () => "FCC" },
        { id: "sourceMode", column: { header: "Source mode", width: 16 }, value: (record) => record.sourceMode || "" },
        { id: "retrievedAt", column: { header: "Retrieved at", width: 22 }, value: (record) => record.retrievedAt },
      ];
      const selectedFields = fields.filter((field) => include.has(field.id));
      downloadExcel({
        filename,
        sheetName: "FCC authorizations",
        columns: selectedFields.map((field) => field.column),
        rows: rowsToExport.map((record) => selectedFields.map((field) => field.value(record))),
      });
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const toggleColumn = (key: ColumnKey) => setColumns((current) => current.includes(key)
    ? current.length > 1 ? current.filter((item) => item !== key) : current
    : [...current, key]);

  const renderCell = (record: NormalizedFccRecord, column: ColumnKey) => {
    if (column === "fccId") return <b className="fcc-id">{record.fccId}</b>;
    if (column === "grantee") return <><b>{record.granteeName || "—"}</b><span>FCC grantee</span></>;
    if (column === "granteeCode") return record.granteeCode ? <button type="button" className="source-cell clickable" onClick={(event) => { event.stopPropagation(); navigateWithParams((params) => { params.set("ids", record.granteeCode!); params.delete("q"); params.delete("preset"); }); }} title={`Only show authorizations under grantee code ${record.granteeCode}`}>{record.granteeCode}</button> : <span className="source-cell">—</span>;
    if (column === "authorizationDate") return <span className="date-cell">{displayDate(record.authorizationDate)}</span>;
    if (column === "purpose") return record.purposeCategory ? <button type="button" className="cell-list clickable" onClick={(event) => { event.stopPropagation(); setPurpose((current) => current === record.purposeCategory ? "" : record.purposeCategory || ""); setPage(0); }} title={`Only show ${record.purposeCategory} records (FCC-reported purpose: ${record.applicationPurpose || "—"})`}>{record.applicationPurpose || "—"}</button> : <span className="cell-list">{record.applicationPurpose || "—"}</span>;
    if (column === "description") return <span className="cell-list">{record.equipmentDescription || "—"}</span>;
    if (column === "equipmentClass") return <span className="cell-list">{record.equipmentClasses?.join("; ") || "—"}</span>;
    if (column === "rf") return <span className="cell-list">{formatFccRfBands(record.rfBands) || "—"}</span>;
    if (column === "location") return <span className="cell-list">{fccLocation(record)}</span>;
    if (column === "open") return <a className="open-record-button" href={fccPublicRecordUrl(record.fccId)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open FCC ID <ExternalLink size={11} /></a>;
    return <span className="source-cell">FCC EAS</span>;
  };

  const sourcePresentation = fccSourcePresentation(searchMeta?.sourceMode, !!retrievedAt);
  const activePreset = getFccPreset(presetId);
  const sortState = splitSort(sort);
  const headerSpec = (column: ColumnKey): HeaderSpec => {
    const option = COLUMN_OPTIONS.find((entry) => entry.key === column)!;
    if (column === "open") return { key: column, label: option.label, sortable: false, dir: null, open: true };
    if (column === "source") return { key: column, label: option.label, sortable: false, dir: null };
    return { key: column, label: option.label, sortable: true, dir: sortState.key === column ? sortState.dir : null, hint: "Sort by this column (every loaded record, on this device)" };
  };
  const sortByHeader = (spec: HeaderSpec) => {
    if (!spec.sortable || widthTools.justDragged()) return;
    const next = toggleSort(sortState, spec.key as SortColumn);
    const nextSort: SortKey = `${next.key}-${next.dir}`;
    setSort(nextSort);
    setPage(0);
    syncUrl(query, scopes, from, to, purpose, nextSort, pageSize, resultView, presetId);
  };
  const appliedChips: AppliedChip[] = [
    ...(activePreset ? [{ key: "preset", label: activePreset.label }] : []),
    ...(query ? [{ key: "query", label: `“${query}”` }] : []),
    ...scopes.map((scope) => ({ key: `scope:${scope}`, label: `Scope ${scope}` })),
    ...(purpose ? [{ key: "purpose", label: purpose }] : []),
    ...(from ? [{ key: "from", label: `Granted from ${from}` }] : []),
    ...(to ? [{ key: "to", label: `Granted to ${to}` }] : []),
  ];
  const removeChip = (chip: AppliedChip) => {
    if (chip.key === "purpose") { setPurpose(""); setPage(0); return; }
    if (chip.key === "from") { setFrom(""); setPage(0); return; }
    if (chip.key === "to") { setTo(""); setPage(0); return; }
    navigateWithParams((params) => {
      if (chip.key === "preset") { params.delete("preset"); if (activePreset?.granteeCodes.length && !params.get("ids")) params.delete("ids"); }
      if (chip.key === "query") params.delete("q");
      if (chip.key.startsWith("scope:")) {
        const remaining = scopes.filter((scope) => scope !== chip.key.slice(6));
        params.delete("preset");
        if (remaining.length) params.set("ids", remaining.join(",")); else params.delete("ids");
      }
    });
  };
  const limitedCoverage = !!searchMeta?.unresolvedScopes.length && !records.length;
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const selectedHistory = selected ? sortRecords(records.filter((record) => record.fccId === selected.fccId), DEFAULT_SORT) : [];
  const selectedEasParts = selected ? fccOfficialIdParts(selected.fccId) : {};
  const selectedGranteeGroup = selectedGrantee ? groupedRecords.find((group) => group.key === selectedGrantee) : undefined;
  const selectedRegistry = selectedGranteeGroup?.granteeCode ? grantees.find((grantee) => grantee.granteeCode === selectedGranteeGroup.granteeCode) : undefined;

  return (
    <main className="explorer-shell">
      <SourceNav
        source="fcc"
        view="explorer"
        status={sourcePresentation.status}
        statusState={retrievedAt ? (searchMeta?.sourceMode === "limited" ? "error" : "connected") : "ready"}
        title={<>Equipment authorizations. <em>Made searchable.</em></>}
        tagline="Search approved FCC IDs and authorization records."
      />


      <section className={`workspace ${filtersCollapsed ? "filters-collapsed" : ""}`} aria-label="FCC equipment authorization explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="filter-panel-inner">
          <div className="panel-heading">
            <div><h2>Filters</h2></div>
            <div className="panel-heading-actions">
              <button className="icon-button collapse-filter-panel" onClick={() => setFiltersCollapsed((value) => !value)} aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"}>{filtersCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            </div>
          </div>

          <div className="fcc-source-block"><Database size={15} /><div><b>Official FCC sources</b><span>EAS authorizations + FCC Open Data grantees</span></div></div>

          <div className="filter-group-heading"><span>Preset</span><small>Confirmed watch scope</small></div>
          <label className="field">
            <span>FCC watch scope</span>
            <select value={presetId} onChange={(event) => event.target.value ? applyPreset(event.target.value) : setPresetId("")}>
              <option value="">Custom scope</option>
              {FCC_PRESETS.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}
            </select>
            {getFccPreset(presetId) && <small className="field-hint">{getFccPreset(presetId)?.description}. {getFccPreset(presetId)?.sourceNote}</small>}
          </label>

          <div className="filter-group-heading"><span>Find</span><small>Complete or partial ID</small></div>
          <label className="field keyword-field">
            <span>FCC-ID search</span>
            <div className="input-shell"><Search size={16} /><input value={query} onChange={(event) => { setQuery(normalizeFccScope(event.target.value)); if (presetId) setScopes([]); setPresetId(""); }} placeholder="FCC ID or grantee-code prefix…" onKeyDown={(event) => event.key === "Enter" && runSearch()} /></div>
            <small className="field-hint">Starts at the beginning of the FCC ID. Minimum 3 characters.</small>
          </label>

          <div className="filter-group-heading narrow-heading"><span>FCC IDs</span><small>Optional additional scopes</small></div>
          <div className="field">
            <span>FCC IDs or prefixes</span>
            <div className="chip-input" onClick={() => scopeInput.current?.focus()}>
              {scopes.map((scope) => <span className="chip" key={scope}>{scope}<button type="button" onClick={(event) => { event.stopPropagation(); setScopes((current) => current.filter((item) => item !== scope)); setPresetId(""); }} aria-label={`Remove ${scope}`}><X size={11} /></button></span>)}
              <input ref={scopeInput} value={scopeDraft} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) commitScopes(value); else setScopeDraft(normalizeFccScope(value)); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitScopes(scopeDraft); } }} onBlur={() => scopeDraft && commitScopes(scopeDraft)} placeholder="Add ID or prefix…" />
            </div>
          </div>

          <div className="filter-group-heading narrow-heading"><span>Narrow</span><small>Applied to FCC results</small></div>
          <div className="two-col">
            <label className="field"><span>From grant date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field"><span>To grant date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <label className="field"><span>Authorization activity</span><select value={purpose} onChange={(event) => { setPurpose(event.target.value); setPage(0); }}><option value="">All FCC-reported purposes</option><option>Original authorization</option><option>Class II permissive change</option><option>Change in FCC ID</option><option>Other authorization activity</option></select></label>
          <small className="field-hint fcc-limit-note">Equipment description, class and RF come from official FCC grants and EAS search results for covered IDs.</small>

          <details className="fcc-import">
            <summary><Upload size={14} /> Import official FCC response</summary>
            <p>For an FCC scope this site does not keep current, open the official query, copy its XML or JSON, and paste it here. Imported records stay in this browser session.</p>
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste FCC XML or JSON…" aria-label="Official FCC XML or JSON response" />
            <button className="secondary" onClick={importOfficialResponse} disabled={!importText.trim()}><Upload size={14} /> Import records</button>
          </details>

          <div className="query-actions">
            <button className="primary" onClick={() => runSearch()} disabled={loading}><Search size={15} /> Search FCC</button>
            <button className="text-button" onClick={reset}>Reset</button>
          </div>
          <RecentSearches compact entries={recents.recent} onApply={(entry) => window.location.assign(`${window.location.pathname}?${entry.params}`)} onForget={recents.forget} onClear={recents.clear} />
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title"><div><h2>{resultView === "records" ? "Authorization records" : "Grantee profiles"}</h2>{retrievedAt && <small className="fetch-meta">{searchMeta?.dataAsOf ? `FCC data as of ${new Date(searchMeta.dataAsOf).toLocaleDateString()} · pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}`}</small>}</div></div>
            <div className="toolbar-actions">
              <a className="secondary" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer" title="Open the official FCC Equipment Authorization search">FCC Search <ExternalLink size={13} /></a>
              <div className="view-toggle"><button className={resultView === "records" ? "active" : ""} onClick={() => { setResultView("records"); setPage(0); syncUrl(query, scopes, from, to, purpose, sort, pageSize, "records", presetId); }}>Records</button><button className={resultView === "grantees" ? "active" : ""} onClick={() => { setResultView("grantees"); setPage(0); syncUrl(query, scopes, from, to, purpose, sort, pageSize, "grantees", presetId); }}>Grantees</button></div>
              {resultView === "records" && <label className="matrix-sort">Sort <select value={sort} onChange={(event) => { const next = event.target.value as SortKey; setSort(next); setPage(0); syncUrl(query, scopes, from, to, purpose, next, pageSize, resultView, presetId); }}>{SORT_PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{!SORT_PRESETS.some((option) => option.value === sort) && <option value={sort}>{`${COLUMN_OPTIONS.find((option) => option.key === sortState.key)?.label || sortState.key} ${sortState.dir === "asc" ? "↑" : "↓"}`}</option>}</select></label>}
              {resultView === "records" && <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={14} /> Columns <ChevronDown size={13} /></summary>
                <div className="column-menu"><div className="column-menu-head"><div><b>Visible columns</b><span>Choose FCC fields</span></div><span>{widthTools.fixedLayout && <button type="button" onClick={widthTools.resetWidths}>Reset widths</button>}<button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</button></span></div><div className="column-options">{COLUMN_OPTIONS.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => toggleColumn(option.key)} disabled={columns.length === 1 && columns.includes(option.key)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</div></div>
              </details>}
              <button className="icon-button" onClick={copyLink} aria-label="Copy shareable FCC URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
              <button className="icon-button" onClick={() => runSearch(true)} disabled={!effectiveScopes.length || loading} aria-label="Refresh FCC results" title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
              <button className="secondary export-button" onClick={() => { setExportOptions((current) => ({ ...current, filename: current.filename || defaultExportFilename("fcc-authorizations") })); setExportOpen(true); }} disabled={!filteredRecords.length || exporting}><ArrowDownToLine size={14} /> Excel</button>
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Filter size={17} /></button>
            </div>
          </div>

          <AppliedFilters chips={appliedChips} onRemove={removeChip} onClear={reset} />
          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>FCC search needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {coverageNote && <div className="coverage-banner"><Database size={17} /><div><b>Official source coverage</b><span>{coverageNote}</span>{searchMeta?.unresolvedScopes[0] && <a href={`${FCC_EAS_API}?fccId=${encodeURIComponent(searchMeta.unresolvedScopes[0])}`} target="_blank" rel="noreferrer">Open the official FCC response <ExternalLink size={12} /></a>}</div></div>}
          {loading && <div className="loading-layer"><div className="loading-note"><LoaderCircle className="spin" size={24} /> Contacting the FCC Equipment Authorization source…</div></div>}

          {!searched && !loading ? <div className="empty-state"><div className="empty-number">FCC</div><RadioTower size={34} /><h3>Start with an FCC ID.</h3><p>Search a complete FCC ID or the first three or more characters. Results come from the official FCC Equipment Authorization service.</p></div>
          : searched && !loading && !error && !filteredRecords.length ? <div className="empty-state"><div className="empty-number">0</div><Search size={34} /><h3>{limitedCoverage ? "This FCC scope is not kept current by this site." : "No approved FCC IDs matched."}</h3><p>{limitedCoverage ? "The live FCC source is unavailable from this app, so an empty result here does not mean the FCC ID is unapproved. Open the official response and import it below." : "Check the FCC ID, use a shorter prefix, or remove the date filters."}</p><div className="empty-actions">{!limitedCoverage && <button className="secondary" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>}<button className="secondary" onClick={() => runSearch(true)}>Retry</button></div></div>
          : resultView === "records" && filteredRecords.length > 0 && <>
            <div className="table-wrap" ref={tableScroll}><table className={`fcc-table${widthTools.fixedLayout ? " table-fixed" : ""}`} style={widthTools.tableStyle}>{widthTools.colGroup}<thead><tr>{columns.map((column) => <HeaderCell key={column} spec={headerSpec(column)} resizing={widthTools.resizing} onSort={sortByHeader} onResizeStart={widthTools.startResize} onResizeReset={widthTools.resetWidth} />)}</tr></thead><tbody>{visibleRecords.map((record, index) => <tr key={`${record.fccId}-${record.authorizationDate}-${record.applicationPurpose}-${index}`} tabIndex={0} onClick={() => setSelected(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(record); } }}>{columns.map((column) => <td key={column}>{renderCell(record, column)}</td>)}</tr>)}</tbody></table></div>
            <div className="pagination"><span>{filteredRecords.length.toLocaleString()} matching authorization record{filteredRecords.length === 1 ? "" : "s"} · page {page + 1} of {pageCount}{retrievedAt && <small className="fetch-meta">{searchMeta?.dataAsOf ? `FCC data as of ${new Date(searchMeta.dataAsOf).toLocaleDateString()} · pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}`}</small>}</span><label className="page-size">Rows <select value={pageSize} onChange={(event) => { const next = Number(event.target.value); setPageSize(next); setPage(0); syncUrl(query, scopes, from, to, purpose, sort, next, resultView, presetId); }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div><button className="icon-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Previous page">←</button><button className="icon-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} aria-label="Next page">→</button></div></div>
          </>}
          {resultView === "grantees" && groupedRecords.length > 0 && <div className="fcc-grantee-grid">{groupedRecords.map((group) => <button key={group.key} className="fcc-grantee-card" onClick={() => setSelectedGrantee(group.key)}><span className="grantee-code">{group.granteeCode || "FCC"}</span><h3>{group.granteeName || "Unidentified grantee"}</h3><p>{group.fccIds} FCC IDs · {group.records.length} authorization records</p><dl><div><dt>Most recent</dt><dd>{displayDate(group.latestAuthorization)}</dd></div><div><dt>Location</dt><dd>{fccLocation(group.records[0])}</dd></div></dl><span className="open-profile">Open grantee profile →</span></button>)}</div>}
        </section>
      </section>

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <aside className={`drawer${drawerWide ? " drawer-wide" : ""}`} aria-label="FCC Authorization Dossier">
          <DrawerTop label="FCC AUTHORIZATION DOSSIER" wide={drawerWide} onToggleWide={() => setDrawerWide((wide) => !wide)} onClose={() => setSelected(null)} />
          <div className="drawer-hero">
            <span className="record-id">FCC ID</span>
            <h2 className="fcc-drawer-id">{selected.fccId}</h2>
            <p><MapPin size={15} /> {fccLocation(selected)}</p>
            <div className="drawer-actions">
              <a className="secondary" href={fccPublicRecordUrl(selected.fccId)} target="_blank" rel="noreferrer">Open this FCC ID <ExternalLink size={14} /></a>
              <a className="secondary" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer">Official FCC ID Search <ExternalLink size={14} /></a>
              <button className="secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(selected.fccId); setIdCopied(true); setTimeout(() => setIdCopied(false), 1500); }}>{idCopied ? <Check size={14} /> : <Clipboard size={14} />} {idCopied ? "Copied" : "Copy FCC ID"}</button>
            </div>
          </div>
          <div className="detail-stats"><div><span>Authorization date</span><b>{displayDate(selected.authorizationDate)}</b></div><div><span>Activity category</span><b>{selected.purposeCategory || "—"}</b></div><div><span>History entries</span><b>{selectedHistory.length}</b></div></div>
          <section className="detail-section"><h3><RadioTower size={16} /> Identity</h3><dl className="fcc-detail-list"><div><dt>FCC ID <small>FCC source</small></dt><dd>{selected.fccId}</dd></div><div><dt>Grantee <small>FCC source</small></dt><dd>{selected.granteeName || "—"}</dd></div><div><dt>Grantee code <small>derived from confirmed FCC scope</small></dt><dd>{selected.granteeCode || "Not available from current FCC source"}</dd></div><div><dt>FCC equipment product-code component <small>derived</small></dt><dd>{selected.fccProductCode || "Not available from current FCC source"}</dd></div><div><dt>Equipment description <small>official FCC grant notes</small></dt><dd>{selected.equipmentDescription || "Not available for this FCC ID yet. Open the official FCC ID Search to read the grant notice. notes."}</dd></div></dl>{selected.granteeCode && <button className="secondary official-record-link" onClick={() => { setSelected(null); setSelectedGrantee(selected.granteeCode || selected.granteeName || null); }}><Users size={14} /> Open grantee profile</button>}</section>
          <section className="detail-section"><h3><CalendarDays size={16} /> Authorization</h3><dl className="fcc-detail-list"><div><dt>Grant date <small>FCC source</small></dt><dd>{displayDate(selected.authorizationDate)}</dd></div><div><dt>Normalized activity category <small>derived from FCC purpose</small></dt><dd>{selected.purposeCategory || "—"}</dd></div><div><dt>FCC-reported application purpose</dt><dd>{selected.applicationPurpose || "—"}</dd></div><div><dt>Equipment class <small>official FCC grant</small></dt><dd>{selected.equipmentClasses?.length ? selected.equipmentClasses.join("; ") : "Not available for this FCC ID yet. Open the official FCC ID Search to read the grant notice."}</dd></div><div><dt>RF characteristics <small>official EAS search / grant</small></dt><dd>{formatFccRfBands(selected.rfBands) || "Not returned by the FCC EAS list service for this FCC ID; open the official grant notice."}</dd></div></dl></section>
          {!!selected.exhibits?.length && <section className="detail-section"><h3><Database size={16} /> Submitted exhibits</h3><dl className="fcc-detail-list">{selected.exhibits.slice(0, 40).map((exhibit, index) => <div key={`${exhibit.name}-${index}`}><dt>{exhibit.exhibitType}<small>{[exhibit.submittedAt, exhibit.confidentiality].filter(Boolean).join(" · ")}</small></dt><dd>{exhibit.url ? <a className="ext-link exhibit-link" href={exhibit.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{exhibit.name} <ExternalLink size={11} /></a> : exhibit.name}{exhibit.availableAt ? ` · public ${exhibit.availableAt}` : ""}</dd></div>)}</dl></section>}
          <section className="detail-section"><h3><RefreshCw size={16} /> Authorization history</h3>{selectedHistory.map((record, index) => <div className="history-row" key={`${record.fccId}-${record.authorizationDate}-${index}`}><time>{displayDate(record.authorizationDate)}</time><div><b>{record.purposeCategory || "Authorization activity"}</b><span>FCC-reported purpose: {record.applicationPurpose || "—"}</span></div></div>)}</section>
          <section className="detail-section"><h3><Database size={16} /> Evidence / source</h3><dl className="fcc-detail-list"><div><dt>Regulatory source</dt><dd>{selected.sourceMode === "public_index" ? "fccid.io public index of FCC filings" : FCC_SOURCE_LABEL}</dd></div><div><dt>Source mode</dt><dd>{selected.sourceMode === "official_capture" ? "Official FCC EAS response, captured automatically twice a day" : selected.sourceMode === "official_snapshot" ? "Official FCC EAS response, bundled copy" : selected.sourceMode === "official_import" ? "Imported official EAS response" : selected.sourceMode === "public_index" ? "Live public FCC ID index" : "Live FCC response"}</dd></div>{selected.snapshotCapturedAt && <div><dt>FCC data as of</dt><dd>{new Date(selected.snapshotCapturedAt).toLocaleString([], dateTimeFormat)}</dd></div>}<div><dt>Loaded in app</dt><dd>{new Date(selected.retrievedAt).toLocaleString([], dateTimeFormat)}</dd></div>{selectedEasParts.granteeCode && <div><dt>Official EAS search fields</dt><dd>Grantee {selectedEasParts.granteeCode}{selectedEasParts.productCode ? ` · product ${selectedEasParts.productCode}` : ""}</dd></div>}</dl><a className="primary official-record-link" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer">Open official FCC ID Search <ExternalLink size={14} /></a><a className="secondary official-record-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">View raw API response <ExternalLink size={14} /></a></section>
          <section className="detail-section raw-section"><details><summary>View raw FCC response <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected.raw, null, 2)}</pre></details></section>
        </aside>
      </div>}

      {selectedGranteeGroup && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedGrantee(null)}>
        <aside className={`drawer${drawerWide ? " drawer-wide" : ""}`} aria-label="FCC Grantee Profile">
          <DrawerTop label="FCC GRANTEE PROFILE" wide={drawerWide} onToggleWide={() => setDrawerWide((wide) => !wide)} onClose={() => setSelectedGrantee(null)} closeLabel="Close grantee profile" />
          <div className="drawer-hero"><span className="record-id">FCC GRANTEE</span><h2>{selectedGranteeGroup.granteeName || selectedGranteeGroup.key}</h2><p><MapPin size={15} /> {selectedRegistry ? [selectedRegistry.city, selectedRegistry.state, selectedRegistry.country].filter(Boolean).join(", ") : fccLocation(selectedGranteeGroup.records[0])}</p></div>
          <div className="detail-stats"><div><span>FCC IDs</span><b>{selectedGranteeGroup.fccIds}</b></div><div><span>Authorizations</span><b>{selectedGranteeGroup.records.length}</b></div><div><span>Most recent</span><b>{displayDate(selectedGranteeGroup.latestAuthorization)}</b></div></div>
          <section className="detail-section"><h3><Users size={16} /> Overview</h3><dl className="fcc-detail-list"><div><dt>FCC-reported grantee</dt><dd>{selectedGranteeGroup.granteeName || "—"}</dd></div><div><dt>Confirmed grantee code</dt><dd>{selectedGranteeGroup.granteeCode || "—"}</dd></div><div><dt>Address</dt><dd>{selectedRegistry?.mailingAddress || selectedGranteeGroup.records[0]?.address || "—"}</dd></div>{selectedRegistry?.contactName && <div><dt>FCC registry contact</dt><dd>{selectedRegistry.contactName}</dd></div>}</dl></section>
          <section className="detail-section"><h3><RadioTower size={16} /> Equipment authorizations</h3><div className="profile-records">{selectedGranteeGroup.records.slice(0, 30).map((record, index) => <button key={`${record.fccId}-${record.authorizationDate}-${index}`} onClick={() => { setSelectedGrantee(null); setSelected(record); }}><b>{record.fccId}</b><span>{displayDate(record.authorizationDate)} · {record.purposeCategory || record.applicationPurpose || "Authorization"}</span></button>)}</div>{selectedGranteeGroup.records.length > 30 && <small>Showing 30 of {selectedGranteeGroup.records.length} authorization records.</small>}</section>
          <section className="detail-section"><h3><Database size={16} /> Source</h3><dl className="fcc-detail-list"><div><dt>Authorization source</dt><dd>{FCC_SOURCE_LABEL}</dd></div><div><dt>Grantee registry</dt><dd>{selectedRegistry ? "FCC Open Data EAS Grantee Registrations" : "Not present in the FCC Open Data grantee registry; identity confirmed by the EAS response"}</dd></div></dl>{selectedRegistry && <a className="primary official-record-link" href={selectedRegistry.sourceUrl} target="_blank" rel="noreferrer">Open FCC grantee dataset <ExternalLink size={14} /></a>}</section>
        </aside>
      </div>}

      <ExportDialog
        open={exportOpen}
        title="Pack this workbook."
        countLabel={exportOptions.unique ? "Latest grant per FCC ID." : "Each authorization event is a row."}
        note={["exhibitCount", "exhibitTypes", "exhibitNames", "firstExhibit", "confidential"].some((id) => exportOptions.groups.includes(id)) ? "Exhibit lookups run for up to 40 FCC IDs." : undefined}
        toggles={FCC_EXPORT_TOGGLES}
        selected={exportOptions.groups}
        confirming={exporting}
        filename={exportOptions.filename}
        scope={exportOptions.scope}
        unique={exportOptions.unique}
        uniqueLabel="One row per FCC ID, using the newest grant date"
        clickableLinks={exportOptions.clickableLinks}
        pageCount={visibleRecords.length}
        allCount={filteredRecords.length}
        filters={[query, ...scopes, from && `From ${from}`, to && `To ${to}`, purpose].filter(Boolean) as string[]}
        onFilename={(filename) => setExportOptions((current) => ({ ...current, filename }))}
        onScope={(scope) => setExportOptions((current) => ({ ...current, scope }))}
        onUnique={(unique) => setExportOptions((current) => ({ ...current, unique }))}
        onClickableLinks={(clickableLinks) => setExportOptions((current) => ({ ...current, clickableLinks }))}
        onChange={(groups) => setExportOptions((current) => ({ ...current, groups }))}
        onUseVisible={() => setExportOptions((current) => ({
          ...current,
          groups: ["fccId", ...columns.flatMap((column) => FCC_VISIBLE_TO_EXPORT[column] || [])],
        }))}
        onCancel={() => !exporting && setExportOpen(false)}
        onConfirm={() => void exportWorkbook()}
      />
    </main>
  );
}
