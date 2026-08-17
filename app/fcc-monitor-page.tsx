"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CalendarClock,
  Check,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  X,
} from "lucide-react";
import SourceNav from "./source-nav";
import { DEFAULT_FCC_PRESET, FCC_PRESETS, getFccPreset } from "./fcc-config";
import { FCC_EAS_API, FCC_SEARCH_URL, FCC_SOURCE_LABEL, fccLocation, fccRecordsInWindow, fccSourcePresentation, parseFccScopes, type FccSearchResult, type NormalizedFccRecord } from "./fcc-core";
import { fccPublicRecordUrl } from "./fcc-index";
import { clearFccCache, searchFcc } from "./fcc-service";
import { downloadExcel } from "./excel-export";

const WINDOWS = [30, 90, 180, 365, 730];

function initialMonitorState() {
  const preset = getFccPreset(DEFAULT_FCC_PRESET);
  const fallback = { scopes: preset?.granteeCodes || [] as string[], days: 180, presetId: preset?.id || "" };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const urlScopes = parseFccScopes(params.get("ids") || "");
  const requestedPreset = getFccPreset(params.get("preset"));
  const activePreset = requestedPreset || (!urlScopes.length && !params.has("ids") ? preset : undefined);
  const scopes = urlScopes.length ? urlScopes : activePreset?.granteeCodes || [];
  const requestedDays = Number(params.get("days"));
  return { scopes, days: WINDOWS.includes(requestedDays) ? requestedDays : 180, presetId: activePreset?.id || "" };
}

