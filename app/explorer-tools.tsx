"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, History, X } from "lucide-react";
import { DRAG_CLICK_GUARD_MS, MIN_COLUMN_WIDTH, parseColumnWidths, rememberEntry, parseRecentEntries, type RecentEntry, type SortDir } from "./explorer-tools-core";

export { DRAG_CLICK_GUARD_MS, MIN_COLUMN_WIDTH, RECENT_MAX, compareValues, parseColumnWidths, parseRecentEntries, recentSearchParams, rememberEntry, toggleSort, type RecentEntry, type SortDir } from "./explorer-tools-core";

/**
 * Table and filter-pane tools shared by every Explorer: sortable, resizable table headers with
 * widths remembered per device, removable applied-filter chips, and recent searches.
 * The FDA Explorer introduced these; FCC, Health Canada and IECEE reuse them from here.
 */

export type HeaderSpec = {
  key: string;
  label: string;
  numeric?: boolean;
  sortable: boolean;
  dir: SortDir | null;
  hint?: string;
  /** The narrow "open record" column: no label, just the drag handle. */
  open?: boolean;
};

/** A table header that sorts when the data can be ordered by it, stays a plain label when it cannot, and carries a drag handle for resizing. */
export function HeaderCell({ spec, resizing, onSort, onResizeStart, onResizeReset }: {
  spec: HeaderSpec;
  resizing: string;
  onSort: (spec: HeaderSpec) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>, key: string) => void;
  onResizeReset: (key: string) => void;
}) {
  const handle = (
    <div
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      title="Drag to resize · double-click to reset"
      onPointerDown={(event) => onResizeStart(event, spec.key)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.stopPropagation(); onResizeReset(spec.key); }}
    />
  );
  if (spec.open) return <th aria-label={spec.label} className={`open-col${resizing === spec.key ? " resizing" : ""}`}>{handle}</th>;
  if (!spec.sortable) {
    return <th className={`${spec.numeric ? "numeric-head" : ""}${resizing === spec.key ? " resizing" : ""}`}><span className="th-inner"><span className="th-label">{spec.label}</span></span>{handle}</th>;
  }
  return (
    <th
      className={`${spec.numeric ? "numeric-head " : ""}sortable${spec.dir ? " sorted" : ""}${resizing === spec.key ? " resizing" : ""}`}
      aria-sort={spec.dir === "asc" ? "ascending" : spec.dir === "desc" ? "descending" : "none"}
      title={spec.hint}
      onClick={() => onSort(spec)}
    >
      <span className="th-inner"><span className="th-label">{spec.label}</span>{spec.dir === "asc" ? <ArrowUp size={12} /> : spec.dir === "desc" ? <ArrowDown size={12} /> : <ArrowUpDown size={12} className="dim" />}</span>
      {handle}
    </th>
  );
}

export type ColumnWidthTools = {
  widths: Record<string, number>;
  /** True once any column has been dragged: the table then uses a fixed layout with explicit widths. */
  fixedLayout: boolean;
  tableStyle: CSSProperties | undefined;
  colGroup: ReactNode;
  resizing: string;
  startResize: (event: ReactPointerEvent<HTMLElement>, key: string) => void;
  resetWidth: (key: string) => void;
  resetWidths: () => void;
  /** True while a drag is in progress or just ended — header clicks should be ignored. */
  justDragged: () => boolean;
};

/**
 * Column widths for one table, remembered in localStorage under `storageKey`. The first drag captures
 * every visible column's current width so switching to a fixed layout does not shift anything.
 */
