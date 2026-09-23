"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Award,
  CalendarClock,
  Check,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { DEFAULT_IECEE_PRESET, IECEE_PRESETS, getIeceePreset, presetForQuery } from "./iecee-config";
import {
  EMPTY_IECEE_FILTERS,
  IECEE_CATEGORIES,
  IECEE_PUBLIC_SEARCH_URL,
  IECEE_SOURCE_LABEL,
  ieceeCategoryLabel,
  ieceeCategoryName,
  ieceeCertificatesInWindow,
  ieceeSourcePresentation,
  normalizeIeceeFilters,
  parseIeceeQuery,
  type IeceeCertificate,
  type IeceeSearchResult,
} from "./iecee-core";
import { IECEE_MAX_PAGE } from "./iecee-relay";
import { clearIeceeCache, searchIecee } from "./iecee-service";
import { downloadExcel } from "./excel-export";

const WINDOWS = [30, 90, 180, 365, 730];

function initialMonitorState() {
  const preset = getIeceePreset(DEFAULT_IECEE_PRESET);
  const fallback = { query: preset?.query || "", days: 365, presetId: preset?.id || "", category: "" };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const requestedPreset = getIeceePreset(params.get("preset"));
  const query = parseIeceeQuery(params.get("q") || "");
  const category = (params.get("cat") || "").toUpperCase();
  const activePreset = requestedPreset || (!query && !params.has("preset") ? preset : undefined);
  const requestedDays = Number(params.get("days"));
  return {
    query: query || activePreset?.query || "",
    days: WINDOWS.includes(requestedDays) ? requestedDays : 365,
    presetId: activePreset?.id || presetForQuery(query)?.id || "",
    category: IECEE_CATEGORIES[category] ? category : "",
  };
}

/** First local calendar day of a "last N days" window that includes today. */
function cutoffIso(days: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).toLocaleDateString("en-CA");
}

function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function explorerLink(query: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ q: query, ...extra });
  return `/iecee/explorer?${params}`;
}

