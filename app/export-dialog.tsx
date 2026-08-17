"use client";

import { ArrowDownToLine, FileSpreadsheet, X } from "lucide-react";

export type ExportToggle = {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
};

type ExportDialogProps = {
  open: boolean;
  title: string;
  countLabel: string;
  note?: string;
  toggles: ExportToggle[];
  selected: string[];
  confirming?: boolean;
  onChange: (next: string[]) => void;
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
  onChange,
  onCancel,
  onConfirm,
}: ExportDialogProps) {
  if (!open) return null;
  const selectedSet = new Set(selected);

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
          <div className="export-toggles">
            {toggles.map((item) => (
              <label key={item.id} className={item.required ? "required" : ""}>
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
          <button className="text-button" type="button" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="primary" type="button" onClick={onConfirm} disabled={confirming || !selected.length}>
            <ArrowDownToLine size={14} /> {confirming ? "Building Excel…" : "Download Excel"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function loadExportToggles(key: string, fallback: string[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveExportToggles(key: string, value: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}
