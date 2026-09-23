"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PackageSearch } from "lucide-react";
import { useDevHost } from "./fda-shared";

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
  view: RegulatoryView;
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

/** The first visit of the day plays the header welcome; `?welcome` replays it. Reduced-motion visitors never get it. */
function welcomeState(hasTitle: boolean): { play: boolean; returning: boolean } {
  // Monitoring pages have no title slot to greet in, so they leave the day's welcome for an explorer.
  if (typeof window === "undefined" || !hasTitle) return { play: false, returning: false };
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return { play: false, returning: false };
    const last = localStorage.getItem(WELCOME_KEY);
    return { play: last !== localDay() || new URLSearchParams(window.location.search).has("welcome"), returning: !!last };
  } catch {
    return { play: false, returning: false };
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
  const [welcome] = useState(() => welcomeState(!!title));
  const [welcoming, setWelcoming] = useState(welcome.play);

  useEffect(() => {
    if (!welcome.play) return;
    try {
      localStorage.setItem(WELCOME_KEY, localDay());
    } catch {
      // The welcome simply plays again next time.
    }
    const timer = setTimeout(() => setWelcoming(false), WELCOME_MS);
    return () => clearTimeout(timer);
  }, [welcome.play]);

  const rememberCurrent = () => {
    if (typeof window === "undefined") return;
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
          <h1>{welcoming && <span className="welcome-greeting" aria-hidden="true">{greeting(welcome.returning)}</span>}<span className="identity-title">{title}</span></h1>
          {tagline && <p>{tagline}</p>}
        </div>
      )}

      <div className="topbar-right regulatory-nav">
        {devHost && <a className="nav-preview-link" href="/next" title="Preview of the redesigned workbench (internal only)">New design ↗</a>}
        <div className="nav-dimension">
          <span>Source</span>
          <nav className="top-nav" aria-label="Regulatory source">
            {(["fda", "fcc", "hc", "iecee"] as const).map((item) => (
              <button key={item} type="button" className={source === item ? "current" : ""} onClick={() => navTo(item, view)} aria-current={source === item ? "page" : undefined} title={SOURCE_TITLE[item]}>
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
          </nav>
        </div>
        <div className={`source-status status-${statusState}`}>
          <span className="pulse" aria-hidden="true" /> {status}
        </div>
      </div>
    </header>
  );
}
