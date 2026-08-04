"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Ear,
  ExternalLink,
  Link2,
  LoaderCircle,
  PackagePlus,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  API,
  CODE_NAMES,
  PRESET,
  PRESET_CODES,
  type RecordItem,
  companyName,
  downloadCsv,
  locationSummary,
  parseCodes,
  quote,
  useDevHost,
} from "./fda-shared";

const API_510K = "https://api.fda.gov/device/510k.json";
const API_RECALL = "https://api.fda.gov/device/recall.json";
const API_EVENT = "https://api.fda.gov/device/event.json";
const FETCH_LIMIT = 100;
const WINDOWS = [30, 90, 180, 365];

type NewListing = {
  createdDate: string;
  code: string;
  deviceName: string;
  company: string;
  location: string;
  regNumber: string;
};

type Clearance = {
  decisionDate: string;
  kNumber: string;
  applicant: string;
  deviceName: string;
  code: string;
  decision: string;
  clearanceType: string;
};

type RecallRow = {
  initiated: string;
  code: string;
  firm: string;
  product: string;
  reason: string;
  status: string;
  cfresId: string;
};

type EventRow = {
  received: string;
  eventType: string;
  brand: string;
  manufacturer: string;
  code: string;
  reportKey: string;
};

type Section<T> = {
  status: "loading" | "done" | "error";
  rows: T[];
  total: number;
  datasetDate: string;
  capped: boolean;
  error?: string;
};

const EMPTY_SECTION = { status: "loading" as const, rows: [], total: 0, datasetDate: "", capped: false };

type OpenFdaMeta = { last_updated?: string; results?: { total?: number } };