export default function IeceeMonitorPage() {
  const [initial] = useState(initialMonitorState);
  const [query, setQuery] = useState(initial.query);
  const [days, setDays] = useState(initial.days);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [category, setCategory] = useState(initial.category);
  const [issued, setIssued] = useState<IeceeSearchResult | null>(null);
  const [updated, setUpdated] = useState<IeceeSearchResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [activeCutoff, setActiveCutoff] = useState(() => cutoffIso(initial.days));
  // The window the loaded rows were fetched for; the select can change before Update is pressed.
  const [appliedDays, setAppliedDays] = useState(initial.days);
  const [linkCopied, setLinkCopied] = useState(false);
  const request = useRef<AbortController | null>(null);

  const recentIssued = useMemo(() => issued?.certificates || [], [issued]);
  const issuedIds = useMemo(() => new Set(recentIssued.map((certificate) => certificate.id)), [recentIssued]);
  const recentUpdated = useMemo(() => ieceeCertificatesInWindow(updated?.certificates || [], activeCutoff, "updatedAt"), [activeCutoff, updated]);
  const modified = useMemo(() => recentUpdated.filter((certificate) => !issuedIds.has(certificate.id)), [issuedIds, recentUpdated]);
  const stopped = useMemo(() => recentUpdated.filter((certificate) => certificate.status !== "VALID"), [recentUpdated]);
  const bodies = useMemo(() => new Set(recentIssued.map((certificate) => certificate.ncb).filter(Boolean)).size, [recentIssued]);
  const updatedTruncated = !!updated && updated.certificates.length >= IECEE_MAX_PAGE && recentUpdated.length === updated.certificates.length;

  const update = useCallback(async (force = false) => {
    const cleanQuery = parseIeceeQuery(query);
    if (!cleanQuery) {
      setError("Add a manufacturer, trademark or product text, or pick an IECEE watch scope.");
      setStatus("idle");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    setError("");
    if (force) clearIeceeCache();
    const cutoff = cutoffIso(days);
    setActiveCutoff(cutoff);
    setAppliedDays(days);
    const params = new URLSearchParams({ days: String(days) });
    if (presetId) params.set("preset", presetId);
    else params.set("q", cleanQuery);
    if (category) params.set("cat", category);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    const filters = normalizeIeceeFilters({ ...EMPTY_IECEE_FILTERS, query: cleanQuery, categories: category ? [category] : [] });
    try {
      const [issuedPage, updatedPage] = await Promise.all([
        searchIecee({ filters: { ...filters, issuedFrom: cutoff, issuedTo: todayIso() }, size: IECEE_MAX_PAGE, sort: "issued-desc", signal: controller.signal, fresh: force }),
        searchIecee({ filters, size: IECEE_MAX_PAGE, sort: "updated-desc", signal: controller.signal, fresh: force }),
      ]);
      if (controller.signal.aborted) return;
      setIssued(issuedPage);
      setUpdated(updatedPage);
      setRetrievedAt(new Date(issuedPage.retrievedAt));
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setIssued(null);
      setUpdated(null);
      setError(caught instanceof Error ? caught.message : "The IECEE certificate index could not be reached.");
      setStatus("error");
    }
  }, [category, days, presetId, query]);

  useEffect(() => {
    if (initial.query) queueMicrotask(() => update());
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportWorkbook = () => downloadExcel({
    filename: `iecee-monitoring-${appliedDays}-days-${new Date().toLocaleDateString("en-CA")}.xlsx`,
    sheetName: "IECEE monitoring",
    columns: [
      { header: "Window (days)", type: "number", width: 14 },
      { header: "Activity", width: 14 },
      { header: "Issue date", type: "date", width: 14 },
      { header: "Last updated", type: "date", width: 14 },
      { header: "Certificate number", width: 22 },
      { header: "Certificate type", width: 24 },
      { header: "Status", width: 12 },
      { header: "Manufacturer", width: 32 },
      { header: "Trademark", width: 22 },
      { header: "Product", width: 40 },
      { header: "Product categories", width: 24 },
      { header: "Base standards", width: 34 },
      { header: "Certification body", width: 34 },
      { header: "Certificate link", width: 40 },
      { header: "Source", width: 30 },
    ],
    rows: [
      ...recentIssued.map((certificate) => ["Issued", certificate] as const),
      ...modified.map((certificate) => ["Updated", certificate] as const),
    ].map(([activity, certificate]) => [
      appliedDays,
      activity,
      certificate.issuedAt || "",
      certificate.updatedAt?.slice(0, 10) || "",
      certificate.refNumber,
      certificate.typeLabel,
      certificate.statusLabel,
      certificate.manufacturer,
      certificate.trademark || "",
      certificate.subject,
      certificate.categories.map(ieceeCategoryLabel).join("; "),
      certificate.standards.join("; "),
      certificate.ncb,
      certificate.url,
      IECEE_SOURCE_LABEL,
    ]),
  });

  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const sourcePresentation = ieceeSourcePresentation(!!retrievedAt);
  const windowLabel = appliedDays === 730 ? "last 2 years" : `last ${appliedDays} days`;

  const certificateRow = (certificate: IeceeCertificate, dateField: "issuedAt" | "updatedAt") => (
    <tr key={`${certificate.id}-${dateField}`}>
      <td className="date-cell">{displayDate(certificate[dateField])}</td>
      <td><a href={explorerLink(`"${certificate.refNumber}"`)} className="fcc-id">{certificate.refNumber}</a><span>{certificate.typeLabel}{dateField === "updatedAt" && certificate.issuedAt ? ` · issued ${displayDate(certificate.issuedAt)}` : ""}</span></td>
      <td><a href={explorerLink(`"${certificate.manufacturer}"`)}>{certificate.manufacturer || "—"}</a><span>{certificate.trademark || ""}</span></td>
      <td className="wrap-cell"><b>{certificate.subject || "—"}</b><span>{certificate.categories.map((code) => ieceeCategoryName(code) ? `${code} · ${ieceeCategoryName(code)}` : code).join("; ") || "No category"}{certificate.standards.length ? ` · ${certificate.standards.slice(0, 3).join(", ")}${certificate.standards.length > 3 ? "…" : ""}` : ""}</span></td>
      <td className="wrap-cell"><b>{certificate.ncb || "—"}</b><span className={`iecee-status ${certificate.status.toLowerCase() || "unknown"}`}>{certificate.statusLabel}</span></td>
      <td><a className="ext-link" href={certificate.url} target="_blank" rel="noreferrer">Certificate <ExternalLink size={11} /></a></td>
    </tr>
  );

  return (
    <main>
      <SourceNav source="iecee" view="monitoring" status={sourcePresentation.status} statusState={status === "error" ? "error" : retrievedAt ? "connected" : "ready"} />

      <section className="hero hero-compact monitor-hero" id="top">
        <div className="eyebrow">REGULATORY MONITORING</div>
        <div className="hero-grid">
          <div>
            <h1>What changed. <em>In the CB Scheme.</em></h1>
            <div className="hero-inline">
              <p>Recently issued, updated, cancelled and suspended IECEE certificates for a manufacturer, trademark or watch scope.</p>
              <a className="primary" href={IECEE_PUBLIC_SEARCH_URL} target="_blank" rel="noreferrer">Open IECEE certificate search <ExternalLink size={14} /></a>
            </div>
          </div>
          <div className="dataset-note"><Award size={20} /><div><b>IECEE certificates</b><span>{retrievedAt ? sourcePresentation.note : "Recent certificate activity"}</span><span>{retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${IECEE_SOURCE_LABEL}`}</span></div></div>
        </div>
      </section>

      <section className="monitor-controls" aria-label="IECEE monitoring controls">
        <label className="field monitor-window"><span>Watchlist</span><select value={presetId} onChange={(event) => { const nextPreset = getIeceePreset(event.target.value); if (nextPreset) { setPresetId(nextPreset.id); setQuery(nextPreset.query); } else setPresetId(""); }}><option value="">Custom</option>{IECEE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <label className="field monitor-codes"><span>Manufacturer, trademark or product</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPresetId(presetForQuery(event.target.value)?.id || ""); }} placeholder="sonova, PHONAK, hearing aid charger…" onKeyDown={(event) => event.key === "Enter" && update()} /></label>
        <label className="field monitor-window"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{Object.entries(IECEE_CATEGORIES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <label className="field monitor-window"><span>Window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{WINDOWS.map((window) => <option key={window} value={window}>{window === 730 ? "Last 2 years" : `Last ${window} days`}</option>)}</select></label>
        <div className="monitor-actions">
          <button className="primary" onClick={() => update()} disabled={status === "loading"}><RefreshCw className={status === "loading" ? "spin" : ""} size={15} /> Update</button>
          <button className="icon-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); } catch { /* address bar fallback */ } }} aria-label="Copy shareable IECEE monitoring URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button>
        </div>
        <small className="monitor-refreshed">Source: {IECEE_SOURCE_LABEL}{retrievedAt ? ` · pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : ""} · activity uses IECEE issue dates and last-update timestamps, not snapshot change detection</small>
      </section>

      {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Monitoring scope needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="stat-tiles" aria-label="IECEE monitoring summary">
        <article className="stat-tile"><CalendarClock size={21} /><div><b>{status === "loading" ? "…" : (issued?.total ?? 0).toLocaleString()}</b><span>Certificates issued</span></div></article>
        <article className="stat-tile"><RefreshCw size={21} /><div><b>{status === "loading" ? "…" : modified.length.toLocaleString()}</b><span>Older certificates updated</span></div></article>
        <article className="stat-tile"><TriangleAlert size={21} /><div><b>{status === "loading" ? "…" : stopped.length.toLocaleString()}</b><span>Cancelled or suspended</span></div></article>
        <article className="stat-tile"><ShieldCheck size={21} /><div><b>{status === "loading" ? "…" : bodies.toLocaleString()}</b><span>Certification bodies</span></div></article>
      </section>

      <section className="monitor-section" aria-label="Recent IECEE certificates">
        <div className="section-head"><h2><Award size={17} /> Recently issued certificates</h2><div className="section-tools"><span className={`section-count ${status === "loading" ? "loading" : status === "error" ? "error" : ""}`}>{status === "loading" ? <LoaderCircle className="spin" size={12} /> : status === "error" ? "error" : `${(issued?.total ?? 0).toLocaleString()} in window`}</span>{retrievedAt && <span className="dataset-date">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</span>}<button className="icon-button small" onClick={exportWorkbook} disabled={!recentIssued.length && !modified.length} aria-label="Download recent IECEE certificates as Excel" title="Download Excel"><ArrowDownToLine size={14} /></button></div></div>
        {status === "idle" && !query && <div className="section-empty"><b>Add an IECEE monitoring scope.</b> Use a manufacturer, trademark or product text, or the Sonova watch scope, then select Update.</div>}
        {status === "loading" && <div className="section-empty"><LoaderCircle className="spin" size={14} /> Checking the IECEE certificate index…</div>}
        {status === "error" && <div className="section-error"><CircleAlert size={15} /> {error}</div>}
        {status === "done" && !recentIssued.length && <div className="section-empty"><b>None issued in the {windowLabel}.</b> {updated?.total ? ` ${updated.total.toLocaleString()} certificate${updated.total === 1 ? "" : "s"} match this scope outside the window.` : " No IECEE certificates matched this scope."}</div>}
        {recentIssued.length > 0 && <div className="table-wrap"><table className="m-table"><thead><tr><th>Issued</th><th>Certificate</th><th>Manufacturer</th><th>Product</th><th>Certification body</th><th>Source</th></tr></thead><tbody>{recentIssued.map((certificate) => certificateRow(certificate, "issuedAt"))}</tbody></table></div>}
        {!!issued && issued.total > recentIssued.length && <div className="section-note">Showing the {recentIssued.length.toLocaleString()} most recent of {issued.total.toLocaleString()} certificates issued in the window. Narrow the scope or open the Explorer for the full list.</div>}
        <div className="section-note">Recent activity means certificates whose IECEE issue date falls inside the selected window. This is not a claim that IECEE published a change-log; amendments and modifications appear as new certificate numbers (for example -A1 or /M1).</div>
      </section>

      <section className="monitor-section" aria-label="Updated IECEE certificates">
        <div className="section-head"><h2><RefreshCw size={17} /> Older certificates updated</h2><div className="section-tools"><span className="section-count">{modified.length} in window</span></div></div>
        {!modified.length ? <div className="section-empty"><b>No older certificates were updated in the {windowLabel}.</b> This list uses the last-update timestamp IECEE records on each certificate.</div> : <div className="table-wrap"><table className="m-table"><thead><tr><th>Updated</th><th>Certificate</th><th>Manufacturer</th><th>Product</th><th>Certification body</th><th>Source</th></tr></thead><tbody>{modified.map((certificate) => certificateRow(certificate, "updatedAt"))}</tbody></table></div>}
        {updatedTruncated && <div className="section-note">Only the {IECEE_MAX_PAGE.toLocaleString()} most recently updated certificates were checked, and all of them fall inside the window — narrow the scope to see every update.</div>}
        <div className="section-note">IECEE updates the timestamp when a certificate is edited or its status changes; the public record does not say what changed.</div>
      </section>

      <section className="monitor-section" aria-label="Cancelled or suspended IECEE certificates">
        <div className="section-head"><h2><TriangleAlert size={17} /> Cancelled or suspended</h2><div className="section-tools"><span className="section-count">{stopped.length} in window</span></div></div>
        {!stopped.length ? <div className="section-empty"><b>No cancellations or suspensions recorded in the {windowLabel}.</b> Only certificates whose status is not Valid and whose last update falls inside the window appear here.</div> : <div className="table-wrap"><table className="m-table"><thead><tr><th>Updated</th><th>Certificate</th><th>Manufacturer</th><th>Status</th></tr></thead><tbody>{stopped.map((certificate) => <tr key={`${certificate.id}-stopped`}><td className="date-cell">{displayDate(certificate.updatedAt)}</td><td><a href={explorerLink(`"${certificate.refNumber}"`)} className="fcc-id">{certificate.refNumber}</a><span>{certificate.subject}</span></td><td>{certificate.manufacturer || "—"}</td><td><span className={`iecee-status ${certificate.status.toLowerCase() || "unknown"}`}>{certificate.statusLabel}</span></td></tr>)}</tbody></table></div>}
        <div className="section-note">Statuses come from the IECEE certificate record. The cancellation reason, when one is published, is shown in the certificate drawer of the Explorer.</div>
      </section>
    </main>
  );
}
