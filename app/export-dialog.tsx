"use client";

import { useEffect } from "react";
import { ArrowDownToLine, FileSpreadsheet, X } from "lucide-react";

export type ExportToggle = {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
};

export type ExportScope = "all" | "page";

export type ExportSettings = {
  groups: string[];
  scope: ExportScope;
  unique: boolean;
  clickableLinks: boolean;
  filename: string;
};

type ExportDialogProps = {
  open: boolean;
  title: string;
  countLabel: string;
  note?: string;
  toggles: ExportToggle[];
  selected: string[];
  confirming?: boolean;
  filename: string;
  scope: ExportScope;
  unique?: boolean;
  uniqueLabel?: string;
  clickableLinks: boolean;
  pageCount: number;
  allCount: number;
  filters?: string[];
  onFilename: (value: string) => void;
  onScope: (value: ExportScope) => void;
  onUnique?: (value: boolean) => void;
  onClickableLinks?: (value: boolean) => void;
  onChange: (next: string[]) => void;
  onUseVisible?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExportDialog({
  open,
  title,
  countLabel,
  note,
  toggles,
  selected,
  confirming = false,
  filename,
  scope,
  unique = false,
  uniqueLabel,
  clickableLinks,
  pageCount,
  allCount,
  filters = [],
  onFilename,
  onScope,
  onUnique,
  onClickableLinks,
  onChange,
  onUseVisible,
  onCancel,
  onConfirm,
}: ExportDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirming) onCancel();
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !confirming) onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, confirming, onCancel, onConfirm]);

  if (!open) return null;
  const selectedSet = new Set(selected);
  const requiredIds = toggles.filter((item) => item.required).map((item) => item.id);
  const optional = toggles.filter((item) => !item.required);

  const toggle = (id: string, required?: boolean) => {
    if (required) return;
    onChange(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <div className="export-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !confirming && onCancel()}>
      <aside className="export-card" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <div className="export-card-top">
          <span><FileSpreadsheet size={16} /> Excel export</span>
          <button className="icon-button" type="button" onClick={onCancel} disabled={confirming} aria-label="Close export options"><X size={16} /></button>
        </div>
        <div className="export-card-body">
          <h2 id="export-dialog-title">{title}</h2>
          <p className="export-count">{countLabel}</p>
          {!!filters.length && <div className="export-filters">{filters.map((item) => <span key={item}>{item}</span>)}</div>}

          <label className="export-filename">
            <span>File name</span>
            <input value={filename} onChange={(event) => onFilename(event.target.value)} disabled={confirming} spellCheck={false} />
          </label>

          <div className="export-section-head"><span>Rows</span></div>
          <div className="export-choices">
            <label className={scope === "all" ? "on" : ""}>
              <input type="radio" name="export-scope" checked={scope === "all"} disabled={confirming} onChange={() => onScope("all")} />
              <span><b>All matching</b><small>{allCount.toLocaleString()} row{allCount === 1 ? "" : "s"}</small></span>
            </label>
            <label className={scope === "page" ? "on" : ""}>
              <input type="radio" name="export-scope" checked={scope === "page"} disabled={confirming || !pageCount} onChange={() => onScope("page")} />
              <span><b>This page only</b><small>{pageCount.toLocaleString()} row{pageCount === 1 ? "" : "s"}</small></span>
            </label>
          </div>
          {onUnique && uniqueLabel && (
            <label className="export-switch">
              <input type="checkbox" checked={unique} disabled={confirming} onChange={(event) => onUnique(event.target.checked)} />
              <span><b>Latest only</b><small>{uniqueLabel}</small></span>
            </label>
          )}
          {onClickableLinks && (
            <label className="export-switch">
              <input type="checkbox" checked={clickableLinks} disabled={confirming} onChange={(event) => onClickableLinks(event.target.checked)} />
              <span><b>Clickable links</b><small>Off exports the URL as plain text</small></span>
            </label>
          )}

          <div className="export-section-head">
            <span>Columns</span>
            <div>
              {onUseVisible && <button type="button" onClick={onUseVisible} disabled={confirming}>Use visible</button>}
              <button type="button" disabled={confirming} onClick={() => onChange(toggles.map((item) => item.id))}>All</button>
              <button type="button" disabled={confirming} onClick={() => onChange(requiredIds)}>Reset</button>
            </div>
          </div>
          <div className="export-toggles">
            {toggles.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(item.id) || !!item.required}
                  disabled={item.required || confirming}
                  onChange={() => toggle(item.id, item.required)}
                />
                <span>
                  <b>{item.label}</b>
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </label>
            ))}
          </div>
          {note && <p className="export-note">{note}</p>}
        </div>
        <div className="export-card-actions">
          <small>{optional.length ? `${Math.max(selected.filter((id) => toggles.some((item) => item.id === id)).length, requiredIds.length)} columns` : ""}</small>
          <button className="text-button" type="button" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="primary" type="button" onClick={onConfirm} disabled={confirming || !selected.length}>
            <ArrowDownToLine size={14} /> {confirming ? "Building Excel…" : "Download Excel"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function defaultExportFilename(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function loadExportToggles(key: string, fallback: string[]) {
  return loadExportSettings(key, { groups: fallback, scope: "all", unique: false, clickableLinks: true, filename: "" }).groups;
}

export function saveExportToggles(key: string, value: string[]) {
  const current = loadExportSettings(key, { groups: value, scope: "all", unique: false, clickableLinks: true, filename: "" });
  saveExportSettings(key, { ...current, groups: value });
}

export function loadExportSettings(key: string, fallback: ExportSettings): ExportSettings {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(parsed)) return { ...fallback, groups: parsed.filter((item) => typeof item === "string") };
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups.filter((item: unknown) => typeof item === "string") : fallback.groups,
      scope: parsed.scope === "page" ? "page" : "all",
      unique: !!parsed.unique,
      clickableLinks: parsed.clickableLinks !== false,
      filename: typeof parsed.filename === "string" ? parsed.filename : fallback.filename,
    };
  } catch {
    return fallback;
  }
}

export function saveExportSettings(key: string, value: ExportSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function sanitizeExportFilename(value: string, fallback: string) {
  const cleaned = value.replace(/[/\\?%*:|"<>]/g, "-").replace(/\.xlsx$/i, "").trim();
  return `${cleaned || fallback.replace(/\.xlsx$/i, "")}.xlsx`;
}

export function asExportLink(text: string, url: string, clickable: boolean) {
  return clickable ? { text, url } : url;
}
