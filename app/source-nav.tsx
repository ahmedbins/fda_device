"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PackageSearch } from "lucide-react";
import { useDevHost } from "./fda-shared";
import { ThemeControl } from "./theme-control";

export type RegulatorySource = "fda" | "fcc" | "hc" | "iecee";
export type RegulatoryView = "explorer" | "monitoring";

const ROUTES: Record<RegulatorySource, Record<RegulatoryView, string>> = {
  fda: { explorer: "/fda/explorer", monitoring: "/fda/monitoring" },
  fcc: { explorer: "/fcc/explorer", monitoring: "/fcc/monitoring" },
  hc: { explorer: "/hc/explorer", monitoring: "/hc/monitoring" },
  iecee: { explorer: "/iecee/explorer", monitoring: "/iecee/monitoring" },
};

const SOURCE_LABEL: Record<RegulatorySource, string> = {
  fda: "FDA",
  fcc: "FCC",
  hc: "HC",
  iecee: "IECEE",
};

const SOURCE_TITLE: Record<RegulatorySource, string> = {
  fda: "FDA openFDA",
  fcc: "FCC Equipment Authorization",
  hc: "Health Canada MDALL",
  iecee: "IECEE CB Scheme certificates",
};

type SourceNavProps = {
  source: RegulatorySource;
  view: RegulatoryView | "standards";
  status: string;
  statusState?: "ready" | "connected" | "error";
  /** What this page is, shown in the gap between the brand and the source tabs. */
  title?: ReactNode;
  tagline?: string;
};

const WELCOME_KEY = "regulatory:welcome-day";
/** Long enough for the last step of the welcome (the tagline) to finish before the plain header returns. */
const WELCOME_MS = 5200;

function localDay() {
  return new Date().toLocaleDateString("en-CA");
}

/** Return whether the visitor is returning, or null when the welcome should stay hidden. */
function welcomeReturning(day: string): boolean | null {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    const last = localStorage.getItem(WELCOME_KEY);
    const replay = new URLSearchParams(window.location.search).has("welcome");
    return last !== day || replay ? Boolean(last) : null;
  } catch {
    return null;
  }
}

function greeting(returning: boolean) {
  const hour = new Date().getHours();
  const part = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <>{part}. <em>{returning ? "Welcome back." : "Welcome."}</em></>;
}

function destination(source: RegulatorySource, view: RegulatoryView) {
  if (typeof window === "undefined") return ROUTES[source][view];
  try {
    return sessionStorage.getItem(`regulatory:last:${source}:${view}`) || ROUTES[source][view];
  } catch {
    return ROUTES[source][view];
  }
}

export default function SourceNav({ source, view, status, statusState = "ready", title, tagline }: SourceNavProps) {
  const devHost = useDevHost();
  const [returning, setReturning] = useState<boolean | null>(null);
  const hasTitle = Boolean(title);

  useEffect(() => {
    // Monitoring pages leave the day's welcome for an explorer with a title.
    if (!hasTitle) return;
    const day = localDay();
    const visitorReturning = welcomeReturning(day);
    if (visitorReturning === null) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReturning(visitorReturning);
      try {
        localStorage.setItem(WELCOME_KEY, day);
      } catch {
        // The welcome simply plays again next time.
      }
    });
    const timer = setTimeout(() => setReturning(null), WELCOME_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasTitle]);

  const welcoming = hasTitle && returning !== null;

  const rememberCurrent = () => {
    if (typeof window === "undefined" || view === "standards") return;
    try {
      sessionStorage.setItem(`regulatory:last:${source}:${view}`, `${window.location.pathname}${window.location.search}`);
    } catch {
      // Blocked storage only costs the "return to your last search" convenience.
    }
  };

  const navTo = (nextSource: RegulatorySource, nextView: RegulatoryView) => {
    rememberCurrent();
    window.location.assign(destination(nextSource, nextView));
  };

  return (
    <header className={`topbar regulatory-topbar${welcoming ? " welcoming" : ""}`}>
      <button className="brand brand-button" type="button" onClick={() => navTo(source, "explorer")} aria-label={`${source.toUpperCase()} Explorer home`}>
        <span className="brand-mark"><PackageSearch size={19} /></span>
        <span className="brand-name"><b>SONOVA</b> / REGULATORY DATA HUB</span>
        {devHost && <span className="dev-badge">DEV</span>}
      </button>

      {title && (
        <div className="topbar-identity">
          <h1>{welcoming && <span className="welcome-greeting" aria-hidden="true">{greeting(returning)}</span>}<span className="identity-title">{title}</span></h1>
          {tagline && <p>{tagline}</p>}
        </div>
      )}

      <div className="topbar-right regulatory-nav">
        {devHost && <a className="nav-preview-link" href="/next" title="Preview of the redesigned workbench (internal only)">New design ↗</a>}
        <div className="nav-dimension">
          <span>Source</span>
          <nav className="top-nav" aria-label="Regulatory source">
            {(["fda", "fcc", "hc", "iecee"] as const).map((item) => (
              <button key={item} type="button" className={source === item ? "current" : ""} onClick={() => {
                if (view === "standards" && item === "fda") return;
                navTo(item, view === "standards" ? "explorer" : view);
              }} aria-current={source === item ? "page" : undefined} title={SOURCE_TITLE[item]}>
                {SOURCE_LABEL[item]}
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
            {source === "fda" && (
              <a href="/fda/standards" onClick={rememberCurrent} className={view === "standards" ? "current" : undefined} aria-current={view === "standards" ? "page" : undefined}>Standards</a>
            )}
          </nav>
        </div>
        <ThemeControl />
        <div className={`source-status status-${statusState}`}>
          <span className="pulse" aria-hidden="true" /> {status}
        </div>
      </div>
    </header>
  );
}
