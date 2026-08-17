"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CalendarClock,
  Check,
  CircleAlert,
  ExternalLink,
  Landmark,
  Link2,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { DEFAULT_MDALL_PRESET, MDALL_PRESETS, getMdallPreset } from "./mdall-config";
import {
  MDALL_SOURCE_LABEL,
  mdallLicencesInWindow,
  mdallLocation,
  mdallSearchUrl,
  mdallSourcePresentation,
  type MdallLicence,
  type MdallSearchResult,
} from "./mdall-core";
import { clearMdallCache, searchMdall } from "./mdall-service";
import { downloadCsv } from "./fda-shared";

const WINDOWS = [30, 90, 180, 365, 730];

function initialMonitorState() {
  const preset = getMdallPreset(DEFAULT_MDALL_PRESET);
  const fallback = { query: "", days: 365, presetId: preset?.id || "", companyIds: preset?.companyIds || [] as number[] };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const requestedPreset = getMdallPreset(params.get("preset"));
  const query = params.get("q") || "";
  const companyIds = params.get("company") ? params.get("company")!.split(",").map(Number).filter((id) => Number.isFinite(id)) : [];
  const activePreset = requestedPreset || (!query && !companyIds.length && !params.has("preset") ? preset : undefined);
  const requestedDays = Number(params.get("days"));
  return {
    query,
    days: WINDOWS.includes(requestedDays) ? requestedDays : 365,
    presetId: activePreset?.id || "",
    companyIds: companyIds.length ? companyIds : activePreset?.companyIds || [],
  };
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function MdallMonitorPage() {
  const [initial] = useState(initialMonitorState);
  const [query, setQuery] = useState(initial.query);
  const [days, setDays] = useState(initial.days);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [companyIds, setCompanyIds] = useState<number[]>(initial.companyIds);
  const [licences, setLicences] = useState<MdallLicence[]>([]);
  const [searchMeta, setSearchMeta] = useState<MdallSearchResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const request = useRef<AbortController | null>(null);
  const officialSearch = mdallSearchUrl("active");

  const cutoff = useMemo(() => cutoffIso(days), [days]);
  const recentIssued = useMemo(() => mdallLicencesInWindow(licences, cutoff, "issuedAt"), [cutoff, licences]);
  const recentEnded = useMemo(() => mdallLicencesInWindow(licences, cutoff, "endDate"), [cutoff, licences]);
  const higherClass = useMemo(() => recentIssued.filter((licence) => (licence.riskClass || 0) >= 3), [recentIssued]);

  const update = useCallback(async (force = false) => {
    if (!query.trim() && !companyIds.length) {
      setError("Add a company name or use a Health Canada watch scope.");
      setStatus("idle");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    setError("");
    if (force) clearMdallCache();
    const params = new URLSearchParams({ days: String(days) });
    if (query) params.set("q", query);
    if (presetId) params.set("preset", presetId);
    if (companyIds.length && !presetId) params.set("company", companyIds.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    try {
      const next = await searchMdall({
        query,
        mode: query.trim() ? "auto" : "company",
        state: "both",
        companyIds: query.trim() ? undefined : companyIds,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setLicences(next.licences);
      setSearchMeta(next);
      setRetrievedAt(new Date(next.retrievedAt));
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setLicences([]);
      setError(caught instanceof Error ? caught.message : "The Health Canada MDALL source could not be reached.");
      setStatus("error");
    }
  }, [companyIds, days, presetId, query]);

  useEffect(() => {
    if (initial.query || initial.companyIds.length) queueMicrotask(() => update());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => downloadCsv([
    ["monitoring_window_days", "first_issued", "end_date", "licence_number", "licence_name", "company_name", "company_id", "risk_class", "licence_status", "licence_type", "source", "retrieved_at"],
    ...recentIssued.map((licence) => [days, licence.issuedAt || "", licence.endDate || "", licence.licenceNumber, licence.licenceName, licence.companyName || "", licence.companyId || "", licence.riskClassLabel, licence.licenceStatusLabel, licence.licenceType || "", "Health Canada MDALL", licence.retrievedAt]),
  ], `mdall-monitoring-${days}-days-${new Date().toISOString().slice(0, 10)}.csv`);

  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const sourcePresentation = mdallSourcePresentation(!!retrievedAt);

  return (
    <main>
      <SourceNav source="hc" view="monitoring" status={sourcePresentation.status} statusState={retrievedAt ? "connected" : "ready"} />

      <section className="hero monitor-hero" id="top">
        <div className="eyebrow"><span>01</span> REGULATORY MONITORING</div>
        <div className="hero-grid">
          <div>
            <h1>What changed.<br /><em>In Canada.</em></h1>
            <p>Recent Health Canada MDALL licence activity for a company or watch scope.</p>
            <div className="hero-actions">
              <a className="primary" href={officialSearch} target="_blank" rel="noreferrer">Open official MDALL search <ExternalLink size={14} /></a>
            </div>
          </div>
          <div className="dataset-note"><Landmark size={20} /><div><b>Health Canada MDALL</b><span>{retrievedAt ? sourcePresentation.note : "Recent licence activity"}</span><span>{searchMeta?.lastRefreshAt ? `MDALL last refreshed ${displayDate(searchMeta.lastRefreshAt)}` : retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${MDALL_SOURCE_LABEL}`}</span></div></div>
        </div>
      </section>

      <section className="monitor-controls" aria-label="Health Canada MDALL monitoring controls">
        <label className="field monitor-window"><span>Watchlist</span><select value={presetId} onChange={(event) => { const nextPreset = getMdallPreset(event.target.value); if (nextPreset) window.location.assign(`${window.location.pathname}?preset=${encodeURIComponent(nextPreset.id)}&days=${days}`); else { setPresetId(""); setCompanyIds([]); } }}><option value="">Custom</option>{MDALL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <label className="field monitor-codes"><span>Company, licence or device</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPresetId(""); }} placeholder="SONOVA, licence name, or identifier…" onKeyDown={(event) => event.key === "Enter" && update()} /></label>
        <label className="field monitor-window"><span>Window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{WINDOWS.map((window) => <option key={window} value={window}>{window === 730 ? "Last 2 years" : `Last ${window} days`}</option>)}</select></label>
        <div className="monitor-actions">
          <button className="primary" onClick={() => update()} disabled={status === "loading"}><RefreshCw className={status === "loading" ? "spin" : ""} size={15} /> Update</button>
          <button className="icon-button" onClick={async () => { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }} aria-label="Copy shareable MDALL monitoring URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
          <a className="primary" href={officialSearch} target="_blank" rel="noreferrer">Open MDALL <ExternalLink size={14} /></a>
        </div>
        <small className="monitor-refreshed">Source: {MDALL_SOURCE_LABEL}{searchMeta?.lastRefreshAt ? ` · MDALL last refreshed ${displayDate(searchMeta.lastRefreshAt)}` : retrievedAt ? ` · pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : ""} · activity uses first-issued and end dates, not snapshot change detection</small>
      </section>

      {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Monitoring scope needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="stat-tiles" aria-label="MDALL monitoring summary">
        <article className="stat-tile"><CalendarClock size={21} /><div><b>{status === "loading" ? "…" : recentIssued.length.toLocaleString()}</b><span>Licences first issued</span></div></article>
        <article className="stat-tile"><TriangleAlert size={21} /><div><b>{status === "loading" ? "…" : recentEnded.length.toLocaleString()}</b><span>Licences ended</span></div></article>
        <article className="stat-tile"><Landmark size={21} /><div><b>{status === "loading" ? "…" : higherClass.length.toLocaleString()}</b><span>Class III / IV issued</span></div></article>
      </section>

      <section className="monitor-section" aria-label="Recent MDALL licences">
        <div className="section-head"><h2><Landmark size={17} /> Recent MDALL licences</h2><div className="section-tools"><span className={`section-count ${status === "loading" ? "loading" : status === "error" ? "error" : ""}`}>{status === "loading" ? <LoaderCircle className="spin" size={12} /> : status === "error" ? "error" : `${recentIssued.length} in window`}</span>{retrievedAt && <span className="dataset-date">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</span>}<button className="icon-button small" onClick={exportCsv} disabled={!recentIssued.length} aria-label="Download recent MDALL licences"><ArrowDownToLine size={14} /></button></div></div>
        {status === "idle" && !companyIds.length && !query && <div className="section-empty"><b>Add a Health Canada monitoring scope.</b> Use a company name or the Sonova MDALL preset, then select Update.</div>}
        {status === "loading" && <div className="section-empty"><LoaderCircle className="spin" size={14} /> Checking Health Canada MDALL licences…</div>}
        {status === "error" && <div className="section-error"><CircleAlert size={15} /> {error}</div>}
        {status === "done" && !recentIssued.length && <div className="section-empty"><b>None first issued in the last {days} days.</b> {licences.length ? ` ${licences.length} licence${licences.length === 1 ? "" : "s"} were returned outside this window.` : " No MDALL licences were returned for this scope."}</div>}
        {recentIssued.length > 0 && <div className="table-wrap"><table className="m-table"><thead><tr><th>Issued</th><th>Licence</th><th>Company</th><th>Class / status</th><th>Source</th></tr></thead><tbody>{recentIssued.map((licence) => <tr key={`${licence.licenceNumber}-${licence.issuedAt}`}><td className="date-cell">{displayDate(licence.issuedAt)}</td><td><a href={`/hc/explorer?q=${encodeURIComponent(String(licence.licenceNumber))}&mode=licenceNumber`} className="fcc-id">{licence.licenceNumber}</a><span>{licence.licenceName}</span></td><td><a href={`/hc/explorer?q=${encodeURIComponent(licence.companyName || String(licence.companyId || ""))}&mode=company`}>{licence.companyName || "—"}</a><span>{licence.companyId ? `ID ${licence.companyId}` : mdallLocation(licence.company)}</span></td><td className="wrap-cell"><b>{licence.riskClassLabel}</b><span>{licence.licenceStatusLabel}</span></td><td><a className="ext-link" href={officialSearch} target="_blank" rel="noreferrer">MDALL search <ExternalLink size={11} /></a></td></tr>)}</tbody></table></div>}
        <div className="section-note">Recent activity means licences whose first-issued date falls inside the selected window. This is not a claim that MDALL published a change-log or that older licences were modified.</div>
      </section>

      <section className="monitor-section" aria-label="Ended MDALL licences">
        <div className="section-head"><h2><RefreshCw size={17} /> Ended or archived licences</h2><div className="section-tools"><span className="section-count">{recentEnded.length} in window</span></div></div>
        {!recentEnded.length ? <div className="section-empty"><b>No MDALL end dates in this window.</b> This section only includes licences that carry an MDALL end or cancellation date.</div> : <div className="table-wrap"><table className="m-table"><thead><tr><th>End date</th><th>Licence</th><th>Company</th><th>Status</th></tr></thead><tbody>{recentEnded.map((licence) => <tr key={`${licence.licenceNumber}-end`}><td>{displayDate(licence.endDate)}</td><td><a href={`/hc/explorer?q=${encodeURIComponent(String(licence.licenceNumber))}&mode=licenceNumber`} className="fcc-id">{licence.licenceNumber}</a></td><td>{licence.companyName || "—"}</td><td>{licence.licenceStatusLabel}</td></tr>)}</tbody></table></div>}
        <div className="section-note">Cancelled, discontinued and other archived statuses come from the official MDALL licence-status codes.</div>
      </section>
    </main>
  );
}
