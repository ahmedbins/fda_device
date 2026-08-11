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
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import {
  FCC_EAS_API,
  FCC_SEARCH_URL,
  FCC_SOURCE_LABEL,
  fccLocation,
  normalizeFccScope,
  parseFccScopes,
  type NormalizedFccRecord,
} from "./fcc-core";
import { clearFccCache, searchFcc } from "./fcc-service";
import { downloadCsv } from "./fda-shared";

type SortKey = "date-desc" | "date-asc" | "fcc-id" | "grantee";
type ColumnKey = "fccId" | "grantee" | "authorizationDate" | "purpose" | "location" | "source";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "fccId", label: "FCC ID", hint: "FCC-reported authorization identifier" },
  { key: "grantee", label: "Grantee", hint: "FCC-reported responsible party" },
  { key: "authorizationDate", label: "Authorization date", hint: "FCC grant date" },
  { key: "purpose", label: "Application purpose", hint: "FCC-reported application purpose" },
  { key: "location", label: "Grantee location", hint: "FCC-reported city, state and country" },
  { key: "source", label: "Source", hint: "Authoritative regulatory source" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["fccId", "grantee", "authorizationDate", "purpose", "location", "source"];
const PAGE_SIZES = [10, 25, 50, 100];

function initialState() {
  const fallback = { query: "", scopes: [] as string[], from: "", to: "", sort: "date-desc" as SortKey, pageSize: 25, autorun: false };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const query = normalizeFccScope(params.get("q") || "");
  const scopes = parseFccScopes(params.get("ids") || "");
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const sortParam = params.get("sort") as SortKey | null;
  const sort = (["date-desc", "date-asc", "fcc-id", "grantee"] as SortKey[]).includes(sortParam || "" as SortKey) ? sortParam as SortKey : "date-desc";
  const requestedSize = Number(params.get("rows"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;
  return { query, scopes, from, to, sort, pageSize, autorun: !!(query || scopes.length) };
}

function syncUrl(query: string, scopes: string[], from: string, to: string, sort: SortKey, pageSize: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (scopes.length) params.set("ids", scopes.join(","));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (sort !== "date-desc") params.set("sort", sort);
  if (pageSize !== 25) params.set("rows", String(pageSize));
  const value = params.toString();
  window.history.replaceState(null, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

function sortRecords(records: NormalizedFccRecord[], sort: SortKey) {
  return [...records].sort((a, b) => {
    if (sort === "fcc-id") return a.fccId.localeCompare(b.fccId) || (b.authorizationDate || "").localeCompare(a.authorizationDate || "");
    if (sort === "grantee") return (a.granteeName || "").localeCompare(b.granteeName || "") || a.fccId.localeCompare(b.fccId);
    if (sort === "date-asc") return (a.authorizationDate || "9999").localeCompare(b.authorizationDate || "9999");
    return (b.authorizationDate || "").localeCompare(a.authorizationDate || "") || a.fccId.localeCompare(b.fccId);
  });
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
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState<NormalizedFccRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<NormalizedFccRecord | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const scopeInput = useRef<HTMLInputElement>(null);
  const columnPicker = useRef<HTMLDetailsElement>(null);
  const request = useRef<AbortController | null>(null);

  const effectiveScopes = useMemo(() => [...new Set([query, ...scopes].filter(Boolean))], [query, scopes]);
  const filteredRecords = useMemo(() => sortRecords(records.filter((record) => {
    if (from && (!record.authorizationDate || record.authorizationDate < from)) return false;
    if (to && (!record.authorizationDate || record.authorizationDate > to)) return false;
    return true;
  }), sort), [records, from, to, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const visibleRecords = filteredRecords.slice(page * pageSize, page * pageSize + pageSize);
  const activeFilters = Number(!!query) + Number(scopes.length > 0) + Number(!!from) + Number(!!to);

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
    setSelected(null);
    setPage(0);
    setSearched(true);
    if (force) clearFccCache(effectiveScopes);
    syncUrl(query, scopes, from, to, sort, pageSize);
    try {
      const next = await searchFcc(effectiveScopes, controller.signal);
      if (controller.signal.aborted) return;
      setRecords(next);
      setRetrievedAt(new Date());
    } catch (caught) {
      if (controller.signal.aborted) return;
      setRecords([]);
      setError(caught instanceof Error ? caught.message : "The FCC Equipment Authorization source could not be reached.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [effectiveScopes, from, pageSize, query, scopes, sort, to]);

  useEffect(() => {
    if (initial.autorun) queueMicrotask(() => runSearch());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("fcc-explorer-columns");
    if (!saved) return;
    try {
      const parsed = (JSON.parse(saved) as ColumnKey[]).filter((key) => COLUMN_OPTIONS.some((option) => option.key === key));
      if (parsed.length) setColumns(parsed);
    } catch { /* keep defaults */ }
  }, []);

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
    setQuery(""); setScopes([]); setScopeDraft(""); setFrom(""); setTo("");
    setRecords([]); setError(""); setSearched(false); setRetrievedAt(null); setPage(0);
    syncUrl("", [], "", "", sort, pageSize);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const exportCsv = () => {
    const rows = filteredRecords.map((record) => [
      record.fccId,
      record.granteeName || "",
      record.authorizationDate || "",
      record.applicationPurpose || "",
      fccLocation(record) === "—" ? "" : fccLocation(record),
      "FCC",
      record.retrievedAt,
    ]);
    downloadCsv([
      ["fcc_id", "fcc_grantee", "fcc_authorization_date", "fcc_application_purpose", "fcc_grantee_location", "source", "retrieved_at"],
      ...rows,
    ], `fcc-authorizations-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const toggleColumn = (key: ColumnKey) => setColumns((current) => current.includes(key)
    ? current.length > 1 ? current.filter((item) => item !== key) : current
    : [...current, key]);

  const renderCell = (record: NormalizedFccRecord, column: ColumnKey) => {
    if (column === "fccId") return <b className="fcc-id">{record.fccId}</b>;
    if (column === "grantee") return <><b>{record.granteeName || "—"}</b><span>FCC grantee</span></>;
    if (column === "authorizationDate") return <span className="date-cell">{displayDate(record.authorizationDate)}</span>;
    if (column === "purpose") return <span className="cell-list">{record.applicationPurpose || "—"}</span>;
    if (column === "location") return <span className="cell-list">{fccLocation(record)}</span>;
    return <span className="source-cell">FCC EAS</span>;
  };

  const status = error ? "FCC SOURCE UNAVAILABLE" : retrievedAt ? "FCC API CONNECTED" : "FCC SOURCE READY";
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };

  return (
    <main>
      <SourceNav source="fcc" view="explorer" status={status} statusState={error ? "error" : retrievedAt ? "connected" : "ready"} />

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> FCC EQUIPMENT DATA</div>
        <div className="hero-grid">
          <div>
            <h1>Equipment authorizations.<br /><em>Made searchable.</em></h1>
            <p>Search approved FCC IDs and authorization records.</p>
          </div>
          <div className="dataset-note">
            <RadioTower size={20} />
            <div>
              <b>FCC equipment authorization</b>
              <span>{retrievedAt ? "Source connected" : "Ready for FCC-ID search"}</span>
              <span>{retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${FCC_SOURCE_LABEL}`}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`workspace ${filtersCollapsed ? "filters-collapsed" : ""}`} aria-label="FCC equipment authorization explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="panel-heading">
            <div><span>02</span><h2>Filters</h2></div>
            <div className="panel-heading-actions">
              <button className="icon-button collapse-filter-panel" onClick={() => setFiltersCollapsed((value) => !value)} aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"}>{filtersCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            </div>
          </div>

          <div className="fcc-source-block"><Database size={15} /><div><b>Official FCC source</b><span>Approved FCC IDs via EAS</span></div></div>

          <div className="filter-group-heading"><span>Find</span><small>Complete or partial ID</small></div>
          <label className="field keyword-field">
            <span>FCC-ID search</span>
            <div className="input-shell"><Search size={16} /><input value={query} onChange={(event) => setQuery(normalizeFccScope(event.target.value))} placeholder="FCC ID or grantee-code prefix…" onKeyDown={(event) => event.key === "Enter" && runSearch()} /></div>
            <small className="field-hint">Starts at the beginning of the FCC ID. Minimum 3 characters.</small>
          </label>

          <div className="filter-group-heading narrow-heading"><span>FCC IDs</span><small>Optional additional scopes</small></div>
          <div className="field">
            <span>FCC IDs or prefixes</span>
            <div className="chip-input" onClick={() => scopeInput.current?.focus()}>
              {scopes.map((scope) => <span className="chip" key={scope}>{scope}<button type="button" onClick={(event) => { event.stopPropagation(); setScopes((current) => current.filter((item) => item !== scope)); }} aria-label={`Remove ${scope}`}><X size={11} /></button></span>)}
              <input ref={scopeInput} value={scopeDraft} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) commitScopes(value); else setScopeDraft(normalizeFccScope(value)); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitScopes(scopeDraft); } }} onBlur={() => scopeDraft && commitScopes(scopeDraft)} placeholder="Add ID or prefix…" />
            </div>
          </div>

          <div className="filter-group-heading narrow-heading"><span>Narrow</span><small>Applied to FCC results</small></div>
          <div className="two-col">
            <label className="field"><span>From grant date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field"><span>To grant date</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <small className="field-hint fcc-limit-note">Equipment description, equipment class and RF fields are not returned by the implemented FCC ID service.</small>

          <div className="query-actions">
            <button className="primary" onClick={() => runSearch()} disabled={loading}><Search size={15} /> Search FCC</button>
            <button className="text-button" onClick={reset}>Reset</button>
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title"><span>03</span><div><h2>Authorization records</h2>{retrievedAt && <small className="fetch-meta">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</small>}</div></div>
            <div className="toolbar-actions">
              {activeFilters > 0 && <span className="filter-count"><Filter size={12} /> {activeFilters} active</span>}
              <label className="matrix-sort">Sort <select value={sort} onChange={(event) => { const next = event.target.value as SortKey; setSort(next); setPage(0); syncUrl(query, scopes, from, to, next, pageSize); }}><option value="date-desc">Newest grant</option><option value="date-asc">Oldest grant</option><option value="fcc-id">FCC ID</option><option value="grantee">Grantee</option></select></label>
              <details ref={columnPicker} className="column-picker">
                <summary className="secondary"><Columns3 size={14} /> Columns <ChevronDown size={13} /></summary>
                <div className="column-menu"><div className="column-menu-head"><div><b>Visible columns</b><span>Choose FCC fields</span></div><button onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</button></div><div className="column-options">{COLUMN_OPTIONS.map((option) => <label key={option.key}><input type="checkbox" checked={columns.includes(option.key)} onChange={() => toggleColumn(option.key)} disabled={columns.length === 1 && columns.includes(option.key)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</div></div>
              </details>
              <label className="page-size">Rows <select value={pageSize} onChange={(event) => { const next = Number(event.target.value); setPageSize(next); setPage(0); syncUrl(query, scopes, from, to, sort, next); }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <button className="icon-button" onClick={copyLink} aria-label="Copy shareable FCC URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
              <button className="icon-button" onClick={() => runSearch(true)} disabled={!effectiveScopes.length || loading} aria-label="Refresh FCC results" title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
              <button className="secondary export-button" onClick={exportCsv} disabled={!filteredRecords.length}><ArrowDownToLine size={14} /> CSV</button>
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><Filter size={17} /></button>
            </div>
          </div>

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>FCC service unavailable</b><span>{error}</span>{effectiveScopes[0] && <a className="source-fallback-link" href={`${FCC_EAS_API}?fccId=${encodeURIComponent(effectiveScopes[0])}`} target="_blank" rel="noreferrer">Open this query in the official FCC service <ExternalLink size={12} /></a>}</div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
          {loading && <div className="loading-layer"><LoaderCircle className="spin" size={24} /> Contacting the FCC Equipment Authorization source…</div>}

          {!searched && !loading ? <div className="empty-state"><div className="empty-number">FCC</div><RadioTower size={34} /><h3>Start with an FCC ID.</h3><p>Search a complete FCC ID or the first three or more characters. Results come from the official FCC Equipment Authorization service.</p></div>
          : searched && !loading && !error && !filteredRecords.length ? <div className="empty-state"><div className="empty-number">0</div><Search size={34} /><h3>No approved FCC IDs matched.</h3><p>Check the FCC ID, use a shorter prefix, or remove the date filters.</p><div className="empty-actions"><button className="secondary" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button><button className="secondary" onClick={() => runSearch(true)}>Retry</button></div></div>
          : filteredRecords.length > 0 && <>
            <div className="table-wrap"><table className="fcc-table"><thead><tr>{columns.map((column) => <th key={column}>{COLUMN_OPTIONS.find((option) => option.key === column)?.label}</th>)}</tr></thead><tbody>{visibleRecords.map((record, index) => <tr key={`${record.fccId}-${record.authorizationDate}-${record.applicationPurpose}-${index}`} tabIndex={0} onClick={() => setSelected(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(record); } }}>{columns.map((column) => <td key={column}>{renderCell(record, column)}</td>)}</tr>)}</tbody></table></div>
            <div className="pagination"><span>{filteredRecords.length.toLocaleString()} matching authorization record{filteredRecords.length === 1 ? "" : "s"} · page {page + 1} of {pageCount}</span><div><button className="icon-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Previous page">←</button><button className="icon-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} aria-label="Next page">→</button></div></div>
          </>}
        </section>
      </section>

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <aside className="drawer" aria-label="FCC Equipment Authorization details">
          <div className="drawer-top"><span>FCC EQUIPMENT AUTHORIZATION</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button></div>
          <div className="drawer-hero"><span className="record-id">FCC ID</span><h2 className="fcc-drawer-id">{selected.fccId}</h2><p><MapPin size={15} /> {fccLocation(selected)}</p><button className="secondary copy-id" onClick={async () => { await navigator.clipboard.writeText(selected.fccId); setIdCopied(true); setTimeout(() => setIdCopied(false), 1500); }}>{idCopied ? <Check size={14} /> : <Clipboard size={14} />} {idCopied ? "Copied" : "Copy FCC ID"}</button></div>
          <div className="detail-stats"><div><span>Authorization date</span><b>{displayDate(selected.authorizationDate)}</b></div><div><span>Application purpose</span><b>{selected.applicationPurpose || "—"}</b></div><div><span>Source</span><b>FCC EAS</b></div></div>
          <section className="detail-section"><h3><RadioTower size={16} /> Identity</h3><dl className="fcc-detail-list"><div><dt>FCC ID</dt><dd>{selected.fccId}</dd></div><div><dt>Grantee</dt><dd>{selected.granteeName || "—"}</dd></div><div><dt>Grantee code</dt><dd>Not available from current FCC source</dd></div><div><dt>FCC equipment product-code component</dt><dd>Not available from current FCC source</dd></div><div><dt>Equipment description</dt><dd>Not available from current FCC source</dd></div></dl></section>
          <section className="detail-section"><h3><CalendarDays size={16} /> Authorization</h3><dl className="fcc-detail-list"><div><dt>Grant date</dt><dd>{displayDate(selected.authorizationDate)}</dd></div><div><dt>Application purpose</dt><dd>{selected.applicationPurpose || "—"}</dd></div><div><dt>Equipment class / RF details</dt><dd>Not available from current FCC source</dd></div></dl></section>
          <section className="detail-section"><h3><Database size={16} /> Source</h3><dl className="fcc-detail-list"><div><dt>Regulatory source</dt><dd>{FCC_SOURCE_LABEL}</dd></div><div><dt>Retrieved</dt><dd>{new Date(selected.retrievedAt).toLocaleString([], dateTimeFormat)}</dd></div></dl><a className="primary official-record-link" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer">Open FCC ID search <ExternalLink size={14} /></a></section>
          <section className="detail-section raw-section"><details><summary>View raw FCC response <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected.raw, null, 2)}</pre></details></section>
        </aside>
      </div>}
    </main>
  );
}
