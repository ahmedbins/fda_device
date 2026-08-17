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
import { clearMdallCache, fetchMdallDevicesForLicence, searchMdall } from "./mdall-service";
import { downloadCsv } from "./fda-shared";

type SortKey = "date-desc" | "date-asc" | "licence" | "company" | "name";
type ColumnKey = "licenceNo" | "licenceName" | "company" | "class" | "type" | "status" | "issued" | "endDate" | "open";
type ResultView = "licences" | "companies";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "licenceNo", label: "Licence no.", hint: "Health Canada licence number" },
  { key: "licenceName", label: "Licence name", hint: "MDALL licence name" },
  { key: "company", label: "Company", hint: "MDALL company name" },
  { key: "class", label: "Risk class", hint: "Health Canada application risk class" },
  { key: "type", label: "Licence type", hint: "Single device, family, system, or group" },
  { key: "status", label: "Status", hint: "MDALL licence status" },
  { key: "issued", label: "First issued", hint: "Date the licence was first issued" },
  { key: "endDate", label: "End date", hint: "Cancellation or removal date, if any" },
  { key: "open", label: "Open record", hint: "Official Health Canada MDALL search" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["licenceNo", "licenceName", "company", "class", "status", "issued", "open"];
const PAGE_SIZES = [10, 25, 50, 100];

function initialState() {
  const preset = getMdallPreset(DEFAULT_MDALL_PRESET);
  const fallback = { query: "", mode: "auto" as MdallSearchMode, state: "active" as MdallLicenceState, riskClass: "", licenceType: "", from: "", to: "", sort: "date-desc" as SortKey, pageSize: 25, resultView: "licences" as ResultView, presetId: preset?.id || "", companyIds: preset?.companyIds || [] as number[], autorun: !!preset };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const query = parseMdallQuery(params.get("q") || "");
  const requestedPreset = getMdallPreset(params.get("preset"));
  const useDefaultPreset = !query && !params.has("preset") && !params.has("company");
  const activePreset = requestedPreset || (useDefaultPreset ? preset : undefined);
  const companyIds = params.get("company") ? params.get("company")!.split(",").map(Number).filter((id) => Number.isFinite(id)) : activePreset?.companyIds || [];
  const mode = (["auto", "company", "licence", "licenceNumber", "device", "identifier"] as MdallSearchMode[]).includes(params.get("mode") as MdallSearchMode) ? params.get("mode") as MdallSearchMode : "auto";
  const state = (["active", "archived", "both"] as MdallLicenceState[]).includes(params.get("state") as MdallLicenceState) ? params.get("state") as MdallLicenceState : "active";
  const sortParam = params.get("sort") as SortKey | null;
  const sort = (["date-desc", "date-asc", "licence", "company", "name"] as SortKey[]).includes(sortParam || "" as SortKey) ? sortParam as SortKey : "date-desc";
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
  if (sort !== "date-desc") params.set("sort", sort);
  if (pageSize !== 25) params.set("rows", String(pageSize));
  if (resultView !== "licences") params.set("view", resultView);
  if (presetId) params.set("preset", presetId);
  if (companyIds.length && !presetId) params.set("company", companyIds.join(","));
  const value = params.toString();
  window.history.replaceState(null, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

function sortLicences(licences: MdallLicence[], sort: SortKey) {
  return [...licences].sort((a, b) => {
    if (sort === "licence") return a.licenceNumber - b.licenceNumber;
    if (sort === "company") return (a.companyName || "").localeCompare(b.companyName || "") || a.licenceName.localeCompare(b.licenceName);
    if (sort === "name") return a.licenceName.localeCompare(b.licenceName);
    if (sort === "date-asc") return (a.issuedAt || "9999").localeCompare(b.issuedAt || "9999");
    return (b.issuedAt || "").localeCompare(a.issuedAt || "") || a.licenceName.localeCompare(b.licenceName);
  });
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
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<MdallLicence | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
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
    } catch (caught) {
      if (controller.signal.aborted) return;
      setLicences([]);
      setError(caught instanceof Error ? caught.message : "The Health Canada MDALL source could not be reached.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [companyIds, from, licenceType, mode, pageSize, presetId, query, resultView, riskClass, sort, state, to]);

  useEffect(() => {
    if (initial.autorun) queueMicrotask(() => runSearch());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("mdall-explorer-columns", JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    if (!selected || selected.devices) return;
    let cancelled = false;
    fetchMdallDevicesForLicence(selected).then((devices) => {
      if (!cancelled) setSelected((current) => current && current.licenceNumber === selected.licenceNumber ? { ...current, devices } : current);
    }).catch(() => {
      if (!cancelled) setSelected((current) => current && current.licenceNumber === selected.licenceNumber ? { ...current, devices: [] } : current);
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

  const exportCsv = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv([
      ["licence_number", "licence_name", "licence_status", "licence_status_label", "risk_class", "licence_type", "first_issued", "end_date", "company_id", "company_name", "company_location", "mdall_search_url", "source", "last_refresh_dt", "retrieved_at"],
      ...filteredLicences.map((licence) => [
        licence.licenceNumber,
        licence.licenceName,
        licence.licenceStatus,
        licence.licenceStatusLabel,
        licence.riskClassLabel,
        licence.licenceType || "",
        licence.issuedAt || "",
        licence.endDate || "",
        licence.companyId || "",
        licence.companyName || "",
        mdallLocation(licence.company) === "—" ? "" : mdallLocation(licence.company),
        officialSearch,
        "Health Canada MDALL",
        licence.lastRefreshAt || "",
        licence.retrievedAt,
      ]),
    ], `mdall-licences-${stamp}.csv`);

    const deviceRows: string[][] = [];
    for (const licence of filteredLicences.slice(0, 25)) {
      const devices = licence.devices?.length ? licence.devices : await fetchMdallDevicesForLicence(licence).catch(() => []);
      devices.forEach((device) => {
        if (device.identifiers.length) {
          device.identifiers.forEach((identifier) => deviceRows.push([licence.licenceNumber, licence.licenceName, device.deviceId, device.tradeName, identifier, device.firstLicensedAt || "", device.endDate || ""]));
        } else {
          deviceRows.push([licence.licenceNumber, licence.licenceName, device.deviceId, device.tradeName, "", device.firstLicensedAt || "", device.endDate || ""]);
        }
      });
    }
    downloadCsv([
      ["licence_number", "licence_name", "device_id", "trade_name", "device_identifier", "first_licensed", "end_date"],
      ...deviceRows,
    ], `mdall-devices-${stamp}.csv`);
  };

  const renderCell = (licence: MdallLicence, column: ColumnKey) => {
    if (column === "licenceNo") return <b className="fcc-id">{licence.licenceNumber}</b>;
    if (column === "licenceName") return <><b>{licence.licenceName}</b><span>{licence.licenceType || "MDALL licence"}</span></>;
    if (column === "company") return <><b>{licence.companyName || "—"}</b><span>{licence.companyId ? `Company ID ${licence.companyId}` : "Company"}</span></>;
    if (column === "class") return <span className="source-cell">{licence.riskClassLabel}</span>;
    if (column === "type") return <span className="cell-list">{licence.licenceType || "—"}</span>;
    if (column === "status") return <span className="cell-list">{licence.licenceStatusLabel}</span>;
    if (column === "issued") return <span className="date-cell">{displayDate(licence.issuedAt)}</span>;
    if (column === "endDate") return <span className="date-cell">{displayDate(licence.endDate)}</span>;
    return <a className="open-record-button" href={officialSearch} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open MDALL <ExternalLink size={11} /></a>;
  };

  const sourcePresentation = mdallSourcePresentation(!!retrievedAt);
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const selectedCompanyGroup = selectedCompany ? groupedCompanies.find((group) => group.key === selectedCompany) : undefined;

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
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title"><span>03</span><div><h2>{resultView === "licences" ? "MDALL licences" : "Companies"}</h2>{retrievedAt && <small className="fetch-meta">{searchMeta?.lastRefreshAt ? `MDALL refresh ${displayDate(searchMeta.lastRefreshAt)}` : `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}`}</small>}</div></div>
            <div className="toolbar-actions">
              {activeFilters > 0 && <span className="filter-count"><Filter size={12} /> {activeFilters} active</span>}
              <div className="view-toggle"><button className={resultView === "licences" ? "active" : ""} onClick={() => { setResultView("licences"); setPage(0); }}>Licences</button><button className={resultView === "companies" ? "active" : ""} onClick={() => { setResultView("companies"); setPage(0); }}>Companies</button></div>
              {resultView === "licences" && <label className="matrix-sort">Sort <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(0); }}><option value="date-desc">Newest issued</option><option value="date-asc">Oldest issued</option><option value="licence">Licence number</option><option value="name">Licence name</option><option value="company">Company</option></select></label>}
              {resultView === "licences" && <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={14} /> Columns <ChevronDown size={13} /></summary>
                <div className="column-menu"><div className="column-menu-head"><div><b>Visible columns</b><span>Choose MDALL fields</span></div><button onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</button></div><div className="column-options">{COLUMN_OPTIONS.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => setColumns((current) => current.includes(option.key) ? current.length > 1 ? current.filter((item) => item !== option.key) : current : [...current, option.key])} disabled={columns.length === 1 && columns.includes(option.key)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</div></div>
              </details>}
              {resultView === "licences" && <label className="page-size">Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
              <button className="icon-button" onClick={async () => { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }} aria-label="Copy shareable MDALL URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
              <button className="icon-button" onClick={() => runSearch(true)} disabled={loading} aria-label="Refresh MDALL results" title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
              <button className="secondary export-button" onClick={() => void exportCsv()} disabled={!filteredLicences.length}><ArrowDownToLine size={14} /> CSV</button>
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Filter size={17} /></button>
            </div>
          </div>

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>MDALL search needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {!!searchMeta?.notes.length && <div className="coverage-banner"><Database size={17} /><div><b>MDALL result note</b><span>{searchMeta.notes.join(" ")}</span></div></div>}
          {loading && <div className="loading-layer"><LoaderCircle className="spin" size={24} /> Contacting Health Canada MDALL…</div>}

          {!searched && !loading ? <div className="empty-state"><div className="empty-number">HC</div><Landmark size={34} /><h3>Start with a Canadian licence search.</h3><p>Search a company, licence name, licence number, device trade name, or device identifier in the official Health Canada MDALL API.</p></div>
          : searched && !loading && !error && !filteredLicences.length ? <div className="empty-state"><div className="empty-number">0</div><Search size={34} /><h3>No MDALL licences matched.</h3><p>Try a company name, a shorter licence name, or switch between active and archived licences. Class I devices are not listed in MDALL.</p><div className="empty-actions"><button className="secondary" onClick={() => { setFrom(""); setTo(""); setRiskClass(""); }}>Clear narrow filters</button></div></div>
          : resultView === "licences" && filteredLicences.length > 0 && <>
            <div className="table-wrap"><table className="fcc-table"><thead><tr>{columns.map((column) => <th key={column}>{COLUMN_OPTIONS.find((option) => option.key === column)?.label}</th>)}</tr></thead><tbody>{visibleLicences.map((licence) => <tr key={`${licence.licenceNumber}-${licence.licenceStatus}-${licence.endDate || "open"}`} tabIndex={0} onClick={() => setSelected(licence)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(licence); } }}>{columns.map((column) => <td key={column}>{renderCell(licence, column)}</td>)}</tr>)}</tbody></table></div>
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
          <div className="detail-stats"><div><span>First issued</span><b>{displayDate(selected.issuedAt)}</b></div><div><span>Risk class</span><b>{selected.riskClassLabel}</b></div><div><span>Status</span><b>{selected.licenceStatusLabel}</b></div></div>
          <section className="detail-section"><h3><Landmark size={16} /> Licence</h3><dl className="fcc-detail-list"><div><dt>Licence number <small>MDALL source</small></dt><dd>{selected.licenceNumber}</dd></div><div><dt>Licence name <small>MDALL source</small></dt><dd>{selected.licenceName}</dd></div><div><dt>Licence type</dt><dd>{selected.licenceType || "—"}</dd></div><div><dt>Status</dt><dd>{selected.licenceStatusLabel} ({selected.licenceStatus || "—"})</dd></div><div><dt>Risk class</dt><dd>{selected.riskClassLabel}</dd></div><div><dt>First issued</dt><dd>{displayDate(selected.issuedAt)}</dd></div><div><dt>End date</dt><dd>{displayDate(selected.endDate)}</dd></div></dl></section>
          <section className="detail-section"><h3><Building2 size={16} /> Company</h3><dl className="fcc-detail-list"><div><dt>Company name</dt><dd>{selected.companyName || "—"}</dd></div><div><dt>Company ID</dt><dd>{selected.companyId || "—"}</dd></div><div><dt>Address</dt><dd>{selected.company?.address || "—"}</dd></div><div><dt>Location</dt><dd>{mdallLocation(selected.company)}</dd></div></dl>{selected.companyId && <button className="secondary official-record-link" onClick={() => { setSelected(null); setSelectedCompany(String(selected.companyId)); }}><Building2 size={14} /> Open company profile</button>}</section>
          <section className="detail-section"><h3><PackageSearch size={16} /> Devices on this licence</h3>{selected.devices === undefined ? <p>Loading MDALL device names…</p> : !selected.devices.length ? <p>MDALL does not offer a licence-number filter on the device endpoint. No trade names were matched from this licence name.</p> : <dl className="fcc-detail-list">{selected.devices.slice(0, 40).map((device) => <div key={device.deviceId}><dt>{device.tradeName}<small>Device ID {device.deviceId}{device.firstLicensedAt ? ` · added ${device.firstLicensedAt}` : ""}</small></dt><dd>{device.identifiers.length ? device.identifiers.join(", ") : "No device identifiers returned"}</dd></div>)}</dl>}</section>
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
          <section className="detail-section"><h3><Landmark size={16} /> Licences</h3><div className="profile-records">{selectedCompanyGroup.licences.slice(0, 40).map((licence) => <button key={licence.licenceNumber} onClick={() => { setSelectedCompany(null); setSelected(licence); }}><b>{licence.licenceNumber}</b><span>{licence.licenceName} · {displayDate(licence.issuedAt)}</span></button>)}</div></section>
          <section className="detail-section"><h3><Database size={16} /> Source</h3><a className="primary official-record-link" href={officialSearch} target="_blank" rel="noreferrer">Open official MDALL search <ExternalLink size={14} /></a></section>
        </aside>
      </div>}
    </main>
  );
}
