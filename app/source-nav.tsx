"use client";

import { PackageSearch } from "lucide-react";
import { useDevHost } from "./fda-shared";

export type RegulatorySource = "fda" | "fcc";
export type RegulatoryView = "explorer" | "monitoring";

const ROUTES: Record<RegulatorySource, Record<RegulatoryView, string>> = {
  fda: { explorer: "/fda/explorer", monitoring: "/fda/monitoring" },
  fcc: { explorer: "/fcc/explorer", monitoring: "/fcc/monitoring" },
};

type SourceNavProps = {
  source: RegulatorySource;
  view: RegulatoryView;
  status: string;
  statusState?: "ready" | "connected" | "error";
};

function destination(source: RegulatorySource, view: RegulatoryView) {
  if (typeof window === "undefined") return ROUTES[source][view];
  return sessionStorage.getItem(`regulatory:last:${source}:${view}`) || ROUTES[source][view];
}

export default function SourceNav({ source, view, status, statusState = "ready" }: SourceNavProps) {
  const devHost = useDevHost();

  const rememberCurrent = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(`regulatory:last:${source}:${view}`, `${window.location.pathname}${window.location.search}`);
  };

  const navTo = (nextSource: RegulatorySource, nextView: RegulatoryView) => {
    rememberCurrent();
    window.location.assign(destination(nextSource, nextView));
  };

  return (
    <header className="topbar regulatory-topbar">
      <button className="brand brand-button" type="button" onClick={() => navTo(source, "explorer")} aria-label={`${source.toUpperCase()} Explorer home`}>
        <span className="brand-mark"><PackageSearch size={19} /></span>
        <span><b>SONOVA</b> / REGULATORY DATA</span>
        {devHost && <span className="dev-badge">DEV</span>}
      </button>

      <div className="topbar-right regulatory-nav">
        <div className="nav-dimension">
          <span>Source</span>
          <nav className="top-nav" aria-label="Regulatory source">
            {(["fda", "fcc"] as const).map((item) => (
              <button key={item} type="button" className={source === item ? "current" : ""} onClick={() => navTo(item, view)} aria-current={source === item ? "page" : undefined}>
                {item.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
        <div className="nav-dimension">
          <span>View</span>
          <nav className="top-nav" aria-label="Regulatory view">
            {(["explorer", "monitoring"] as const).map((item) => (
              <button key={item} type="button" className={view === item ? "current" : ""} onClick={() => navTo(source, item)} aria-current={view === item ? "page" : undefined}>
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div className={`source-status status-${statusState}`}>
          <span className="pulse" aria-hidden="true" /> {status}
        </div>
      </div>
    </header>
  );
}