async function fetchJson(url: string) {
  const response = await fetch(url);
  const data = (await response.json()) as {
    meta?: OpenFdaMeta;
    results?: unknown[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || "The openFDA request failed.");
  return data;
}

function codesClause(field: string, codes: string[]) {
  const quoted = codes.map(quote);
  return quoted.length === 1 ? `${field}:${quoted[0]}` : `${field}:(${quoted.join(" OR ")})`;
}

/** Normalizes openFDA dates — "20260630" and "2026-06-30" both become "2026-06-30". */
function isoDate(raw?: string) {
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.slice(0, 10);
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function loadListings(codes: string[]): Promise<Section<NewListing>> {
  const params = new URLSearchParams({ limit: "1000", search: codesClause("products.product_code", codes) });
  const data = await fetchJson(`${API}?${params.toString()}`);
  const records = (data.results || []) as RecordItem[];
  const codeSet = new Set(codes);
  const rows: NewListing[] = [];
  records.forEach((item) => {
    (item.products || []).forEach((product) => {
      const code = product.product_code?.toUpperCase() || "";
      if (!codeSet.has(code) || !product.created_date) return;
      rows.push({
        createdDate: isoDate(product.created_date),
        code,
        deviceName: product.openfda?.device_name || "Unspecified device type",
        company: companyName(item),
        location: locationSummary(item),
        regNumber: item.registration?.registration_number || "—",
      });
    });
  });
  rows.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  const total = data.meta?.results?.total || 0;
  return { status: "done", rows, total: rows.length, datasetDate: data.meta?.last_updated || "", capped: total > 1000 };
}

async function loadClearances(codes: string[]): Promise<Section<Clearance>> {
  const params = new URLSearchParams({
    search: codesClause("product_code", codes),
    sort: "decision_date:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_510K}?${params.toString()}`);
  const rows = ((data.results || []) as Record<string, string>[]).map((r) => ({
    decisionDate: isoDate(r.decision_date),
    kNumber: r.k_number || "",
    applicant: r.applicant || "—",
    deviceName: r.device_name || "—",
    code: r.product_code || "—",
    decision: r.decision_description || "—",
    clearanceType: r.clearance_type || "—",
  }));
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

async function loadRecalls(codes: string[]): Promise<Section<RecallRow>> {
  const params = new URLSearchParams({
    search: codesClause("product_code", codes),
    sort: "event_date_initiated:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_RECALL}?${params.toString()}`);
  const rows = ((data.results || []) as Record<string, string>[]).map((r) => ({
    initiated: isoDate(r.event_date_initiated),
    code: r.product_code || "—",
    firm: r.recalling_firm || "—",
    product: r.product_description || "—",
    reason: r.reason_for_recall || "—",
    status: r.recall_status || "—",
    cfresId: r.cfres_id || "",
  }));
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

async function loadEvents(codes: string[]): Promise<Section<EventRow>> {
  const params = new URLSearchParams({
    search: codesClause("device.device_report_product_code", codes),
    sort: "date_received:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_EVENT}?${params.toString()}`);
  type RawEvent = { date_received?: string; event_type?: string; mdr_report_key?: string; device?: { brand_name?: string; manufacturer_d_name?: string; device_report_product_code?: string }[] };
  const rows = ((data.results || []) as RawEvent[]).map((r) => {
    const device = r.device?.[0];
    return {
      received: isoDate(r.date_received),
      eventType: r.event_type || "Not specified",
      brand: device?.brand_name || "—",
      manufacturer: device?.manufacturer_d_name || "—",
      code: device?.device_report_product_code || "—",
      reportKey: r.mdr_report_key || "",
    };
  });
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

function errorSection<T>(caught: unknown): Section<T> {
  return {
    ...EMPTY_SECTION,
    status: "error",
    rows: [],
    error: caught instanceof Error ? caught.message : "The openFDA request failed.",
  };
}

function initialMonitorState() {
  const fallback = { codes: PRESET_CODES, days: 90 };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const codes = parseCodes(params.get("codes") || "");
  const days = Number(params.get("days"));
  return {
    codes: codes.length ? codes : PRESET_CODES,
    days: WINDOWS.includes(days) ? days : 90,
  };
}

function syncMonitorUrl(codes: string[], days: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  params.set("codes", codes.join(","));
  params.set("days", String(days));
  window.history.replaceState(null, "", `?${params.toString()}`);
}

function windowRows<T>(section: Section<T>, dateOf: (row: T) => string, cutoff: string) {
  return section.rows.filter((row) => dateOf(row) >= cutoff);
}

const eventTypeClass = (type: string) => {
  const key = type.toLowerCase();
  if (key.includes("death")) return "evt-death";
  if (key.includes("injury")) return "evt-injury";
  if (key.includes("malfunction")) return "evt-malfunction";
  return "evt-other";
};

export default function MonitorPage() {
  const [initial] = useState(initialMonitorState);
  const [codes, setCodes] = useState<string[]>(initial.codes);
  const [days, setDays] = useState(initial.days);
  const [codeDraft, setCodeDraft] = useState("");
  const [listings, setListings] = useState<Section<NewListing>>(EMPTY_SECTION);
  const [clearances, setClearances] = useState<Section<Clearance>>(EMPTY_SECTION);
  const [recalls, setRecalls] = useState<Section<RecallRow>>(EMPTY_SECTION);
  const [events, setEvents] = useState<Section<EventRow>>(EMPTY_SECTION);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const devHost = useDevHost();
  const anyLoading = [listings, clearances, recalls, events].some((s) => s.status === "loading");
  const presetActive = codes.length === PRESET_CODES.length && PRESET_CODES.every((code) => codes.includes(code));

  const refresh = (nextCodes: string[] = codes, nextDays: number = days) => {
    if (!nextCodes.length) return;
    const run = ++seq.current;
    syncMonitorUrl(nextCodes, nextDays);
    setListings({ ...EMPTY_SECTION });
    setClearances({ ...EMPTY_SECTION });
    setRecalls({ ...EMPTY_SECTION });
    setEvents({ ...EMPTY_SECTION });
    const guard = <T,>(apply: (section: Section<T>) => void) => (section: Section<T>) => {
      if (run === seq.current) apply(section);
    };
    loadListings(nextCodes).then(guard(setListings), (e) => guard(setListings)(errorSection(e)));
    loadClearances(nextCodes).then(guard(setClearances), (e) => guard(setClearances)(errorSection(e)));
    loadRecalls(nextCodes).then(guard(setRecalls), (e) => guard(setRecalls)(errorSection(e)));
    loadEvents(nextCodes).then(guard(setEvents), (e) => guard(setEvents)(errorSection(e)));
    setRefreshedAt(new Date());
  };

  useEffect(() => {
    queueMicrotask(() => refresh(initial.codes, initial.days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitCodes = (text: string) => {
    const parsed = parseCodes(text);
    if (parsed.length) setCodes((prev) => [...new Set([...prev, ...parsed])]);
    setCodeDraft("");
  };

  const removeCode = (code: string) => {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    if (next.length) refresh(next);
  };

  const togglePreset = () => {
    const next = presetActive ? [] : [...PRESET_CODES];
    setCodes(next);
    setCodeDraft("");
    if (next.length) refresh(next);
  };

  const updateNow = () => {
    let next = codes;
    const parsed = parseCodes(codeDraft);
    if (parsed.length) {
      next = [...new Set([...codes, ...parsed])];
      setCodes(next);
    }
    setCodeDraft("");
    refresh(next);
  };

  const changeDays = (nextDays: number) => {
    setDays(nextDays);
    syncMonitorUrl(codes, nextDays);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      /* address bar fallback */
    }
  };

  const cutoff = useMemo(() => cutoffIso(days), [days]);
  const newListings = useMemo(() => windowRows(listings, (r) => r.createdDate, cutoff), [listings, cutoff]);
  const newClearances = useMemo(() => windowRows(clearances, (r) => r.decisionDate, cutoff), [clearances, cutoff]);
  const newRecalls = useMemo(() => windowRows(recalls, (r) => r.initiated, cutoff), [recalls, cutoff]);
  const newEvents = useMemo(() => windowRows(events, (r) => r.received, cutoff), [events, cutoff]);
  const eventsPlus = events.capped && newEvents.length === events.rows.length && events.rows.length > 0;

  const stamp = () => new Date().toISOString().slice(0, 10);
  const codesPart = () => codes.join("+") || "all";

  const exportListings = () =>
    downloadCsv(
      [["Created", "Product code", "Device type", "Company", "Location", "Registration #"],
        ...newListings.map((r) => [r.createdDate, r.code, r.deviceName, r.company, r.location, r.regNumber])],
      `fda-monitor-new-listings-${codesPart()}-${stamp()}.csv`,
    );
  const exportClearances = () =>
    downloadCsv(
      [["Decision date", "K number", "Applicant", "Device", "Product code", "Decision", "Type"],
        ...newClearances.map((r) => [r.decisionDate, r.kNumber, r.applicant, r.deviceName, r.code, r.decision, r.clearanceType])],
      `fda-monitor-510k-${codesPart()}-${stamp()}.csv`,
    );
  const exportRecalls = () =>
    downloadCsv(
      [["Initiated", "Product code", "Recalling firm", "Product", "Reason", "Status"],
        ...newRecalls.map((r) => [r.initiated, r.code, r.firm, r.product, r.reason, r.status])],
      `fda-monitor-recalls-${codesPart()}-${stamp()}.csv`,
    );
  const exportEvents = () =>
    downloadCsv(
      [["Received", "Event type", "Brand", "Manufacturer", "Product code"],
        ...newEvents.map((r) => [r.received, r.eventType, r.brand, r.manufacturer, r.code])],
      `fda-monitor-events-${codesPart()}-${stamp()}.csv`,
    );

  const sectionMeta = (section: Section<unknown>, windowed: number, plus = false) => {
    if (section.status === "loading") return <span className="section-count loading"><LoaderCircle className="spin" size={12} /></span>;
    if (section.status === "error") return <span className="section-count error">error</span>;
    return <span className="section-count">{windowed.toLocaleString()}{plus ? "+" : ""} in window</span>;
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="FDA Device Explorer home">
          <span className="brand-mark"><Bell size={18} /></span>
          <span><b>SONOVA</b> / DEVICE MONITORING</span>
          {devHost && <span className="dev-badge">DEV</span>}
        </a>
        <div className="topbar-right">
          <nav className="top-nav" aria-label="Pages">
            <a href="/">Explorer</a>
            <a className="current" href="/monitor">Monitoring</a>
          </nav>
          <div className="source-status">
            <span className="pulse" /> openFDA live
          </div>
        </div>
      </header>

      <section className="hero monitor-hero" id="top">
        <div className="eyebrow"><span>01</span> REGULATORY MONITORING</div>
        <div className="hero-grid">
          <div>
            <h1>What changed.<br /><em>At a glance.</em></h1>
            <p>New listings, 510(k) clearances, recalls and adverse events for your product codes.</p>
          </div>
        </div>
      </section>

      <section className="monitor-controls" aria-label="Monitoring controls">
        <div className="field monitor-codes">
          <span>Product codes</span>
          <div className="chip-input" onClick={() => codeInput.current?.focus()}>
            {codes.map((code) => (
              <span key={code} className="chip" title={CODE_NAMES.get(code) || `Product code ${code}`}>
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
                  else updateNow();
                } else if (e.key === "Backspace" && !codeDraft && codes.length) {
                  removeCode(codes[codes.length - 1]);
                }
              }}
              onBlur={() => codeDraft.trim() && commitCodes(codeDraft)}
              placeholder={codes.length ? "Add code…" : "e.g. QUH, OSM"}
              aria-label="Product codes"
            />
          </div>
        </div>
        <button
          type="button"
          className={`preset-toggle monitor-preset ${presetActive ? "active" : ""}`}
          onClick={togglePreset}
          aria-pressed={presetActive}
          title={PRESET.map((p) => `${p.code} — ${p.name}`).join("\n")}
        >
          <Ear size={15} />
          <span className="preset-copy"><b>Hearing aid preset</b></span>
          <span className="preset-state">{presetActive ? <><Check size={12} /> ON</> : "OFF"}</span>
        </button>
        <label className="field monitor-window">
          <span>Window</span>
          <span className="select-wrap">
            <select value={days} onChange={(e) => changeDays(Number(e.target.value))}>
              {WINDOWS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            <ChevronDown size={14} />
          </span>
        </label>
        <div className="monitor-actions">
          <button className="primary" onClick={updateNow} disabled={anyLoading || (!codes.length && !codeDraft.trim())}>
            {anyLoading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />} Update
          </button>
          <button className="icon-button" onClick={copyLink} aria-label="Copy shareable link" title="Copy a shareable link to this view">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
          <button className="icon-button" onClick={() => refresh()} disabled={anyLoading || !codes.length} aria-label="Refresh all sections" title="Re-fetch all sections"><RefreshCw className={anyLoading ? "spin" : ""} size={16} /></button>
        </div>
        {refreshedAt && <small className="monitor-refreshed">Pulled {refreshedAt.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} · windows compare against the last {days} days · each section shows its own FDA data vintage</small>}
      </section>

      <section className="stat-tiles" aria-label="Summary">
        <div className="stat-tile"><PackagePlus size={17} /><div><b>{listings.status === "done" ? newListings.length : "—"}</b><span>New listings</span></div></div>
        <div className="stat-tile"><BadgeCheck size={17} /><div><b>{clearances.status === "done" ? newClearances.length : "—"}</b><span>510(k) clearances</span></div></div>
        <div className="stat-tile"><TriangleAlert size={17} /><div><b>{recalls.status === "done" ? newRecalls.length : "—"}</b><span>Recalls</span></div></div>
        <div className="stat-tile"><Activity size={17} /><div><b>{events.status === "done" ? `${newEvents.length}${eventsPlus ? "+" : ""}` : "—"}</b><span>Adverse events</span></div></div>
      </section>

      <section className="monitor-section" aria-label="New device listings">
        <div className="section-head">
          <h2><PackagePlus size={17} /> New device listings {sectionMeta(listings, newListings.length)}</h2>
          <div className="section-tools">
            {listings.datasetDate && <span className="dataset-date">FDA data as of {listings.datasetDate}</span>}
            <button className="icon-button small" onClick={exportListings} disabled={!newListings.length} aria-label="Export new listings CSV" title="Download this section as CSV"><ArrowDownToLine size={15} /></button>
          </div>
        </div>
        {listings.status === "error" && <div className="section-error"><CircleAlert size={15} /> {listings.error}</div>}
        {listings.status === "done" && !newListings.length && (
          <div className="section-empty">
            None in the last {days} days.
            {listings.rows[0] && <> Most recent: <b>{listings.rows[0].createdDate}</b> — {listings.rows[0].company} ({listings.rows[0].code}).</>}
          </div>
        )}
        {!!newListings.length && (
          <div className="table-wrap">
            <table className="m-table">
              <thead><tr><th>Created</th><th>Code</th><th>Device type</th><th>Company</th><th>Location</th><th>Reg. #</th></tr></thead>
              <tbody>
                {newListings.map((row, i) => (
                  <tr key={`${row.regNumber}-${row.code}-${i}`}>
                    <td className="date-cell">{row.createdDate}</td>
                    <td><span className="code-pill">{row.code}</span></td>
                    <td className="wrap-cell">{row.deviceName}</td>
                    <td><b>{row.company}</b></td>
                    <td>{row.location}</td>
                    <td className="muted-cell">{row.regNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {listings.capped && <div className="section-note">Based on the first 1,000 matching registrations — narrow the codes for a complete picture.</div>}
      </section>

      <section className="monitor-section" aria-label="510(k) clearances">
        <div className="section-head">
          <h2><BadgeCheck size={17} /> 510(k) clearances {sectionMeta(clearances, newClearances.length)}</h2>
          <div className="section-tools">
            {clearances.datasetDate && <span className="dataset-date">FDA data as of {clearances.datasetDate}</span>}
            <button className="icon-button small" onClick={exportClearances} disabled={!newClearances.length} aria-label="Export clearances CSV" title="Download this section as CSV"><ArrowDownToLine size={15} /></button>
          </div>
        </div>
        {clearances.status === "error" && <div className="section-error"><CircleAlert size={15} /> {clearances.error}</div>}
        {clearances.status === "done" && !newClearances.length && (
          <div className="section-empty">
            None in the last {days} days.
            {clearances.rows[0] && <> Most recent: <b>{clearances.rows[0].decisionDate}</b> — {clearances.rows[0].applicant} ({clearances.rows[0].kNumber}).</>}
          </div>
        )}
        {!!newClearances.length && (
          <div className="table-wrap">
            <table className="m-table">
              <thead><tr><th>Decision</th><th>K number</th><th>Applicant</th><th>Device</th><th>Code</th><th>Outcome</th></tr></thead>
              <tbody>
                {newClearances.map((row) => (
                  <tr key={row.kNumber}>
                    <td className="date-cell">{row.decisionDate}</td>
                    <td>
                      <a className="ext-link" href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${row.kNumber}`} target="_blank" rel="noreferrer">
                        {row.kNumber} <ExternalLink size={11} />
                      </a>
                    </td>
                    <td><b>{row.applicant}</b></td>
                    <td className="wrap-cell">{row.deviceName}</td>
                    <td><span className="code-pill">{row.code}</span></td>
                    <td className="muted-cell">{row.decision} · {row.clearanceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="monitor-section" aria-label="Recalls">
        <div className="section-head">
          <h2><TriangleAlert size={17} /> Recalls {sectionMeta(recalls, newRecalls.length)}</h2>
          <div className="section-tools">
            {recalls.datasetDate && <span className="dataset-date">FDA data as of {recalls.datasetDate}</span>}
            <button className="icon-button small" onClick={exportRecalls} disabled={!newRecalls.length} aria-label="Export recalls CSV" title="Download this section as CSV"><ArrowDownToLine size={15} /></button>
          </div>
        </div>
        {recalls.status === "error" && <div className="section-error"><CircleAlert size={15} /> {recalls.error}</div>}
        {recalls.status === "done" && !newRecalls.length && (
          <div className="section-empty">
            None in the last {days} days.
            {recalls.rows[0]
              ? <> Most recent: <b>{recalls.rows[0].initiated}</b> — {recalls.rows[0].firm} ({recalls.rows[0].code}), {recalls.rows[0].status}.</>
              : <> No recalls on record for these codes.</>}
          </div>
        )}
        {!!newRecalls.length && (
          <div className="table-wrap">
            <table className="m-table">
              <thead><tr><th>Initiated</th><th>Code</th><th>Recalling firm</th><th>Product</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {newRecalls.map((row, i) => (
                  <tr key={`${row.cfresId || row.initiated}-${i}`}>
                    <td className="date-cell">{row.initiated}</td>
                    <td><span className="code-pill">{row.code}</span></td>
                    <td><b>{row.firm}</b></td>
                    <td className="wrap-cell">{row.product}</td>
                    <td className="wrap-cell reason-cell" title={row.reason}>{row.reason}</td>
                    <td className="muted-cell">
                      {row.cfresId
                        ? <a className="ext-link" href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=${row.cfresId}`} target="_blank" rel="noreferrer">{row.status} <ExternalLink size={11} /></a>
                        : row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="monitor-section" aria-label="Adverse events">
        <div className="section-head">
          <h2><Activity size={17} /> Adverse events (MAUDE) {sectionMeta(events, newEvents.length, eventsPlus)}</h2>
          <div className="section-tools">
            {events.datasetDate && <span className="dataset-date">FDA data as of {events.datasetDate}</span>}
            <button className="icon-button small" onClick={exportEvents} disabled={!newEvents.length} aria-label="Export adverse events CSV" title="Download this section as CSV"><ArrowDownToLine size={15} /></button>
          </div>
        </div>
        {events.status === "error" && <div className="section-error"><CircleAlert size={15} /> {events.error}</div>}
        {events.status === "done" && !newEvents.length && (
          <div className="section-empty">
            None in the last {days} days.
            {events.rows[0] && <> Most recent: <b>{events.rows[0].received}</b> — {events.rows[0].brand} ({events.rows[0].code}).</>}
          </div>
        )}
        {!!newEvents.length && (
          <div className="table-wrap">
            <table className="m-table">
              <thead><tr><th>Received</th><th>Type</th><th>Brand</th><th>Manufacturer</th><th>Code</th></tr></thead>
              <tbody>
                {newEvents.map((row, i) => (
                  <tr key={`${row.reportKey || row.received}-${i}`}>
                    <td className="date-cell">{row.received}</td>
                    <td><span className={`event-type ${eventTypeClass(row.eventType)}`}>{row.eventType}</span></td>
                    <td><b>{row.brand}</b></td>
                    <td>{row.manufacturer}</td>
                    <td><span className="code-pill">{row.code}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="section-note">
          Showing the latest {Math.min(events.rows.length, FETCH_LIMIT)} of {events.total.toLocaleString()} reports on record.
          MAUDE entries are raw reports, not confirmed device problems, and recent months arrive with a lag.
        </div>
      </section>
    </main>
  );
}