export function useColumnWidths(storageKey: string, activeKeys: readonly string[], defaultWidth = 160): ColumnWidthTools {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState("");
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragEndedAt = useRef(0);
  const loadedKey = useRef("");

  useEffect(() => {
    const stored = parseColumnWidths(localStorage.getItem(storageKey));
    queueMicrotask(() => {
      loadedKey.current = storageKey;
      setWidths(stored);
    });
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey.current !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // Widths are a convenience only.
    }
  }, [storageKey, widths]);

  /** While a header is being dragged, follow the pointer anywhere on the page and stop on any release, cancel or window blur. */
  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      if (event.buttons === 0) {
        resizeRef.current = null;
        dragEndedAt.current = Date.now();
        setResizing("");
        return;
      }
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(active.startWidth + event.clientX - active.startX));
      setWidths((current) => ({ ...current, [active.key]: width }));
    };
    const end = () => {
      resizeRef.current = null;
      dragEndedAt.current = Date.now();
      setResizing("");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    document.body.classList.add("col-resizing");
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      document.body.classList.remove("col-resizing");
    };
  }, [resizing]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.parentElement;
    const table = th?.closest("table");
    if (!th || !table) return;
    const measured: Record<string, number> = {};
    table.querySelectorAll("thead th").forEach((cell, index) => {
      const columnKey = activeKeys[index];
      if (columnKey) measured[columnKey] = Math.round(cell.getBoundingClientRect().width);
    });
    setWidths((current) => (Object.keys(current).length ? current : measured));
    resizeRef.current = { key, startX: event.clientX, startWidth: th.getBoundingClientRect().width };
    setResizing(key);
  }, [activeKeys]);

  const resetWidth = useCallback((key: string) => setWidths((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  }), []);
  const resetWidths = useCallback(() => setWidths({}), []);
  const justDragged = useCallback(() => !!resizeRef.current || Date.now() - dragEndedAt.current < DRAG_CLICK_GUARD_MS, []);

  const fixedLayout = Object.keys(widths).length > 0;
  const widthOf = (key: string) => widths[key] ?? (key === "open" ? 48 : defaultWidth);
  const tableStyle: CSSProperties | undefined = fixedLayout ? { tableLayout: "fixed", width: `max(${activeKeys.reduce((sum, key) => sum + widthOf(key), 0)}px, 100%)`, minWidth: 0 } : undefined;
  const colGroup = fixedLayout ? <colgroup>{activeKeys.map((key) => <col key={key} style={{ width: `${widthOf(key)}px` }} />)}</colgroup> : null;

  return { widths, fixedLayout, tableStyle, colGroup, resizing, startResize, resetWidth, resetWidths, justDragged };
}

/** Reloads the page with edited URL parameters — the explorers restore their search state from the URL on load. */
export function navigateWithParams(mutate: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const value = params.toString();
  window.location.assign(value ? `${window.location.pathname}?${value}` : window.location.pathname);
}

export type AppliedChip = { key: string; label: string };

export function AppliedFilters({ chips, onRemove, onClear, label = "Applied" }: { chips: readonly AppliedChip[]; onRemove: (chip: AppliedChip) => void; onClear: () => void; label?: string }) {
  if (!chips.length) return null;
  return (
    <div className="applied-filters" aria-label="Applied filters">
      <span className="strip-label"><Filter size={12} /> {label}</span>
      {chips.map((chip) => <span key={chip.key} className="applied-chip">{chip.label}<button type="button" onClick={() => onRemove(chip)} aria-label={`Remove filter ${chip.label}`} title="Remove this filter"><X size={11} /></button></span>)}
      <button type="button" className="text-button" onClick={onClear}>Clear all</button>
    </div>
  );
}

export function useRecentSearches(storageKey: string) {
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = parseRecentEntries(localStorage.getItem(storageKey));
    queueMicrotask(() => {
      setRecent((current) => (current.length ? current : stored));
      setReady(true);
    });
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(recent));
    } catch {
      // Recent searches are a convenience only.
    }
  }, [ready, storageKey, recent]);

  const remember = useCallback((params: string, label: string) => setRecent((current) => rememberEntry(current, params, label)), []);
  const forget = useCallback((params: string) => setRecent((current) => current.filter((item) => item.params !== params)), []);
  const clear = useCallback(() => setRecent([]), []);
  return { recent, remember, forget, clear };
}

export function RecentSearches({ entries, onApply, onForget, onClear, compact = false }: { entries: readonly RecentEntry[]; onApply: (entry: RecentEntry) => void; onForget: (params: string) => void; onClear: () => void; compact?: boolean }) {
  if (!entries.length) return null;
  return (
    <div className={`recent-searches${compact ? " compact" : ""}`} aria-label="Recent searches">
      <span><History size={11} /> Recent searches on this device <button type="button" className="text-button" onClick={onClear}>Clear</button></span>
      <div>
        {entries.map((entry) => (
          <span key={entry.params} className="recent-chip">
            <button type="button" onClick={() => onApply(entry)} title={entry.label}>{entry.label}</button>
            <button type="button" className="recent-remove" onClick={() => onForget(entry.params)} aria-label={`Forget ${entry.label}`} title="Forget this search"><X size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Ref for a horizontally scrollable table pane: marks it `scrolled-x` while the pinned first
 * column has content hidden behind it, so the column's edge shadow only shows when it means
 * something. Re-measures on scroll and on resize, and re-runs whenever `deps` change the table.
 */
export function useScrollShadow(deps: readonly unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const pane = ref.current;
    if (!pane) return;
    const sync = () => pane.classList.toggle("scrolled-x", pane.scrollLeft > 1);
    sync();
    pane.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(pane);
    return () => {
      pane.removeEventListener("scroll", sync);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
