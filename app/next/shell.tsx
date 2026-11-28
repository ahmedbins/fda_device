"use client";

import type { ReactNode } from "react";
import { Activity, ArrowLeft, BookOpen, Compass, FileSearch, Radio, ScrollText, ShieldCheck } from "lucide-react";
import { useDevHost } from "../fda-shared";
import { ThemeControl } from "../theme-control";

export type NextRoute = "hub" | "fda-workspace" | "fda-explorer" | "gazette" | "standards";

type NextShellProps = {
  active: NextRoute;
  children: ReactNode;
  olderDesignHref?: string;
};

export function NextShell({ active, children, olderDesignHref = "/fda/explorer" }: NextShellProps) {
  const devHost = useDevHost();
  return (
    <div className="nx-app">
      <nav className="nx-rail" aria-label="Regulatory sources">
        <div className="nx-rail-header">
          <a className="nx-brand" href="/next">
            <span className="nx-brand-mark">S</span>
            <span><b>SONOVA</b><small>Regulatory Data Hub</small></span>
            {devHost && <em className="nx-dev">DEV</em>}
          </a>
          {import.meta.env.MODE === "internal" && (
            <a className="nx-older-design" href={olderDesignHref}>
              <ArrowLeft size={14} aria-hidden="true" /> Older design
            </a>
          )}
        </div>
        <div className="nx-rail-section-title">Data sources</div>
        <div className="nx-rail-group">
          <span>FDA · openFDA</span>
          <a className={`nx-rail-link ${active === "fda-workspace" ? "active" : ""}`} href="/next/fda/workspace" aria-current={active === "fda-workspace" ? "page" : undefined}><Compass size={15} /> Workspace</a>
          <a className={`nx-rail-link ${active === "fda-explorer" ? "active" : ""}`} href="/next/fda/explorer" aria-current={active === "fda-explorer" ? "page" : undefined}><FileSearch size={15} /> Explorer</a>
          <a className="nx-rail-link" href="/fda/monitoring"><Activity size={15} /> Monitoring</a>
        </div>
        <div className="nx-rail-group">
          <span>FCC · Equipment authorizations</span>
          <a className="nx-rail-link" href="/fcc/explorer"><Radio size={15} /> Explorer</a>
          <a className="nx-rail-link" href="/fcc/monitoring"><Activity size={15} /> Monitoring</a>
        </div>
        <div className="nx-rail-group">
          <span>Health Canada · MDALL</span>
          <a className="nx-rail-link" href="/hc/explorer"><ShieldCheck size={15} /> Explorer</a>
          <a className="nx-rail-link" href="/hc/monitoring"><Activity size={15} /> Monitoring</a>
        </div>
        <div className="nx-rail-group">
          <span>IECEE · CB certificates</span>
          <a className="nx-rail-link" href="/iecee/explorer"><FileSearch size={15} /> Explorer</a>
          <a className="nx-rail-link" href="/iecee/monitoring"><Activity size={15} /> Monitoring</a>
        </div>
        <div className="nx-rail-group nx-rail-tools" role="group" aria-labelledby="nx-tools-label">
          <span id="nx-tools-label">Regulatory tools</span>
          {import.meta.env.MODE === "internal" && (
            <a className={`nx-rail-link ${active === "standards" ? "active" : ""}`} href="/next/fda/standards" aria-current={active === "standards" ? "page" : undefined}><BookOpen size={15} /> Standards mapping</a>
          )}
          <a className={`nx-rail-link ${active === "gazette" ? "active" : ""}`} href="/next/gazette" aria-current={active === "gazette" ? "page" : undefined}><ScrollText size={15} /> Canada Gazette</a>
        </div>
        <div className="nx-rail-foot">
          {import.meta.env.MODE === "internal" && <ThemeControl />}
          {import.meta.env.MODE !== "internal" && <p><a href={olderDesignHref}>Older design</a></p>}
          <p>Questions? <a href="mailto:muzaffar.bhatti@sonova.com?subject=Regulatory%20Data%20Portal%20Question">Muzaffar Bhatti</a></p>
        </div>
      </nav>
      <div className="nx-main">{children}</div>
    </div>
  );
}
