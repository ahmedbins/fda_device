"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Columns3,
  Database,
  ExternalLink,
  Filter,
  Landmark,
  Link2,
  LoaderCircle,
  MapPin,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { AppliedFilters, HeaderCell, RecentSearches, compareValues, navigateWithParams, toggleSort, recentSearchParams, useColumnWidths, useRecentSearches, type AppliedChip, type HeaderSpec, type SortDir } from "./explorer-tools";
import { DEFAULT_MDALL_PRESET, MDALL_PRESETS, getMdallPreset } from "./mdall-config";
import {
  MDALL_DOCS_URL,
  MDALL_SOURCE_LABEL,
  groupMdallLicencesByCompany,
  mdallLocation,
  mdallSearchUrl,
  mdallSourcePresentation,
  parseMdallQuery,
  type MdallLicence,
  type MdallLicenceState,
  type MdallSearchMode,
  type MdallSearchResult,
} from "./mdall-core";
import {
  clearMdallCache,
  fetchMdallDevicesForLicence,
  fetchMdallDevicesForLicences,
  mdallDeviceLookupKey,
  searchMdall,
  type MdallDeviceLookupOutcome,
} from "./mdall-service";
import { downloadExcel, type ExcelColumn, type ExcelValue } from "./excel-export";
import { ExportDialog, asExportLink, defaultExportFilename, loadExportSettings, sanitizeExportFilename, saveExportSettings } from "./export-dialog";

type ColumnKey = "licenceNo" | "licenceName" | "company" | "deviceCount" | "class" | "type" | "status" | "issued" | "endDate" | "open";
type SortColumn = Exclude<ColumnKey, "open">;
type SortKey = `${SortColumn}-${SortDir}`;
const SORT_COLUMNS: SortColumn[] = ["licenceNo", "licenceName", "company", "deviceCount", "class", "type", "status", "issued", "endDate"];
const NUMERIC_SORT_COLUMNS: SortColumn[] = ["licenceNo", "deviceCount", "class"];
const DEFAULT_SORT: SortKey = "issued-desc";
const SORT_PRESETS: { value: SortKey; label: string }[] = [
  { value: "issued-desc", label: "Newest issued" },
  { value: "issued-asc", label: "Oldest issued" },
  { value: "licenceNo-asc", label: "Licence number" },
  { value: "licenceName-asc", label: "Licence name" },
  { value: "company-asc", label: "Company" },
];
const LEGACY_SORTS: Record<string, SortKey> = { "date-desc": "issued-desc", "date-asc": "issued-asc", licence: "licenceNo-asc", company: "company-asc", name: "licenceName-asc" };

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

