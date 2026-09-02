"use client";

import type { ReactNode } from "react";
import { Activity, Compass, FileSearch, Radio, ScrollText, ShieldCheck } from "lucide-react";
import { useDevHost } from "../fda-shared";

export type NextRoute = "hub" | "fda-workspace" | "fda-explorer" | "gazette";

type NextShellProps = {
  active: NextRoute;
  children: ReactNode;
};

/**
 * Workbench shell for the design preview: a persistent left rail with the
 * six workflows, and a main column the page fills. Routes that are not yet
 * rebuilt in the new design link to the current pages and say so.
 */
export function NextShell({ active, children }: NextShellProps) {
  const devHost = useDevHost();
  return (
    <div className="nx-app">
      <nav className="nx-rail" aria-label="Regulatory sources">
        <a className="nx-brand" href="/next">
          <span className="nx-brand-mark">S</span>
          <span><b>SONOVA</b><small>Regulatory Data Hub</small></span>
          {devHost && <em className="nx-dev">DEV</em>}
        </a>
        <div className="nx-rail-group">
          <span>FDA · openFDA</span>
          <a className={`nx-rail-link ${active === "fda-workspace" ? "active" : ""}`} href="/next/fda/workspace" aria-current={active === "fda-workspace" ? "page" : undefined}><Compass size={15} /> Workspace <em>new</em></a>
          <a className={`nx-rail-link ${active === "fda-explorer" ? "active" : ""}`} href="/next/fda/explorer" aria-current={active === "fda-explorer" ? "page" : undefined}><FileSearch size={15} /> Explorer <em>preview</em></a>
          <a className="nx-rail-link" href="/fda/monitoring"><Activity size={15} /> Monitoring <em>current</em></a>
        </div>
        <div className="nx-rail-group">
          <span>FCC · Equipment authorizations</span>
          <a className="nx-rail-link" href="/fcc/explorer"><Radio size={15} /> Explorer <em>current</em></a>
          <a className="nx-rail-link" href="/fcc/monitoring"><Activity size={15} /> Monitoring <em>current</em></a>
        </div>
        <div className="nx-rail-group">
          <span>Health Canada · MDALL</span>
          <a className="nx-rail-link" href="/hc/explorer"><ShieldCheck size={15} /> Explorer <em>current</em></a>
          <a className="nx-rail-link" href="/hc/monitoring"><Activity size={15} /> Monitoring <em>current</em></a>
        </div>
        <div className="nx-rail-group">
          <span>Canada Gazette</span>
          <a className={`nx-rail-link ${active === "gazette" ? "active" : ""}`} href="/next/gazette" aria-current={active === "gazette" ? "page" : undefined}><ScrollText size={15} /> Intelligence <em>new</em></a>
        </div>
        <div className="nx-rail-foot">
          <p>Design preview. <em>new</em> is the scope workbench, <em>preview</em> the earlier restyle, <em>current</em> the existing pages.</p>
          <p><a href="/fda/explorer">Back to the current design</a></p>
          <p>Questions? <a href="mailto:muzaffar.bhatti@sonova.com?subject=Regulatory%20Data%20Portal%20Question">Muzaffar Bhatti</a></p>
        </div>
      </nav>
      <div className="nx-main">{children}</div>
    </div>
  );
}
