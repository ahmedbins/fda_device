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
import { FCC_SEARCH_URL, FCC_SOURCE_LABEL, fccLocation, fccRecordsInWindow, parseFccScopes, type NormalizedFccRecord } from "./fcc-core";
import { clearFccCache, searchFcc } from "./fcc-service";
import { downloadCsv } from "./fda-shared";

const WINDOWS = [30, 90, 180, 365];

function initialMonitorState() {
  const fallback = { scopes: [] as string[], days: 90 };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const scopes = parseFccScopes(params.get("ids") || "");
  const requestedDays = Number(params.get("days"));
  return { scopes, days: WINDOWS.includes(requestedDays) ? requestedDays : 90 };
}

function syncMonitorUrl(scopes: string[], days: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (scopes.length) params.set("ids", scopes.join(","));
  params.set("days", String(days));
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
  const [records, setRecords] = useState<NormalizedFccRecord[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [retrievedAt, setRetrievedAt] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  const cutoff = useMemo(() => cutoffIso(days), [days]);
  const recent = useMemo(() => fccRecordsInWindow(records, cutoff), [records, cutoff]);
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
    syncMonitorUrl(nextScopes, days);
    if (force) clearFccCache(nextScopes);
    try {
      const next = await searchFcc(nextScopes, controller.signal);
      if (controller.signal.aborted) return;
      setRecords(next);
      setRetrievedAt(new Date());
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setRecords([]);
      setError(caught instanceof Error ? caught.message : "The FCC Equipment Authorization source could not be reached.");
      setStatus("error");
    }
  }, [days, scopes]);

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

  const exportCsv = () => downloadCsv([
    ["fcc_authorization_date", "fcc_id", "fcc_grantee", "fcc_application_purpose", "fcc_grantee_location", "source", "retrieved_at"],
    ...recent.map((record) => [record.authorizationDate || "", record.fccId, record.granteeName || "", record.applicationPurpose || "", fccLocation(record) === "—" ? "" : fccLocation(record), "FCC", record.retrievedAt]),
  ], `fcc-monitoring-${days}-days-${new Date().toISOString().slice(0, 10)}.csv`);

  const copyLink = async () => {
    syncMonitorUrl(scopes, days);
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const navStatus = status === "error" ? "FCC SOURCE UNAVAILABLE" : retrievedAt ? "FCC API CONNECTED" : "FCC SOURCE READY";

  return (
    <main>
      <SourceNav source="fcc" view="monitoring" status={navStatus} statusState={status === "error" ? "error" : retrievedAt ? "connected" : "ready"} />

      <section className="hero monitor-hero" id="top">
        <div className="eyebrow"><span>01</span> REGULATORY MONITORING</div>
        <div className="hero-grid"><div><h1>What changed.<br /><em>At a glance.</em></h1><p>Recent FCC equipment authorization activity for your monitored FCC IDs and grantees.</p></div><div className="dataset-note"><RadioTower size={20} /><div><b>FCC equipment authorization</b><span>Recent authorization activity</span><span>{retrievedAt ? `Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : `Source: ${FCC_SOURCE_LABEL}`}</span></div></div></div>
      </section>

      <section className="monitor-controls" aria-label="FCC monitoring controls">
        <div className="field monitor-codes">
          <span>FCC IDs, prefixes or grantee codes</span>
          <div className="chip-input" onClick={() => input.current?.focus()}>
            {scopes.map((scope) => <span key={scope} className="chip">{scope}<button type="button" onClick={(event) => { event.stopPropagation(); setScopes((current) => current.filter((item) => item !== scope)); }} aria-label={`Remove ${scope}`}><X size={11} /></button></span>)}
            <input ref={input} value={scopeDraft} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) commitScopes(value); else setScopeDraft(value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 19)); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateNow(); } }} placeholder="Add FCC ID or prefix…" />
          </div>
        </div>
        <label className="field monitor-window"><span>Window</span><select value={days} onChange={(event) => { const next = Number(event.target.value); setDays(next); syncMonitorUrl(scopes, next); }}>{WINDOWS.map((window) => <option key={window} value={window}>Last {window} days</option>)}</select></label>
        <div className="monitor-actions"><button className="primary" onClick={updateNow} disabled={status === "loading"}><RefreshCw className={status === "loading" ? "spin" : ""} size={15} /> Update</button><button className="icon-button" onClick={copyLink} aria-label="Copy shareable FCC monitoring URL" title="Copy shareable URL">{linkCopied ? <Check size={16} /> : <Link2 size={16} />}</button></div>
        <small className="monitor-refreshed">Source: {FCC_SOURCE_LABEL}{retrievedAt ? ` · Pulled ${retrievedAt.toLocaleString([], dateTimeFormat)}` : ""} · activity is based on FCC grant dates, not snapshot change detection</small>
      </section>

      {error && <div className="error-banner"><CircleAlert size={18} /><div><b>{status === "error" ? "FCC service unavailable" : "Monitoring scope needed"}</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="stat-tiles fcc-stat-tiles" aria-label="FCC monitoring summary">
        <article className="stat-tile"><CalendarClock size={21} /><div><b>{status === "loading" ? "…" : recent.length.toLocaleString()}</b><span>Recent authorizations</span></div></article>
      </section>

      <section className="monitor-section" aria-label="Recent FCC authorizations">
        <div className="section-head"><h2><RadioTower size={17} /> Recent FCC authorizations</h2><div className="section-tools"><span className={`section-count ${status === "loading" ? "loading" : status === "error" ? "error" : ""}`}>{status === "loading" ? <LoaderCircle className="spin" size={12} /> : status === "error" ? "error" : `${recent.length} in window`}</span>{retrievedAt && <span className="dataset-date">Pulled {retrievedAt.toLocaleString([], dateTimeFormat)}</span>}<button className="icon-button small" onClick={exportCsv} disabled={!recent.length} aria-label="Download recent FCC authorizations"><ArrowDownToLine size={14} /></button></div></div>

        {status === "idle" && !scopes.length && <div className="section-empty"><b>Add an FCC monitoring scope.</b> Use a complete FCC ID, an FCC-ID prefix, or a complete grantee code, then select Update.</div>}
        {status === "loading" && <div className="section-empty"><LoaderCircle className="spin" size={14} /> Checking approved FCC authorization records…</div>}
        {status === "error" && <div className="section-error"><CircleAlert size={15} /> {error}</div>}
        {status === "done" && !recent.length && <div className="section-empty"><b>None in the last {days} days.</b>{mostRecentOutside ? ` Most recent: ${displayDate(mostRecentOutside.authorizationDate)} — ${mostRecentOutside.fccId} — ${mostRecentOutside.granteeName || "grantee unavailable"}.` : " No dated authorization activity was returned for this scope."}</div>}
        {recent.length > 0 && <div className="table-wrap"><table className="m-table"><thead><tr><th>Date</th><th>FCC ID</th><th>Grantee</th><th>Application purpose</th><th>Source</th></tr></thead><tbody>{recent.map((record, index) => <tr key={`${record.fccId}-${record.authorizationDate}-${index}`}><td className="date-cell">{displayDate(record.authorizationDate)}</td><td><b className="fcc-id">{record.fccId}</b></td><td><b>{record.granteeName || "—"}</b><span>{fccLocation(record)}</span></td><td className="wrap-cell">{record.applicationPurpose || "—"}</td><td><a className="ext-link" href={FCC_SEARCH_URL} target="_blank" rel="noreferrer">FCC EAS <ExternalLink size={11} /></a></td></tr>)}</tbody></table></div>}
        <div className="section-note">Recent activity means records with an FCC-reported grant date inside the selected window. This MVP does not claim to detect modifications or changes between snapshots.</div>
      </section>
    </main>
  );
}
