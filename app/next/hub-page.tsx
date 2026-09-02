"use client";

import { useEffect, useState } from "react";
import { Activity, Ear, FileSearch, Layers, Radio, Search, ShieldCheck } from "lucide-react";
import { API, PRESET_CODES, fetchOpenFda } from "../fda-shared";
import { NextShell } from "./shell";
import "./next.css";

export default function HubPage() {
  const [fdaMeta, setFdaMeta] = useState<{ updated?: string; total?: number } | null>(null);

  useEffect(() => {
    fetchOpenFda(`${API}?limit=1`)
      .then((data) => setFdaMeta({ updated: data.meta?.last_updated, total: data.meta?.results?.total }))
      .catch(() => setFdaMeta({}));
  }, []);

  const presetQuery = `codes=${PRESET_CODES.join(",")}`;

  return (
    <NextShell active="hub">
      <div className="nx-hub">
        <div className="nx-hub-head">
          <span className="nx-eyebrow">Design preview</span>
          <h1>One workbench for public regulatory records.</h1>
          <p>
            Search FDA registrations and listings, FCC equipment authorizations and Health Canada licences, open any record
            without losing your place, and export exactly what you filtered. The query lives in the URL, so a view is always shareable.
          </p>
        </div>

        <div className="nx-cards">
          <article className="nx-card">
            <h2><FileSearch size={17} /> FDA</h2>
            <p>Registration and listing records from openFDA, plus 510(k) clearances, recalls and adverse events in Monitoring.</p>
            <span className="meta">
              {fdaMeta === null && "Contacting openFDA…"}
              {fdaMeta && fdaMeta.total && <><b>{fdaMeta.total.toLocaleString()}</b> listings · FDA data as of {fdaMeta.updated}</>}
              {fdaMeta && !fdaMeta.total && "openFDA live"}
            </span>
            <div className="links">
              <a className="nx-btn primary" href="/next/fda/workspace"><Search size={13} /> Open workspace</a>
              <a className="nx-btn" href="/next/fda/explorer">Explorer preview</a>
            </div>
          </article>
          <article className="nx-card">
            <h2><Radio size={17} /> FCC</h2>
            <p>Equipment Authorization records for confirmed grantee scopes, with authorization history, exhibits and evidence.</p>
            <span className="meta">Official snapshot and live FCC ID lookups · opens in the current design</span>
            <div className="links">
              <a className="nx-btn" href="/fcc/explorer"><Search size={13} /> Explorer</a>
              <a className="nx-btn" href="/fcc/monitoring"><Activity size={13} /> Monitoring</a>
            </div>
          </article>
          <article className="nx-card">
            <h2><ShieldCheck size={17} /> Health Canada</h2>
            <p>MDALL licences, companies, device names and identifiers from the official Health Canada API.</p>
            <span className="meta">MDALL live · opens in the current design</span>
            <div className="links">
              <a className="nx-btn" href="/hc/explorer"><Search size={13} /> Explorer</a>
              <a className="nx-btn" href="/hc/monitoring"><Activity size={13} /> Monitoring</a>
            </div>
          </article>
        </div>

        <div className="nx-section-title">Quick starts</div>
        <div className="nx-quick">
          <a href={`/next/fda/workspace?${presetQuery}`}>
            <b><Ear size={12} /> Hearing-aid competitors</b>
            <span>The six codes the team tracks: <code>{PRESET_CODES.join(" · ")}</code>. Overview, companies, listings, timeline and changes.</span>
          </a>
          <a href="/next/fda/workspace?codes=QDD,QUH&match=all&tab=companies">
            <b><Layers size={12} /> Same-listing self-fitting aids</b>
            <span>Listings that carry <code>QDD</code> and <code>QUH</code> on the same FDA filing.</span>
          </a>
          <a href="/next/fda/workspace?kw=Sonova&tab=companies">
            <b><Search size={12} /> Sonova listings</b>
            <span>Every establishment or device record that names Sonova.</span>
          </a>
          <a href={`/next/fda/workspace?${presetQuery}&tab=changes&days=30`}>
            <b><Activity size={12} /> What changed in 30 days</b>
            <span>New listings, 510(k)s, recalls and MAUDE reports for the six codes, inside the workspace.</span>
          </a>
        </div>

        <div className="nx-section-title">What changed in this design</div>
        <div className="nx-principles">
          <div><b>A scope, not a search</b><span>Define the codes, country and keyword once. Overview, Companies, Listings, Timeline and Changes all answer that one scope, instantly.</span></div>
          <div><b>Persistent rail</b><span>All six workflows are one click away on the left, so switching between FDA, FCC and Health Canada never loses context.</span></div>
          <div><b>Companies are first-class</b><span>A competitor roster with coverage per code, establishments, trade names and 510(k)s. Pin up to four and compare them side by side.</span></div>
          <div><b>Analysis the old site cannot do</b><span>Market stats, listings by year and code, new-entrant detection, client-side sorting and filtering, and saved scopes.</span></div>
          <div><b>Freshness in the status bar</b><span>Dataset vintage, pull time and paging live in a slim bar at the bottom, always visible, never in the way.</span></div>
          <div><b>Guided starts</b><span>Empty states offer the starting points the team actually uses instead of a blank search.</span></div>
        </div>

        <div className="nx-note">
          Only this hub, the FDA Workspace and the earlier FDA Explorer preview use the new design so far. Every other link opens the current pages, and nothing on the main site has changed.
        </div>
      </div>
    </NextShell>
  );
}