function syncMonitorUrl(scopes: string[], days: number, presetId = "") {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (scopes.length) params.set("ids", scopes.join(","));
  params.set("days", String(days));
  if (presetId) params.set("preset", presetId);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function FccMonitorPage() {
  const [initial] = useState(initialMonitorState);
  const [scopes, setScopes] = useState<string[]>(initial.scopes);
  const [scopeDraft, setScopeDraft] = useState("");
  const [days, setDays] = useState(initial.days);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [records, setRecords] = useState<NormalizedFccRecord[]>([]);
  const [searchMeta, setSearchMeta] = useState<FccSearchResult | null>(null);
  const [coverageNote, setCoverageNote] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  const cutoff = useMemo(() => cutoffIso(days), [days]);
  const recent = useMemo(() => fccRecordsInWindow(records, cutoff), [records, cutoff]);
  const originalRecent = useMemo(() => recent.filter((record) => record.purposeCategory === "Original authorization"), [recent]);
  const changedRecent = useMemo(() => recent.filter((record) => record.purposeCategory === "Class II permissive change" || record.purposeCategory === "Change in FCC ID"), [recent]);
  const mostRecentOutside = useMemo(() => records
    .filter((record) => !!record.authorizationDate && record.authorizationDate < cutoff)
    .sort((a, b) => (b.authorizationDate || "").localeCompare(a.authorizationDate || ""))[0], [records, cutoff]);

  const update = useCallback(async (force = false, nextScopes = scopes) => {
    if (!nextScopes.length) {
      setError("Add at least one FCC ID, FCC-ID prefix, or complete grantee code to monitor.");
      setStatus("idle");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    setError("");
    setCoverageNote("");
    syncMonitorUrl(nextScopes, days, presetId);
    if (force) clearFccCache(nextScopes);
    try {
      const next = await searchFcc(nextScopes, controller.signal);
      if (controller.signal.aborted) return;
      setRecords(next.records);
      setSearchMeta(next);
      setRetrievedAt(new Date(next.retrievedAt));
      if (next.unresolvedScopes.length) setCoverageNote(`The official bundled snapshot does not cover ${next.unresolvedScopes.join(", ")}. Open the official FCC response from Explorer and import it there to analyze that scope.`);
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setRecords([]);
      setError(caught instanceof Error ? caught.message : "The FCC Equipment Authorization source could not be reached.");
      setStatus("error");
    }
  }, [days, presetId, scopes]);

  useEffect(() => {
    if (initial.scopes.length) queueMicrotask(() => update(false, initial.scopes));
    return () => request.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitScopes = (value: string) => {
    const parsed = parseFccScopes(value);
    if (parsed.length) setScopes((current) => [...new Set([...current, ...parsed])]);
    setScopeDraft("");
  };

  const updateNow = () => {
    const parsed = parseFccScopes(scopeDraft);
    const next = parsed.length ? [...new Set([...scopes, ...parsed])] : scopes;
    if (parsed.length) setScopes(next);
    setScopeDraft("");
    update(false, next);
  };

  const exportWorkbook = () => downloadExcel({
    filename: `fcc-monitoring-${days}-days-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: "FCC monitoring",
    columns: [
      { header: "Window (days)", type: "number", width: 14 },
      { header: "Query scope", width: 18 },
      { header: "Authorization date", type: "date", width: 16 },
      { header: "FCC ID", width: 16 },
      { header: "Grantee", width: 28 },
      { header: "Grantee code", width: 14 },
      { header: "Activity category", width: 24 },
      { header: "FCC-reported purpose", width: 26 },
      { header: "Location", width: 22 },
      { header: "Public FCC ID page", type: "link", width: 20 },
      { header: "Source", width: 12 },
      { header: "Source mode", width: 16 },
    ],
    rows: recent.map((record) => [
      days,
      scopes.join("|"),
      record.authorizationDate || "",
      record.fccId,
      record.granteeName || "",
      record.granteeCode || "",
      record.purposeCategory || "",
      record.applicationPurpose || "",
      fccLocation(record) === "—" ? "" : fccLocation(record),
      { text: record.fccId, url: fccPublicRecordUrl(record.fccId) },
      "FCC",
      record.sourceMode || "",
    ]),
  });

  const copyLink = async () => {
    syncMonitorUrl(scopes, days, presetId);
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const sourcePresentation = fccSourcePresentation(searchMeta?.sourceMode, !!retrievedAt);

  return (
    <main>
      <SourceNav source="fcc" view="monitoring" status={sourcePresentation.status} statusState={retrievedAt ? (searchMeta?.sourceMode === "limited" ? "error" : "connected") : "ready"} />

      <section className="hero hero-compact monitor-hero" id="top">
        <div className="eyebrow"><span>01</span> REGULATORY MONITORING</div>
        <div className="hero-grid"><div><h1>What changed. <em>At a glance.</em></h1><div className="hero-inline"><p>Recent FCC equipment authorization activity for your monitored FCC IDs and grantees.</p><a className="primary" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer">Open FCC Search <ExternalLink size={14} /></a></div></div><div className="dataset-note"><RadioTower size={20} /><div><b>FCC equipment authorization</b><span>{retrievedAt ? sourcePresentation.note : "Recent authorization activity"}</span><span>{searchMeta?.snapshotCapturedAt ? `Captured ${new Date(searchMeta.snapshotCapturedAt).toLocaleString([], dateTimeFormat)}` : retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${FCC_SOURCE_LABEL}`}</span></div></div></div>
      </section>

      <section className="monitor-controls" aria-label="FCC monitoring controls">
        <label className="field monitor-window"><span>Watchlist</span><select value={presetId} onChange={(event) => { const nextPreset = getFccPreset(event.target.value); if (nextPreset) window.location.assign(`${window.location.pathname}?preset=${encodeURIComponent(nextPreset.id)}&days=${days}`); else setPresetId(""); }}><option value="">Custom</option>{FCC_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <div className="field monitor-codes">
          <span>FCC IDs, prefixes or grantee codes</span>
          <div className="chip-input" onClick={() => input.current?.focus()}>
            {scopes.map((scope) => <span key={scope} className="chip">{scope}<button type="button" onClick={(event) => { event.stopPropagation(); setScopes((current) => current.filter((item) => item !== scope)); setPresetId(""); }} aria-label={`Remove ${scope}`}><X size={11} /></button></span>)}
            <input ref={input} value={scopeDraft} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) commitScopes(value); else setScopeDraft(value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 19)); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateNow(); } }} placeholder="Add FCC ID or prefix…" />
          </div>
        </div>
        <label className="field monitor-window"><span>Window</span><select value={days} onChange={(event) => { const next = Number(event.target.value); setDays(next); syncMonitorUrl(scopes, next, presetId); }}>{WINDOWS.map((window) => <option key={window} value={window}>{window === 730 ? "Last 2 years" : `Last ${window} days`}</option>)}</select></label>
        <div className="monitor-actions"><button className="primary" onClick={updateNow} disabled={status === "loading"}><RefreshCw className={status === "loading" ? "spin" : ""} size={15} /> Update</button><button className="icon-button" onClick={copyLink} aria-label="Copy shareable FCC monitoring URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button></div>
        <small className="monitor-refreshed">Source: {FCC_SOURCE_LABEL}{searchMeta?.snapshotCapturedAt ? ` · official snapshot captured ${new Date(searchMeta.snapshotCapturedAt).toLocaleString([], dateTimeFormat)}` : retrievedAt ? ` · pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : ""} · activity is based on FCC grant dates, not snapshot change detection</small>
      </section>

      {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Monitoring scope needs attention</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
      {coverageNote && <div className="coverage-banner"><RadioTower size={18} /><div><b>Official source coverage</b><span>{coverageNote}</span>{searchMeta?.unresolvedScopes[0] && <a href={`${FCC_EAS_API}?fccId=${encodeURIComponent(searchMeta.unresolvedScopes[0])}`} target="_blank" rel="noreferrer">Open official FCC response <ExternalLink size={12} /></a>}</div></div>}

      <section className="stat-tiles fcc-stat-tiles" aria-label="FCC monitoring summary">
        <article className="stat-tile"><CalendarClock size={21} /><div><b>{status === "loading" ? "…" : originalRecent.length.toLocaleString()}</b><span>Original authorizations</span></div></article>
        <article className="stat-tile"><RefreshCw size={21} /><div><b>{status === "loading" ? "…" : changedRecent.length.toLocaleString()}</b><span>Authorization changes</span></div></article>
      </section>

      <section className="monitor-section" aria-label="Recent FCC authorizations">
        <div className="section-head"><h2><RadioTower size={17} /> Recent FCC authorizations</h2><div className="section-tools"><span className={`section-count ${status === "loading" ? "loading" : status === "error" ? "error" : ""}`}>{status === "loading" ? <LoaderCircle className="spin" size={12} /> : status === "error" ? "error" : `${recent.length} in window`}</span>{retrievedAt && <span className="dataset-date">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</span>}<button className="icon-button small" onClick={exportWorkbook} disabled={!recent.length} aria-label="Download recent FCC authorizations as Excel" title="Download Excel"><ArrowDownToLine size={14} /></button></div></div>

        {status === "idle" && !scopes.length && <div className="section-empty"><b>Add an FCC monitoring scope.</b> Use a complete FCC ID, an FCC-ID prefix, or a complete grantee code, then select Update.</div>}
        {status === "loading" && <div className="section-empty"><LoaderCircle className="spin" size={14} /> Checking approved FCC authorization records…</div>}
        {status === "error" && <div className="section-error"><CircleAlert size={15} /> {error}</div>}
        {status === "done" && !recent.length && <div className="section-empty"><b>{searchMeta?.unresolvedScopes.length && !records.length ? "This scope is not in the bundled official snapshot." : `None in the last ${days} days.`}</b>{searchMeta?.unresolvedScopes.length && !records.length ? " An empty window here does not mean the FCC has no activity — import the official response in Explorer to analyze that scope." : mostRecentOutside ? ` Most recent: ${displayDate(mostRecentOutside.authorizationDate)} — ${mostRecentOutside.fccId} — ${mostRecentOutside.granteeName || "grantee unavailable"}.` : " No dated authorization activity was returned for this scope."}</div>}
        {recent.length > 0 && <div className="table-wrap"><table className="m-table"><thead><tr><th>Date</th><th>FCC ID</th><th>Grantee</th><th>Activity</th><th>Source</th></tr></thead><tbody>{recent.map((record, index) => <tr key={`${record.fccId}-${record.authorizationDate}-${index}`}><td className="date-cell">{displayDate(record.authorizationDate)}</td><td><a href={`/fcc/explorer?q=${encodeURIComponent(record.fccId)}`} className="fcc-id">{record.fccId}</a></td><td><a href={`/fcc/explorer?ids=${encodeURIComponent(record.granteeCode || record.fccId)}`}>{record.granteeName || "—"}</a><span>{record.granteeCode || fccLocation(record)}</span></td><td className="wrap-cell"><b>{record.purposeCategory || "Authorization activity"}</b><span>FCC: {record.applicationPurpose || "—"}</span></td><td><a className="open-record-button" href={fccPublicRecordUrl(record.fccId)} target="_blank" rel="noreferrer">Open FCC ID <ExternalLink size={11} /></a></td></tr>)}</tbody></table></div>}
        <div className="section-note">Recent activity means records with an FCC-reported grant date inside the selected window. This MVP does not claim to detect modifications or changes between snapshots.</div>
      </section>

      <section className="monitor-section" aria-label="FCC authorization changes">
        <div className="section-head"><h2><RefreshCw size={17} /> Authorization changes</h2><div className="section-tools"><span className="section-count">{changedRecent.length} in window</span></div></div>
        {!changedRecent.length ? <div className="section-empty"><b>No FCC-reported changes in this window.</b> This section only includes records explicitly labeled by the FCC as a Class II permissive change or change in identification.</div> : <div className="table-wrap"><table className="m-table"><thead><tr><th>Date</th><th>FCC ID</th><th>Grantee</th><th>FCC-reported purpose</th></tr></thead><tbody>{changedRecent.map((record, index) => <tr key={`${record.fccId}-change-${index}`}><td>{displayDate(record.authorizationDate)}</td><td><a href={`/fcc/explorer?q=${encodeURIComponent(record.fccId)}`} className="fcc-id">{record.fccId}</a></td><td>{record.granteeName || "—"}</td><td>{record.applicationPurpose || "—"}</td></tr>)}</tbody></table></div>}
        <div className="section-note">Categories are normalized from the FCC-reported application-purpose value; the original FCC wording remains visible.</div>
      </section>
    </main>
  );
}