function sortValue(licence: MdallLicence, key: SortColumn): string | number | undefined {
  if (key === "licenceNo") return licence.licenceNumber;
  if (key === "licenceName") return licence.licenceName;
  if (key === "company") return licence.companyName || licence.company?.companyName;
  if (key === "deviceCount") return licence.deviceDataStatus === "complete" ? licence.devices?.length ?? 0 : undefined;
  if (key === "class") return licence.riskClass;
  if (key === "type") return licence.licenceType;
  if (key === "status") return licence.licenceStatusLabel;
  if (key === "issued") return licence.issuedAt;
  return licence.endDate;
}
type ResultView = "licences" | "companies";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "licenceNo", label: "Licence no.", hint: "Health Canada licence number" },
  { key: "licenceName", label: "Licence name", hint: "MDALL licence name" },
  { key: "company", label: "Company", hint: "MDALL company name" },
  { key: "deviceCount", label: "Devices", hint: "Active devices linked by original licence number" },
  { key: "class", label: "Risk class", hint: "Health Canada application risk class" },
  { key: "type", label: "Licence type", hint: "Single device, family, system, or group" },
  { key: "status", label: "Status", hint: "MDALL licence status" },
  { key: "issued", label: "First issued", hint: "Date the licence was first issued" },
  { key: "endDate", label: "End date", hint: "Cancellation or removal date, if any" },
  { key: "open", label: "Open record", hint: "Official Health Canada MDALL search" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["licenceNo", "licenceName", "company", "deviceCount", "class", "status", "issued", "open"];
const PAGE_SIZES = [10, 25, 50, 100];
const MDALL_EXPORT_TOGGLES = [
  { id: "licenceNumber", label: "Licence number", required: true },
  { id: "licenceName", label: "Licence name" },
  { id: "licenceType", label: "Licence type" },
  { id: "issued", label: "First issued" },
  { id: "endDate", label: "End date" },
  { id: "status", label: "Status" },
  { id: "statusCode", label: "Status code" },
  { id: "riskClass", label: "Risk class" },
  { id: "companyId", label: "Company ID" },
  { id: "company", label: "Company" },
  { id: "location", label: "Company location" },
  { id: "deviceCount", label: "Device count" },
  { id: "deviceDataStatus", label: "Device data status" },
  { id: "tradeNames", label: "Trade names" },
  { id: "identifiers", label: "Device identifiers" },
  { id: "mdallLink", label: "MDALL search link" },
  { id: "source", label: "Source" },
  { id: "refresh", label: "MDALL last refresh" },
  { id: "retrievedAt", label: "Retrieved at" },
];
const DEFAULT_MDALL_EXPORT = ["licenceNumber", "licenceName", "status", "riskClass", "company", "location", "deviceCount", "deviceDataStatus", "tradeNames", "identifiers", "mdallLink"];
const MDALL_VISIBLE_TO_EXPORT: Partial<Record<ColumnKey, string[]>> = {
  licenceNo: ["licenceNumber"],
  licenceName: ["licenceName"],
  company: ["company", "companyId"],
  deviceCount: ["deviceCount", "deviceDataStatus"],
  class: ["riskClass"],
  type: ["licenceType"],
  status: ["status"],
  issued: ["issued"],
  endDate: ["endDate"],
  open: ["mdallLink"],
};

function initialState() {
  const preset = getMdallPreset(DEFAULT_MDALL_PRESET);
  const fallback = { query: "", mode: "auto" as MdallSearchMode, state: "active" as MdallLicenceState, riskClass: "", licenceType: "", from: "", to: "", sort: DEFAULT_SORT, pageSize: 25, resultView: "licences" as ResultView, presetId: preset?.id || "", companyIds: preset?.companyIds || [] as number[], autorun: !!preset };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const query = parseMdallQuery(params.get("q") || "");
  const requestedPreset = getMdallPreset(params.get("preset"));
  const useDefaultPreset = !query && !params.has("preset") && !params.has("company");
  const activePreset = requestedPreset || (useDefaultPreset ? preset : undefined);
  const companyIds = params.get("company") ? params.get("company")!.split(",").map(Number).filter((id) => Number.isFinite(id)) : activePreset?.companyIds || [];
  const mode = (["auto", "company", "licence", "licenceNumber", "device", "identifier"] as MdallSearchMode[]).includes(params.get("mode") as MdallSearchMode) ? params.get("mode") as MdallSearchMode : "auto";
  const state = (["active", "archived", "both"] as MdallLicenceState[]).includes(params.get("state") as MdallLicenceState) ? params.get("state") as MdallLicenceState : "active";
  const sort = parseSortKey(params.get("sort"));
  const requestedSize = Number(params.get("rows"));
  return {
    query,
    mode,
    state,
    riskClass: params.get("class") || "",
    licenceType: params.get("type") || "",
    from: params.get("from") || "",
    to: params.get("to") || "",
    sort,
    pageSize: PAGE_SIZES.includes(requestedSize) ? requestedSize : 25,
    resultView: params.get("view") === "companies" ? "companies" as ResultView : "licences" as ResultView,
    presetId: activePreset?.id || "",
    companyIds,
    autorun: !!(query || companyIds.length),
  };
}

function syncUrl(query: string, mode: MdallSearchMode, state: MdallLicenceState, riskClass: string, licenceType: string, from: string, to: string, sort: SortKey, pageSize: number, resultView: ResultView, presetId = "", companyIds: number[] = []) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (mode !== "auto") params.set("mode", mode);
  if (state !== "active") params.set("state", state);
  if (riskClass) params.set("class", riskClass);
  if (licenceType) params.set("type", licenceType);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  if (pageSize !== 25) params.set("rows", String(pageSize));
  if (resultView !== "licences") params.set("view", resultView);
  if (presetId) params.set("preset", presetId);
  if (companyIds.length && !presetId) params.set("company", companyIds.join(","));
  const value = params.toString();
  window.history.replaceState(null, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

function sortLicences(licences: MdallLicence[], sort: SortKey) {
  const { key, dir } = splitSort(sort);
  return [...licences].sort((a, b) => compareValues(sortValue(a, key), sortValue(b, key), dir) || a.licenceName.localeCompare(b.licenceName) || a.licenceNumber - b.licenceNumber);
}

/** Short label for a search, used by the recent-searches list. */
function describeSearch(query: string, mode: MdallSearchMode, state: MdallLicenceState, riskClass: string, licenceType: string, presetLabel?: string) {
  return [presetLabel || (query ? `“${query}”` : ""), mode !== "auto" ? mode : "", state !== "active" ? state : "", riskClass ? `Class ${riskClass}` : "", licenceType].filter(Boolean).join(" · ") || "MDALL search";
}


function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function MdallExplorerPage() {
  const [initial] = useState(initialState);
  const [query, setQuery] = useState(initial.query);
  const [mode, setMode] = useState<MdallSearchMode>(initial.mode);
  const [state, setState] = useState<MdallLicenceState>(initial.state);
  const [riskClass, setRiskClass] = useState(initial.riskClass);
  const [licenceType, setLicenceType] = useState(initial.licenceType);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [resultView, setResultView] = useState<ResultView>(initial.resultView);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [companyIds, setCompanyIds] = useState<number[]>(initial.companyIds);
  const [page, setPage] = useState(0);
  const [licences, setLicences] = useState<MdallLicence[]>([]);
  const [searchMeta, setSearchMeta] = useState<MdallSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState(() => loadExportSettings("mdall-excel-export", {
    groups: DEFAULT_MDALL_EXPORT,
    scope: "all",
    unique: false,
    clickableLinks: true,
    filename: "",
  }));
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<MdallLicence | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  // The pane is a normal column above 720px; this only opens the off-canvas drawer on phones.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const parsed = (JSON.parse(localStorage.getItem("mdall-explorer-columns") || "[]") as ColumnKey[]).filter((key) => COLUMN_OPTIONS.some((option) => option.key === key));
      return parsed.length ? parsed : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const request = useRef<AbortController | null>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const widthTools = useColumnWidths("hc-col-widths-licences", columns);
  const recents = useRecentSearches("hc-recent-searches");
  const rememberRecent = recents.remember;

  const filteredLicences = useMemo(() => sortLicences(licences.filter((licence) => {
    if (riskClass && String(licence.riskClass || "") !== riskClass) return false;
    if (licenceType && licence.licenceType !== licenceType) return false;
    if (from && (!licence.issuedAt || licence.issuedAt < from)) return false;
    if (to && (!licence.issuedAt || licence.issuedAt > to)) return false;
    return true;
  }), sort), [from, licenceType, licences, riskClass, sort, to]);
  const groupedCompanies = useMemo(() => groupMdallLicencesByCompany(filteredLicences), [filteredLicences]);
  const pageCount = Math.max(1, Math.ceil(filteredLicences.length / pageSize));
  const visibleLicences = filteredLicences.slice(page * pageSize, page * pageSize + pageSize);
  const activeFilters = Number(!!query) + Number(companyIds.length > 0) + Number(state !== "active") + Number(!!riskClass) + Number(!!licenceType) + Number(!!from) + Number(!!to);
  const officialSearch = mdallSearchUrl(state === "archived" ? "archived" : "active");
  const deviceCountTargets = columns.includes("deviceCount")
    ? licences.filter((licence) => !licence.deviceDataStatus).map((licence) => licence.licenceNumber).join(",")
    : "";

  const runSearch = useCallback(async (force = false) => {
    if (!query.trim() && !companyIds.length) {
      setError("Enter a company, licence name, licence number, device name, or device identifier.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setSelected(null);
    setSelectedCompany(null);
    setPage(0);
    setSearched(true);
    if (force) clearMdallCache();
    syncUrl(query, mode, state, riskClass, licenceType, from, to, sort, pageSize, resultView, presetId, companyIds);
    try {
      const next = await searchMdall({ query, mode, state, companyIds: query.trim() ? undefined : companyIds, signal: controller.signal });
      if (controller.signal.aborted) return;
      setLicences(next.licences);
      setSearchMeta(next);
      setRetrievedAt(new Date(next.retrievedAt));
      rememberRecent(recentSearchParams(window.location.search), describeSearch(query, mode, state, riskClass, licenceType, getMdallPreset(presetId)?.label));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setLicences([]);
      setError(caught instanceof Error ? caught.message : "The Health Canada MDALL source could not be reached.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [companyIds, from, licenceType, mode, pageSize, presetId, query, rememberRecent, resultView, riskClass, sort, state, to]);

  useEffect(() => {
    if (initial.autorun) queueMicrotask(() => runSearch());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("mdall-explorer-columns", JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    if (!deviceCountTargets) return;
    let cancelled = false;
    const targets = licences.filter((licence) => !licence.deviceDataStatus);
    fetchMdallDevicesForLicences(targets, { includeIdentifiers: false }).then((outcomes) => {
      if (cancelled) return;
      setLicences((current) => current.map((licence) => {
        const outcome = outcomes.get(mdallDeviceLookupKey(licence));
        if (!outcome) return licence;
        return outcome.status === "complete"
          ? { ...licence, devices: outcome.devices, deviceDataStatus: "complete", identifierDataComplete: false }
          : { ...licence, deviceDataStatus: "error", deviceDataError: outcome.error };
      }));
    });
    return () => { cancelled = true; };
  }, [deviceCountTargets, licences]);

  useEffect(() => {
    const identifierDataAttempted = selected?.devices?.every((device) => device.identifierDataComplete !== undefined) ?? false;
    if (!selected || selected.deviceDataStatus === "error" || (selected.deviceDataStatus === "complete" && (selected.identifierDataComplete || identifierDataAttempted))) return;
    let cancelled = false;
    fetchMdallDevicesForLicence(selected).then((result) => {
      if (!cancelled) setSelected((current) => current && current.licenceNumber === selected.licenceNumber ? {
        ...current,
        devices: result.devices,
        deviceDataStatus: "complete",
        deviceDataError: undefined,
        identifierDataComplete: result.identifiersComplete,
      } : current);
    }).catch((caught) => {
      if (!cancelled) setSelected((current) => current && current.licenceNumber === selected.licenceNumber ? {
        ...current,
        devices: undefined,
        deviceDataStatus: "error",
        deviceDataError: caught instanceof Error ? caught.message : "Device data was not retrieved.",
      } : current);
    });
    return () => { cancelled = true; };
  }, [selected]);

  const reset = () => {
    request.current?.abort();
    setQuery(""); setMode("auto"); setState("active"); setRiskClass(""); setLicenceType(""); setFrom(""); setTo(""); setPresetId(""); setCompanyIds([]);
    setLicences([]); setSearchMeta(null); setError(""); setSearched(false); setRetrievedAt(null); setPage(0);
    syncUrl("", "auto", "active", "", "", "", "", sort, pageSize, resultView);
  };

  const applyPreset = (id: string) => {
    const preset = getMdallPreset(id);
    if (!preset) return;
    window.location.assign(`${window.location.pathname}?preset=${encodeURIComponent(preset.id)}`);
  };

  const exportWorkbook = async () => {
    const include = new Set(exportOptions.groups.includes("licenceNumber") ? exportOptions.groups : ["licenceNumber", ...exportOptions.groups]);
    const filename = sanitizeExportFilename(exportOptions.filename, defaultExportFilename("mdall-licences"));
    saveExportSettings("mdall-excel-export", { ...exportOptions, groups: [...include], filename });
    setExporting(true);
    setExportProgress("");
    try {
      const sourceRows = exportOptions.scope === "page" ? visibleLicences : filteredLicences;
      const wantDevices = ["deviceCount", "deviceDataStatus", "tradeNames", "identifiers"].some((id) => include.has(id));
      if (wantDevices) include.add("deviceDataStatus");
      let devicesByLicence = new Map<string, MdallDeviceLookupOutcome>();
      if (wantDevices) {
        devicesByLicence = await fetchMdallDevicesForLicences(sourceRows, {
          includeIdentifiers: include.has("identifiers"),
          concurrency: 6,
          onProgress: (completed, total) => setExportProgress(`Loading device data ${completed.toLocaleString()} of ${total.toLocaleString()}…`),
        });
      }
      const outcomeFor = (licence: MdallLicence) => devicesByLicence.get(mdallDeviceLookupKey(licence));
      const devicesFor = (licence: MdallLicence) => {
        const outcome = outcomeFor(licence);
        return outcome?.status === "complete" ? outcome.devices : undefined;
      };
      const unavailable = (licence: MdallLicence) => outcomeFor(licence)?.status === "error" ? "Not retrieved" : "";
      const link = (text: string, url: string) => asExportLink(text, url, exportOptions.clickableLinks);
      const fields: { id: string; column: ExcelColumn; value: (licence: MdallLicence) => ExcelValue }[] = [
        { id: "licenceNumber", column: { header: "Licence number", type: "number", width: 16 }, value: (licence) => licence.licenceNumber },
        { id: "licenceName", column: { header: "Licence name", width: 36 }, value: (licence) => licence.licenceName },
        { id: "licenceType", column: { header: "Licence type", width: 18 }, value: (licence) => licence.licenceType || "" },
        { id: "issued", column: { header: "First issued", type: "date", width: 14 }, value: (licence) => licence.issuedAt || "" },
        { id: "endDate", column: { header: "End date", type: "date", width: 14 }, value: (licence) => licence.endDate || "" },
        { id: "status", column: { header: "Status", width: 22 }, value: (licence) => licence.licenceStatusLabel },
        { id: "statusCode", column: { header: "Status code", width: 12 }, value: (licence) => licence.licenceStatus },
        { id: "riskClass", column: { header: "Risk class", width: 12 }, value: (licence) => licence.riskClassLabel },
        { id: "companyId", column: { header: "Company ID", type: "number", width: 14 }, value: (licence) => licence.companyId || "" },
        { id: "company", column: { header: "Company", width: 28 }, value: (licence) => licence.companyName || "" },
        { id: "location", column: { header: "Company location", width: 22 }, value: (licence) => mdallLocation(licence.company) === "—" ? "" : mdallLocation(licence.company) },
        { id: "deviceCount", column: { header: "Device count", width: 14 }, value: (licence) => devicesFor(licence)?.length ?? unavailable(licence) },
        { id: "deviceDataStatus", column: { header: "Device data status", width: 30 }, value: (licence) => {
          const outcome = outcomeFor(licence);
          if (!outcome) return "Not requested";
          if (outcome.status === "error") return `Not retrieved: ${outcome.error}`;
          return outcome.identifiersComplete || !include.has("identifiers") ? "Complete" : `Devices complete; ${outcome.identifierErrors.length} identifier lookup(s) failed`;
        } },
        { id: "tradeNames", column: { header: "Trade names", width: 40 }, value: (licence) => devicesFor(licence) ? [...new Set(devicesFor(licence)!.map((device) => device.tradeName))].join("; ") : unavailable(licence) },
        { id: "identifiers", column: { header: "Device identifiers", width: 44 }, value: (licence) => devicesFor(licence) ? devicesFor(licence)!.flatMap((device) => (device.identifiers || []).map((identifier) => `${identifier} (device ${device.deviceId})`)).join("; ") : unavailable(licence) },
        { id: "mdallLink", column: { header: "MDALL search", type: exportOptions.clickableLinks ? "link" : "text", width: 20 }, value: () => link("Open MDALL", officialSearch) },
        { id: "source", column: { header: "Source", width: 22 }, value: () => "Health Canada MDALL" },
        { id: "refresh", column: { header: "MDALL last refresh", type: "date", width: 16 }, value: (licence) => licence.lastRefreshAt || "" },
        { id: "retrievedAt", column: { header: "Retrieved at", width: 22 }, value: (licence) => licence.retrievedAt },
      ];
      const selectedFields = fields.filter((field) => include.has(field.id));
      downloadExcel({
        filename,
        sheetName: "MDALL licences",
        columns: selectedFields.map((field) => field.column),
        rows: sourceRows.map((licence) => selectedFields.map((field) => field.value(licence))),
      });
      setExportOpen(false);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  const renderCell = (licence: MdallLicence, column: ColumnKey) => {
    if (column === "licenceNo") return <b className="fcc-id">{licence.licenceNumber}</b>;
    if (column === "licenceName") return <><b>{licence.licenceName}</b><span>{licence.licenceType || "MDALL licence"}</span></>;
    if (column === "company") return <span className="name-cell"><span><b>{licence.companyName || "—"}</b><span>{licence.companyId ? `Company ID ${licence.companyId}` : "Company"}</span></span>{licence.companyName && <button type="button" className="icon-button row-filter" onClick={(event) => { event.stopPropagation(); navigateWithParams((params) => { params.set("q", licence.companyName!); params.set("mode", "company"); params.delete("preset"); params.delete("company"); }); }} aria-label={`Only show licences held by ${licence.companyName}`} title="Only this company"><Filter size={11} /></button>}</span>;
    if (column === "deviceCount") {
      if (licence.deviceDataStatus === "error") return <span className="cell-list" title={licence.deviceDataError}>Not retrieved</span>;
      if (licence.deviceDataStatus !== "complete") return <span className="cell-list">Loading…</span>;
      return <span className="source-cell">{licence.devices?.length ?? 0}</span>;
    }
    if (column === "class") return <button type="button" className={`source-cell clickable${riskClass && String(licence.riskClass || "") === riskClass ? " hit" : ""}`} onClick={(event) => { event.stopPropagation(); setRiskClass((current) => current === String(licence.riskClass || "") ? "" : String(licence.riskClass || "")); setPage(0); }} title={riskClass ? "Toggle this risk-class filter" : "Only show this risk class"}>{licence.riskClassLabel}</button>;
    if (column === "type") return licence.licenceType ? <button type="button" className="cell-list clickable" onClick={(event) => { event.stopPropagation(); setLicenceType((current) => current === licence.licenceType ? "" : licence.licenceType || ""); setPage(0); }} title="Only show this licence type">{licence.licenceType}</button> : <span className="cell-list">—</span>;
    if (column === "status") return <span className="cell-list">{licence.licenceStatusLabel}</span>;
    if (column === "issued") return <span className="date-cell">{displayDate(licence.issuedAt)}</span>;
    if (column === "endDate") return <span className="date-cell">{displayDate(licence.endDate)}</span>;
    return <a className="open-record-button" href={officialSearch} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open MDALL <ExternalLink size={11} /></a>;
  };

  const sourcePresentation = mdallSourcePresentation(!!retrievedAt);
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const selectedCompanyGroup = selectedCompany ? groupedCompanies.find((group) => group.key === selectedCompany) : undefined;
  const activePreset = getMdallPreset(presetId);
  const sortState = splitSort(sort);
  const headerSpec = (column: ColumnKey): HeaderSpec => {
    const option = COLUMN_OPTIONS.find((entry) => entry.key === column)!;
    if (column === "open") return { key: column, label: option.label, sortable: false, dir: null, open: true };
    return { key: column, label: option.label, numeric: (NUMERIC_SORT_COLUMNS as string[]).includes(column), sortable: true, dir: sortState.key === column ? sortState.dir : null, hint: "Sort by this column (every loaded licence, on this device)" };
  };
  const sortByHeader = (spec: HeaderSpec) => {
    if (!spec.sortable || widthTools.justDragged()) return;
    const next = toggleSort(sortState, spec.key as SortColumn, NUMERIC_SORT_COLUMNS);
    setSort(`${next.key}-${next.dir}`);
    setPage(0);
  };
  const appliedChips: AppliedChip[] = [
    ...(activePreset ? [{ key: "preset", label: activePreset.label }] : []),
    ...(query ? [{ key: "query", label: `“${query}”` }] : []),
    ...(mode !== "auto" ? [{ key: "mode", label: `Field: ${mode}` }] : []),
    ...(state !== "active" ? [{ key: "state", label: state === "both" ? "Active and archived" : "Archived licences" }] : []),
    ...(riskClass ? [{ key: "class", label: `Class ${riskClass}` }] : []),
    ...(licenceType ? [{ key: "type", label: licenceType }] : []),
    ...(from ? [{ key: "from", label: `Issued from ${from}` }] : []),
    ...(to ? [{ key: "to", label: `Issued to ${to}` }] : []),
  ];
  const removeChip = (chip: AppliedChip) => {
    if (chip.key === "class") { setRiskClass(""); setPage(0); return; }
    if (chip.key === "type") { setLicenceType(""); setPage(0); return; }
    if (chip.key === "from") { setFrom(""); setPage(0); return; }
    if (chip.key === "to") { setTo(""); setPage(0); return; }
    navigateWithParams((params) => {
      if (chip.key === "preset") { params.delete("preset"); params.delete("company"); }
      if (chip.key === "query") params.delete("q");
      if (chip.key === "mode") params.delete("mode");
      if (chip.key === "state") params.delete("state");
    });
  };

  return (
    <main>
      <SourceNav source="hc" view="explorer" status={sourcePresentation.status} statusState={retrievedAt ? "connected" : "ready"} />

      <section className="hero hero-compact" id="top">
        <div className="eyebrow"><span>01</span> HEALTH CANADA / MDALL</div>
        <div className="hero-grid">
          <div>
            <h1>Canadian device licences. <em>Made searchable.</em></h1>
            <div className="hero-inline">
              <p>Search Class II, III and IV medical device licences from Health Canada’s Medical Devices Active Licence Listing.</p>
              <a className="primary" href={officialSearch} target="_blank" rel="noreferrer">Open MDALL Search <ExternalLink size={14} /></a>
            </div>
          </div>
          <div className="dataset-note">
            <Landmark size={20} />
            <div>
              <b>Health Canada MDALL</b>
              <span>{retrievedAt ? sourcePresentation.note : "Ready for licence search"}</span>
              <span>{searchMeta?.lastRefreshAt ? `MDALL last refreshed ${displayDate(searchMeta.lastRefreshAt)}` : retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${MDALL_SOURCE_LABEL}`}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`workspace ${filtersCollapsed ? "filters-collapsed" : ""}`} aria-label="Health Canada MDALL explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="filter-panel-inner">
          <div className="panel-heading">
            <div><span>02</span><h2>Filters</h2></div>
            <div className="panel-heading-actions">
              <button className="icon-button collapse-filter-panel" onClick={() => setFiltersCollapsed((value) => !value)} aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"}>{filtersCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            </div>
          </div>

          <div className="fcc-source-block"><Database size={15} /><div><b>Official Health Canada source</b><span>MDALL JSON API · Class II–IV licences</span></div></div>

          <div className="filter-group-heading"><span>Preset</span><small>Confirmed watch scope</small></div>
          <label className="field">
            <span>Health Canada watch scope</span>
            <select value={presetId} onChange={(event) => event.target.value ? applyPreset(event.target.value) : setPresetId("")}>
              <option value="">Custom scope</option>
              {MDALL_PRESETS.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}
            </select>
            {getMdallPreset(presetId) && <small className="field-hint">{getMdallPreset(presetId)?.description}. {getMdallPreset(presetId)?.sourceNote}</small>}
          </label>

          <div className="filter-group-heading"><span>Find</span><small>Company, licence or device</small></div>
          <label className="field keyword-field">
            <span>MDALL search</span>
            <div className="input-shell"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (presetId) setCompanyIds([]); setPresetId(""); }} placeholder="Company, licence, device or identifier…" onKeyDown={(event) => event.key === "Enter" && runSearch()} /></div>
            <small className="field-hint">Uses the official Health Canada MDALL API. Class I devices are not in MDALL.</small>
          </label>
          <label className="field">
            <span>Search field</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as MdallSearchMode)}>
              <option value="auto">Auto — company, licence and device</option>
              <option value="company">Company name or ID</option>
              <option value="licence">Licence name</option>
              <option value="licenceNumber">Licence number</option>
              <option value="device">Device / trade name</option>
              <option value="identifier">Device identifier</option>
            </select>
          </label>

          <div className="filter-group-heading narrow-heading"><span>Narrow</span><small>Applied to MDALL results</small></div>
          <label className="field"><span>Licence state</span><select value={state} onChange={(event) => setState(event.target.value as MdallLicenceState)}><option value="active">Active licences</option><option value="archived">Archived licences</option><option value="both">Active and archived</option></select></label>
          <label className="field"><span>Risk class</span><select value={riskClass} onChange={(event) => { setRiskClass(event.target.value); setPage(0); }}><option value="">All classes</option><option value="2">Class II</option><option value="3">Class III</option><option value="4">Class IV</option></select></label>
          <label className="field"><span>Licence type</span><select value={licenceType} onChange={(event) => { setLicenceType(event.target.value); setPage(0); }}><option value="">All types</option><option>Single Device</option><option>Device Family</option><option>System</option><option>Test Kit</option><option>Device Group</option><option>Device Group Family</option></select></label>
          <div className="two-col">
            <label className="field"><span>Issued from</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field"><span>Issued to</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <small className="field-hint fcc-limit-note">MDALL does not include Class I devices, investigational testing, or special-access authorizations. The official HTML search is POST-only, so this app uses the documented JSON API.</small>

          <div className="query-actions">
            <button className="primary" onClick={() => runSearch()} disabled={loading}><Search size={15} /> Search MDALL</button>
            <button className="text-button" onClick={reset}>Reset</button>
          </div>
          <RecentSearches compact entries={recents.recent} onApply={(entry) => window.location.assign(`${window.location.pathname}?${entry.params}`)} onForget={recents.forget} onClear={recents.clear} />
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title"><span>03</span><div><h2>{resultView === "licences" ? "MDALL licences" : "Companies"}</h2>{retrievedAt && <small className="fetch-meta">{searchMeta?.lastRefreshAt ? `MDALL refresh ${displayDate(searchMeta.lastRefreshAt)}` : `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}`}</small>}</div></div>
            <div className="toolbar-actions">
              {activeFilters > 0 && <span className="filter-count"><Filter size={12} /> {activeFilters} active</span>}
              <div className="view-toggle"><button className={resultView === "licences" ? "active" : ""} onClick={() => { setResultView("licences"); setPage(0); }}>Licences</button><button className={resultView === "companies" ? "active" : ""} onClick={() => { setResultView("companies"); setPage(0); }}>Companies</button></div>
              {resultView === "licences" && <label className="matrix-sort">Sort <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(0); }}>{SORT_PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{!SORT_PRESETS.some((option) => option.value === sort) && <option value={sort}>{`${COLUMN_OPTIONS.find((option) => option.key === sortState.key)?.label || sortState.key} ${sortState.dir === "asc" ? "↑" : "↓"}`}</option>}</select></label>}
              {resultView === "licences" && <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={14} /> Columns <ChevronDown size={13} /></summary>
                <div className="column-menu"><div className="column-menu-head"><div><b>Visible columns</b><span>Choose MDALL fields</span></div><span>{widthTools.fixedLayout && <button type="button" onClick={widthTools.resetWidths}>Reset widths</button>}<button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</button></span></div><div className="column-options">{COLUMN_OPTIONS.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => setColumns((current) => current.includes(option.key) ? current.length > 1 ? current.filter((item) => item !== option.key) : current : [...current, option.key])} disabled={columns.length === 1 && columns.includes(option.key)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</div></div>
              </details>}
              {resultView === "licences" && <label className="page-size">Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
              <button className="icon-button" onClick={async () => { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }} aria-label="Copy shareable MDALL URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
              <button className="icon-button" onClick={() => runSearch(true)} disabled={loading} aria-label="Refresh MDALL results" title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
              <button className="secondary export-button" onClick={() => { setExportOptions((current) => ({ ...current, filename: current.filename || defaultExportFilename("mdall-licences") })); setExportOpen(true); }} disabled={!filteredLicences.length || exporting}><ArrowDownToLine size={14} /> Excel</button>
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Filter size={17} /></button>
            </div>
          </div>

          <AppliedFilters chips={appliedChips} onRemove={removeChip} onClear={reset} />
          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>MDALL search needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {!!searchMeta?.notes.length && <div className="coverage-banner"><Database size={17} /><div><b>MDALL result note</b><span>{searchMeta.notes.join(" ")}</span></div></div>}
          {loading && <div className="loading-layer"><div className="loading-note"><LoaderCircle className="spin" size={24} /> Contacting Health Canada MDALL…</div></div>}

          {!searched && !loading ? <div className="empty-state"><div className="empty-number">HC</div><Landmark size={34} /><h3>Start with a Canadian licence search.</h3><p>Search a company, licence name, licence number, device trade name, or device identifier in the official Health Canada MDALL API.</p></div>
          : searched && !loading && !error && !filteredLicences.length ? <div className="empty-state"><div className="empty-number">0</div><Search size={34} /><h3>No MDALL licences matched.</h3><p>Try a company name, a shorter licence name, or switch between active and archived licences. Class I devices are not listed in MDALL.</p><div className="empty-actions"><button className="secondary" onClick={() => { setFrom(""); setTo(""); setRiskClass(""); }}>Clear narrow filters</button></div></div>
          : resultView === "licences" && filteredLicences.length > 0 && <>
            <div className="table-wrap"><table className={`fcc-table${widthTools.fixedLayout ? " table-fixed" : ""}`} style={widthTools.tableStyle}>{widthTools.colGroup}<thead><tr>{columns.map((column) => <HeaderCell key={column} spec={headerSpec(column)} resizing={widthTools.resizing} onSort={sortByHeader} onResizeStart={widthTools.startResize} onResizeReset={widthTools.resetWidth} />)}</tr></thead><tbody>{visibleLicences.map((licence) => <tr key={`${licence.licenceNumber}-${licence.licenceStatus}-${licence.endDate || "open"}`} tabIndex={0} onClick={() => setSelected(licence)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(licence); } }}>{columns.map((column) => <td key={column}>{renderCell(licence, column)}</td>)}</tr>)}</tbody></table></div>
            <div className="pagination"><span>{filteredLicences.length.toLocaleString()} matching MDALL licence{filteredLicences.length === 1 ? "" : "s"} · page {page + 1} of {pageCount}</span><div><button className="icon-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Previous page">←</button><button className="icon-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} aria-label="Next page">→</button></div></div>
          </>}
          {resultView === "companies" && groupedCompanies.length > 0 && <div className="fcc-grantee-grid">{groupedCompanies.map((group) => <button key={group.key} className="fcc-grantee-card" onClick={() => setSelectedCompany(group.key)}><span className="grantee-code">{group.companyId || "HC"}</span><h3>{group.companyName}</h3><p>{group.licenceCount} MDALL licence{group.licenceCount === 1 ? "" : "s"}</p><dl><div><dt>Most recent</dt><dd>{displayDate(group.latestIssued)}</dd></div><div><dt>Location</dt><dd>{mdallLocation(group.company)}</dd></div></dl><span className="open-profile">Open company profile →</span></button>)}</div>}
        </section>
      </section>

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <aside className="drawer" aria-label="Health Canada MDALL licence">
          <div className="drawer-top"><span>HEALTH CANADA MDALL LICENCE</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button></div>
          <div className="drawer-hero">
            <span className="record-id">MDALL LICENCE</span>
            <h2 className="fcc-drawer-id">{selected.licenceNumber}</h2>
            <p><PackageSearch size={15} /> {selected.licenceName}</p>
            <p><MapPin size={15} /> {mdallLocation(selected.company)}</p>
            <div className="drawer-actions">
              <a className="secondary" href={officialSearch} target="_blank" rel="noreferrer">Open official MDALL search <ExternalLink size={14} /></a>
              <a className="secondary" href={MDALL_DOCS_URL} target="_blank" rel="noreferrer">MDALL API documentation <ExternalLink size={14} /></a>
              <button className="secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(String(selected.licenceNumber)); setIdCopied(true); setTimeout(() => setIdCopied(false), 1500); }}>{idCopied ? <Check size={14} /> : <Clipboard size={14} />} {idCopied ? "Copied" : "Copy licence number"}</button>
            </div>
          </div>
          <div className="detail-stats"><div><span>First issued</span><b>{displayDate(selected.issuedAt)}</b></div><div><span>Risk class</span><b>{selected.riskClassLabel}</b></div><div><span>Status</span><b>{selected.licenceStatusLabel}</b></div><div><span>Devices</span><b>{selected.deviceDataStatus === "complete" ? selected.devices?.length ?? 0 : selected.deviceDataStatus === "error" ? "Not retrieved" : "Loading…"}</b></div></div>
          <section className="detail-section"><h3><Landmark size={16} /> Licence</h3><dl className="fcc-detail-list"><div><dt>Licence number <small>MDALL source</small></dt><dd>{selected.licenceNumber}</dd></div><div><dt>Licence name <small>MDALL source</small></dt><dd>{selected.licenceName}</dd></div><div><dt>Licence type</dt><dd>{selected.licenceType || "—"}</dd></div><div><dt>Status</dt><dd>{selected.licenceStatusLabel} ({selected.licenceStatus || "—"})</dd></div><div><dt>Risk class</dt><dd>{selected.riskClassLabel}</dd></div><div><dt>First issued</dt><dd>{displayDate(selected.issuedAt)}</dd></div><div><dt>End date</dt><dd>{displayDate(selected.endDate)}</dd></div></dl></section>
          <section className="detail-section"><h3><Building2 size={16} /> Company</h3><dl className="fcc-detail-list"><div><dt>Company name</dt><dd>{selected.companyName || "—"}</dd></div><div><dt>Company ID</dt><dd>{selected.companyId || "—"}</dd></div><div><dt>Address</dt><dd>{selected.company?.address || "—"}</dd></div><div><dt>Location</dt><dd>{mdallLocation(selected.company)}</dd></div></dl>{selected.companyId && <button className="secondary official-record-link" onClick={() => { setSelected(null); setSelectedCompany(String(selected.companyId)); }}><Building2 size={14} /> Open company profile</button>}</section>
          <section className="detail-section"><h3><PackageSearch size={16} /> Devices on this licence{selected.deviceDataStatus === "complete" ? ` (${selected.devices?.length ?? 0})` : ""}</h3>{selected.deviceDataStatus === "error" ? <div className="error-banner"><CircleAlert size={18} /><div><b>Device data was not retrieved</b><span>{selected.deviceDataError}</span></div><button className="secondary" onClick={() => setSelected((current) => current ? { ...current, deviceDataStatus: undefined, deviceDataError: undefined } : current)}>Retry</button></div> : selected.deviceDataStatus !== "complete" ? <p>Loading the complete {selected.state} MDALL device list…</p> : !selected.devices?.length ? <p>No {selected.state} devices are linked to this licence in the MDALL device dataset.</p> : <dl className="fcc-detail-list">{selected.devices.map((device) => <div key={device.deviceId}><dt>{device.tradeName}<small>Device ID {device.deviceId}{device.firstLicensedAt ? ` · added ${device.firstLicensedAt}` : ""}</small></dt><dd>{device.identifierDataError ? "Identifiers not retrieved" : device.identifiers?.length ? device.identifiers.join(", ") : "No active device identifiers returned"}</dd></div>)}</dl>}</section>
          <section className="detail-section"><h3><CalendarDays size={16} /> Evidence / source</h3><dl className="fcc-detail-list"><div><dt>Regulatory source</dt><dd>{MDALL_SOURCE_LABEL}</dd></div><div><dt>Official search</dt><dd>Health Canada MDALL HTML search is POST-only; this dossier uses the documented JSON API.</dd></div><div><dt>Loaded in app</dt><dd>{new Date(selected.retrievedAt).toLocaleString([], dateTimeFormat)}</dd></div>{selected.lastRefreshAt && <div><dt>MDALL last refresh</dt><dd>{displayDate(selected.lastRefreshAt)}</dd></div>}</dl><a className="primary official-record-link" href={officialSearch} target="_blank" rel="noreferrer">Open official MDALL search <ExternalLink size={14} /></a><a className="secondary official-record-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">View raw API response <ExternalLink size={14} /></a></section>
          <section className="detail-section raw-section"><details><summary>View raw MDALL licence <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected.raw, null, 2)}</pre></details></section>
        </aside>
      </div>}

      {selectedCompanyGroup && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedCompany(null)}>
        <aside className="drawer" aria-label="Health Canada MDALL company">
          <div className="drawer-top"><span>HEALTH CANADA MDALL COMPANY</span><button className="icon-button" onClick={() => setSelectedCompany(null)} aria-label="Close company profile"><X size={19} /></button></div>
          <div className="drawer-hero"><span className="record-id">MDALL COMPANY</span><h2>{selectedCompanyGroup.companyName}</h2><p><MapPin size={15} /> {mdallLocation(selectedCompanyGroup.company)}</p></div>
          <div className="detail-stats"><div><span>Licences</span><b>{selectedCompanyGroup.licenceCount}</b></div><div><span>Most recent</span><b>{displayDate(selectedCompanyGroup.latestIssued)}</b></div><div><span>Company ID</span><b>{selectedCompanyGroup.companyId || "—"}</b></div></div>
          <section className="detail-section"><h3><Building2 size={16} /> Overview</h3><dl className="fcc-detail-list"><div><dt>Company</dt><dd>{selectedCompanyGroup.companyName}</dd></div><div><dt>Company ID</dt><dd>{selectedCompanyGroup.companyId || "—"}</dd></div><div><dt>Address</dt><dd>{selectedCompanyGroup.company?.address || "—"}</dd></div></dl></section>
          <section className="detail-section"><h3><Landmark size={16} /> Licences</h3><div className="profile-records">{selectedCompanyGroup.licences.map((licence) => <button key={`${licence.licenceNumber}-${licence.state}-${licence.endDate || "open"}`} onClick={() => { setSelectedCompany(null); setSelected(licence); }}><b>{licence.licenceNumber}</b><span>{licence.licenceName} · {displayDate(licence.issuedAt)}</span></button>)}</div></section>
          <section className="detail-section"><h3><Database size={16} /> Source</h3><a className="primary official-record-link" href={officialSearch} target="_blank" rel="noreferrer">Open official MDALL search <ExternalLink size={14} /></a></section>
        </aside>
      </div>}

      <ExportDialog
        open={exportOpen}
        title="Pack this workbook."
        countLabel="Choose columns and which licence rows to include."
        note={exportProgress || (["deviceCount", "deviceDataStatus", "tradeNames", "identifiers"].some((id) => exportOptions.groups.includes(id)) ? "Device data is retrieved for every exported licence. Large exports can take a moment." : undefined)}
        toggles={MDALL_EXPORT_TOGGLES}
        selected={exportOptions.groups}
        confirming={exporting}
        filename={exportOptions.filename}
        scope={exportOptions.scope}
        clickableLinks={exportOptions.clickableLinks}
        pageCount={visibleLicences.length}
        allCount={filteredLicences.length}
        filters={[query, state !== "active" ? state : "", riskClass && `Class ${riskClass}`, licenceType, from && `From ${from}`, to && `To ${to}`].filter(Boolean) as string[]}
        onFilename={(filename) => setExportOptions((current) => ({ ...current, filename }))}
        onScope={(scope) => setExportOptions((current) => ({ ...current, scope }))}
        onClickableLinks={(clickableLinks) => setExportOptions((current) => ({ ...current, clickableLinks }))}
        onChange={(groups) => setExportOptions((current) => ({ ...current, groups }))}
        onUseVisible={() => setExportOptions((current) => ({
          ...current,
          groups: ["licenceNumber", ...columns.flatMap((column) => MDALL_VISIBLE_TO_EXPORT[column] || [])],
        }))}
        onCancel={() => !exporting && setExportOpen(false)}
        onConfirm={() => void exportWorkbook()}
      />
    </main>
  );
}
