"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Barcode, Building2, CircleAlert, ExternalLink, FileSpreadsheet, LoaderCircle, PackageSearch, Plus, X } from "lucide-react";
import {
  API,
  type CodeMatchMode,
  type RecordItem,
  fdaPremarketUrl,
  fdaProductCodeUrl,
  fetchListingPages,
  fetchOpenFda,
  firmName,
  locationSummary,
  normalizeCodes,
  premarketSummary,
  recordProductCodes,
} from "./fda-shared";
import {
  PREMARKET_GAP_CAP,
  PREMARKET_GAP_COLUMNS,
  UDI_API,
  UDI_PM_EXEMPT,
  UDI_PREMARKET_EXISTS,
  type UdiDevice,
  type UdiRaw,
  accessGudidUrl,
  labelerGroupFor,
  labelersFor,
  listingSearchForDevice,
  normalizeLabeler,
  normalizeUdi,
  premarketGapRows,
  udiCompanySearch,
  udiPremarketLabel,
  udiSortParam,
} from "./fda-udi";
import { downloadExcel } from "./excel-export";
import { sanitizeExportFilename } from "./export-dialog";

const PANEL_LIMIT = 50;

async function countFor(search: string) {
  const params = new URLSearchParams({ search, limit: "1" });
  const data = await fetchOpenFda<UdiRaw>(`${UDI_API}?${params.toString()}`);
  return data.meta?.results?.total || 0;
}

type CompanySummary = {
  labelers: string[];
  breakdown: { name: string; count: number }[];
  any: number;
  all: number | null;
  allPremarket: number | null;
  allExempt: number | null;
  anyPremarket: number;
  anyExempt: number;
};

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
}

/** One GUDID device as a compact row: brand, model, primary DI, codes, premarket status. */
export function UdiDeviceRow({ device, highlight = [], onSelect }: { device: UdiDevice; highlight?: readonly string[]; onSelect?: (device: UdiDevice) => void }) {
  const hits = new Set(normalizeCodes(highlight));
  return (
    <button type="button" className="udi-device" onClick={() => onSelect?.(device)} title="Open the full GUDID record">
      <div className="udi-device-head">
        <b>{device.brand || "Unnamed device"}{device.model ? ` · ${device.model}` : ""}</b>
        <span className="di-pill" title={`Primary device identifier (${device.primaryAgency || "unknown agency"})`}>{device.primaryDi || "no DI"}</span>
      </div>
      {device.description && <span className="udi-device-desc">{device.description}</span>}
      <div className="udi-meta">
        <span className="udi-labeler">{device.company}</span>
        {device.codeList.map((code) => <span key={code} className={`code-pill${hits.has(code) ? " hit" : " neutral"}`}>{code}</span>)}
        {device.premarket.length
          ? <span className="pm-yes" title="Premarket submission declared on the GUDID record">{udiPremarketLabel(device)}</span>
          : <span className="pm-none" title="The labeler declared no 510(k), PMA or De Novo number on this record">No premarket submission</span>}
        {device.pmExempt && <span className="pm-exempt" title="Labeler marked the device premarket-exempt">PM exempt</span>}
        {(device.rx || device.otc) && <span className="udi-flag">{device.rx ? "Rx" : "OTC"}</span>}
        <span>Published {device.publishDate || "—"}</span>
      </div>
    </button>
  );
}

/**
 * Everything GUDID knows about one company for a set of product codes,
 * across every labeler name that belongs to it: server-side counts (any
 * code, every code, premarket declared, exempt), a per-labeler breakdown,
 * the newest device records, and a one-click premarket gap workbook.
 */
export function UdiCompanyPanel({
  company,
  alternates = [],
  codes,
  mode,
  aliases = [],
  onAddAlias,
  onRemoveAlias,
  onOpenDevicesView,
  onSelectDevice,
}: {
  company: string;
  alternates?: readonly string[];
  codes: readonly string[];
  mode: CodeMatchMode;
  aliases?: readonly string[];
  onAddAlias?: (labeler: string) => void;
  onRemoveAlias?: (labeler: string) => void;
  onOpenDevicesView?: (labeler: string) => void;
  onSelectDevice?: (device: UdiDevice) => void;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [devices, setDevices] = useState<UdiDevice[]>([]);
  const [listedAll, setListedAll] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [report, setReport] = useState<{ busy: boolean; note: string }>({ busy: false, note: "" });
  const selected = normalizeCodes(codes);
  const codesKey = selected.join(",");
  const labelers = labelersFor([company, ...alternates], aliases);
  const labelersKey = labelers.join("|");
  const group = labelerGroupFor(company) || alternates.map((name) => labelerGroupFor(name)).find(Boolean) || null;
  const aliasSet = new Set(aliases.map(normalizeLabeler));

  useEffect(() => {
    let cancelled = false;
    const names = labelersKey.split("|").filter(Boolean);
    const wanted = codesKey ? codesKey.split(",") : [];
    const multi = wanted.length > 1;
    (async () => {
      setStatus("loading");
      setError("");
      setSummary(null);
      setDevices([]);
      try {
        const any = await countFor(udiCompanySearch(names, wanted, "any"));
        let breakdown: { name: string; count: number }[] = [];
        let all: number | null = null;
        let allPremarket: number | null = null;
        let allExempt: number | null = null;
        let anyPremarket = 0;
        let anyExempt = 0;
        let list: UdiDevice[] = [];
        let listAll = false;
        if (any > 0) {
          const breakdownParams = new URLSearchParams({ search: udiCompanySearch(names, wanted, "any"), count: "company_name.exact", limit: "50" });
          const [counts, premarketCount, exemptCount] = await Promise.all([
            fetchOpenFda<{ term?: string; count?: number }>(`${UDI_API}?${breakdownParams.toString()}`),
            countFor(udiCompanySearch(names, wanted, "any", UDI_PREMARKET_EXISTS)),
            countFor(udiCompanySearch(names, wanted, "any", UDI_PM_EXEMPT)),
          ]);
          breakdown = counts.results.map((entry) => ({ name: String(entry.term ?? ""), count: entry.count || 0 })).filter((entry) => entry.name);
          anyPremarket = premarketCount;
          anyExempt = exemptCount;
          if (multi) {
            all = await countFor(udiCompanySearch(names, wanted, "all"));
            if (all > 0) {
              [allPremarket, allExempt] = await Promise.all([
                countFor(udiCompanySearch(names, wanted, "all", UDI_PREMARKET_EXISTS)),
                countFor(udiCompanySearch(names, wanted, "all", UDI_PM_EXEMPT)),
              ]);
            } else {
              allPremarket = 0;
              allExempt = 0;
            }
          }
          listAll = multi && mode === "all" && (all || 0) > 0;
          const params = new URLSearchParams({ search: udiCompanySearch(names, wanted, listAll ? "all" : "any"), limit: String(PANEL_LIMIT), sort: udiSortParam("newest") });
          const data = await fetchOpenFda<UdiRaw>(`${UDI_API}?${params.toString()}`);
          list = data.results.map(normalizeUdi);
        }
        if (cancelled) return;
        setSummary({ labelers: names, breakdown, any, all, allPremarket, allExempt, anyPremarket, anyExempt });
        setDevices(list);
        setListedAll(listAll);
        setStatus("done");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "The openFDA UDI request failed.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keys stand in for the arrays so a re-render with equal names/codes does not refetch.
  }, [labelersKey, codesKey, mode]);

  const submitAlias = () => {
    const value = aliasDraft.trim();
    if (!value || !onAddAlias) return;
    onAddAlias(value);
    setAliasDraft("");
  };

  const exportGapReport = async () => {
    if (report.busy) return;
    const names = labelersKey.split("|").filter(Boolean);
    const wanted = codesKey ? codesKey.split(",") : [];
    setReport({ busy: true, note: "Preparing the workbook…" });
    try {
      const multi = wanted.length > 1;
      const progress = (label: string) => (loaded: number, target: number) => setReport({ busy: true, note: `Downloading ${label}: ${loaded.toLocaleString()} of ${target.toLocaleString()}…` });
      const devices: UdiDevice[] = [];
      const seen = new Set<string>();
      const add = (raw: UdiRaw) => {
        const device = normalizeUdi(raw);
        if (seen.has(device.key) || devices.length >= PREMARKET_GAP_CAP) return;
        seen.add(device.key);
        devices.push(device);
      };
      // Devices carrying every selected code come first and are never crowded out by the cap.
      let allTotal = 0;
      let allExported = 0;
      if (multi) {
        const all = await fetchListingPages<UdiRaw>(UDI_API, udiCompanySearch(names, wanted, "all"), PREMARKET_GAP_CAP, progress("devices carrying every code"), udiSortParam("newest"));
        allTotal = all.total;
        all.results.forEach(add);
        allExported = devices.length;
      }
      let anyTotal = 0;
      if (devices.length < PREMARKET_GAP_CAP) {
        const rest = await fetchListingPages<UdiRaw>(UDI_API, udiCompanySearch(names, wanted, "any"), PREMARKET_GAP_CAP, progress("remaining devices"), udiSortParam("newest"));
        anyTotal = rest.total;
        rest.results.forEach(add);
      }
      const rows = premarketGapRows(devices, wanted);
      downloadExcel({
        filename: sanitizeExportFilename("", `gudid-premarket-gap-${slug(company)}-${wanted.join("+") || "all-codes"}-${new Date().toISOString().slice(0, 10)}`),
        sheetName: "Premarket gap",
        columns: PREMARKET_GAP_COLUMNS.map((column) => ({ header: column.header, width: column.width })),
        rows: rows.map((row) => PREMARKET_GAP_COLUMNS.map((column) => row[column.key])),
      });
      const truncated = (multi && allTotal > allExported) || anyTotal > rows.length;
      const note = multi
        ? `Exported ${allExported.toLocaleString()}${allTotal > allExported ? ` of ${allTotal.toLocaleString()}` : ""} device${allExported === 1 ? "" : "s"} carrying every selected code, plus ${(rows.length - allExported).toLocaleString()} more under any code${truncated ? ` (${PREMARKET_GAP_CAP.toLocaleString()}-row limit; openFDA pages 1,000 per call)` : ""}.`
        : `Exported ${rows.length.toLocaleString()}${anyTotal > rows.length ? ` of ${anyTotal.toLocaleString()}` : ""} device records${anyTotal > rows.length ? ` (${PREMARKET_GAP_CAP.toLocaleString()}-row limit)` : ""}.`;
      setReport({ busy: false, note });
    } catch (caught) {
      setReport({ busy: false, note: `Export failed: ${caught instanceof Error ? caught.message : "openFDA request failed"}` });
    }
  };

  const labelerChips = (
    <div className="labeler-chips" aria-label="GUDID labeler names searched">
      <span className="strip-label"><Building2 size={11} /> Labelers</span>
      {labelers.map((name) => {
        const key = normalizeLabeler(name);
        const isAlias = aliasSet.has(key);
        const isGroup = !isAlias && key !== normalizeLabeler(company) && !alternates.some((alt) => normalizeLabeler(alt) === key);
        return (
          <span key={name} className={`applied-chip${isGroup ? " group" : ""}${isAlias ? " alias" : ""}`} title={isGroup ? `${group?.group || "Group"} member (app-maintained alias, from public ownership)` : isAlias ? "Added on this device" : "From the FDA registration"}>
            {name}
            {isAlias && onRemoveAlias && <button type="button" onClick={() => onRemoveAlias(name)} aria-label={`Remove labeler ${name}`} title="Remove this labeler name"><X size={11} /></button>}
          </span>
        );
      })}
      {onAddAlias && (
        <form className="alias-form" onSubmit={(event) => { event.preventDefault(); submitAlias(); }}>
          <input value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="Add a GUDID labeler name…" aria-label="Add a GUDID labeler name" />
          <button type="submit" className="mini-action" disabled={!aliasDraft.trim()} aria-label="Add labeler name" title="Search this labeler name too"><Plus size={13} /></button>
        </form>
      )}
    </div>
  );

  if (status === "loading") {
    return <div className="udi-panel"><div className="udi-panel-loading"><LoaderCircle className="spin" size={15} /> Checking FDA GUDID for {labelers.length > 1 ? `${labelers.length} labeler names` : company}…</div></div>;
  }
  if (status === "error") {
    return <div className="udi-panel"><div className="section-error"><CircleAlert size={15} /> {error}</div>{labelerChips}</div>;
  }
  if (!summary || summary.any === 0) {
    return (
      <div className="udi-panel">
        <div className="panel-note">
          <p>
            No GUDID device records are published under {labelers.length > 1 ? "these labeler names" : <>the labeler name <b>{company}</b></>}
            {selected.length ? <> for {selected.join(" + ")}</> : null}. Labelers file UDI under their own legal or brand entity, which can differ from the FDA registration owner/operator — add the labeler name below if you know it.
          </p>
          {onOpenDevicesView && <button type="button" className="secondary" onClick={() => onOpenDevicesView(company)}><Barcode size={14} /> Search Devices (UDI)</button>}
        </div>
        {labelerChips}
      </div>
    );
  }

  const multi = selected.length > 1;
  const codesJoined = selected.join(" + ");
  const focusCount = multi ? summary.all ?? 0 : summary.any;
  const focusPremarket = multi ? summary.allPremarket ?? 0 : summary.anyPremarket;
  const focusExempt = multi ? summary.allExempt ?? 0 : summary.anyExempt;
  const who = summary.breakdown.length > 1 ? `${company} (${summary.breakdown.length} labelers)` : summary.breakdown[0]?.name || company;
  const explanation = multi
    ? focusCount
      ? `${who} has ${focusCount.toLocaleString()} GUDID device record${focusCount === 1 ? "" : "s"} filed under both ${codesJoined}. ${focusPremarket ? `${focusPremarket.toLocaleString()} of them declare a premarket submission number` : "None of them declares a 510(k), PMA or De Novo number"}; ${focusExempt.toLocaleString()} ${focusExempt === 1 ? "is" : "are"} marked premarket-exempt by the labeler.`
      : `${who} publishes ${summary.any.toLocaleString()} device record${summary.any === 1 ? "" : "s"} under ${selected.join(" or ")}, but none carries every code on the same device record.`
    : `${who} publishes ${summary.any.toLocaleString()} device record${summary.any === 1 ? "" : "s"} under ${codesJoined || "these codes"}; ${focusPremarket ? `${focusPremarket.toLocaleString()} declare a premarket submission` : "none declares a premarket submission"} and ${focusExempt.toLocaleString()} ${focusExempt === 1 ? "is" : "are"} marked premarket-exempt.`;

  return (
    <div className="udi-panel">
      {labelerChips}
      {group && <p className="panel-note">Group aliases are maintained in this app from public ownership information, not from FDA data: <b>{group.group}</b> — {group.note}</p>}
      <div className="udi-summary">
        <div className="udi-tile"><b>{summary.any.toLocaleString()}</b><span>{multi ? `devices with any of ${selected.join(" / ")}` : `devices under ${codesJoined || "any code"}`}</span></div>
        {multi && <div className="udi-tile"><b>{(summary.all ?? 0).toLocaleString()}</b><span>carry all of {codesJoined}</span></div>}
        <div className={`udi-tile${focusCount && !focusPremarket ? " warn" : ""}`}><b>{focusPremarket.toLocaleString()}</b><span>{multi ? "of those list a premarket submission" : "list a premarket submission"}</span></div>
        <div className="udi-tile"><b>{focusExempt.toLocaleString()}</b><span>{multi ? "of those marked premarket-exempt" : "marked premarket-exempt"}</span></div>
      </div>
      <p className="panel-note">{explanation}</p>
      {summary.breakdown.length > 1 && (
        <div className="udi-breakdown" aria-label="Devices per labeler">
          {summary.breakdown.map((entry) => <span key={entry.name} className="code-count"><b>{entry.name}</b> {entry.count.toLocaleString()}</span>)}
        </div>
      )}
      <div className="udi-report">
        <button type="button" className="secondary" onClick={() => void exportGapReport()} disabled={report.busy}>
          {report.busy ? <LoaderCircle className="spin" size={14} /> : <FileSpreadsheet size={14} />} Premarket gap report (Excel)
        </button>
        <span>{report.note || `Every device record under ${selected.join(" / ") || "these codes"} with its submission number or “None listed”, devices carrying every selected code first.`}</span>
      </div>
      {devices.length > 0 && (
        <>
          <div className="udi-list">
            {devices.map((device) => <UdiDeviceRow key={device.key} device={device} highlight={selected} onSelect={onSelectDevice} />)}
          </div>
          <div className="udi-list-foot">
            <span>Showing {devices.length.toLocaleString()} of {(listedAll ? summary.all ?? 0 : summary.any).toLocaleString()} {listedAll ? `devices carrying all of ${codesJoined}` : "devices"} · newest published first</span>
            {onOpenDevicesView && <button type="button" className="secondary" onClick={() => onOpenDevicesView(summary.breakdown[0]?.name || company)}>Open in Devices (UDI) <ArrowUpRight size={13} /></button>}
          </div>
        </>
      )}
    </div>
  );
}

/** Full GUDID record plus the registration listings filed by the same labeler under the device's codes. */
export function UdiDeviceDetail({
  device,
  highlight = [],
  codeLabel,
  onShowListings,
}: {
  device: UdiDevice;
  highlight?: readonly string[];
  codeLabel: (code: string) => string;
  onShowListings?: (company: string, codes: string[]) => void;
}) {
  // Keyed by device so a newly selected device reads as "loading" until its own lookup lands.
  const [lookup, setLookup] = useState<{ key: string; status: "done" | "error"; total: number; rows: RecordItem[] } | null>(null);
  const hits = new Set(normalizeCodes(highlight));
  const listings = lookup && lookup.key === device.key ? lookup : { key: device.key, status: "loading" as const, total: 0, rows: [] as RecordItem[] };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ search: listingSearchForDevice(device), limit: "5" });
    fetchOpenFda<RecordItem>(`${API}?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setLookup({ key: device.key, status: "done", total: data.meta?.results?.total || 0, rows: data.results });
      })
      .catch(() => {
        if (!cancelled) setLookup({ key: device.key, status: "error", total: 0, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [device]);

  const facts: [string, string][] = [
    ["Prescription / OTC", device.rx ? "Prescription (Rx)" : device.otc ? "Over the counter" : "Not stated"],
    ["Premarket exempt", yesNo(device.pmExempt)],
    ["Single use", yesNo(device.singleUse)],
    ["Kit", yesNo(device.kit)],
    ["Combination product", yesNo(device.combination)],
    ["Sterile", `${yesNo(device.sterile)}${device.sterilizePriorUse ? " · sterilize before use" : ""}`],
    ["Lot / batch number", yesNo(device.lot)],
    ["Serial number", yesNo(device.serial)],
    ["Expiration date", yesNo(device.expiration)],
    ["Manufacturing date", yesNo(device.manufacturingDate)],
    ["Direct marking exempt", yesNo(device.directMarkingExempt)],
    ["Devices in base package", device.baseCount || "—"],
    ["MRI safety", device.mri || "Not stated"],
    ["Record status", `${device.recordStatus || "—"}${device.versionNumber ? ` · version ${device.versionNumber}` : ""}${device.versionDate ? ` (${device.versionDate})` : ""}`],
    ["Commercial distribution", `${device.distributionStatus || "—"}${device.distributionEnd ? ` · ended ${device.distributionEnd}` : ""}`],
    ["Labeler DUNS", device.duns || "—"],
  ];

  return (
    <>
      <div className="detail-stats">
        <div><span>Primary DI</span><b className="mono-value">{device.primaryDi || "—"}</b></div>
        <div><span>Issuing agency</span><b>{device.primaryAgency || "—"}</b></div>
        <div><span>Published</span><b>{device.publishDate || "—"}</b></div>
        <div><span>Premarket</span><b>{device.premarket.length ? udiPremarketLabel(device) : (device.pmExempt ? "Exempt" : "None listed")}</b></div>
      </div>

      <section className="detail-section">
        <h3><Barcode size={16} /> Device identifiers <i className="listing-note">{device.identifiers.length} on record</i></h3>
        <table className="udi-id-table">
          <thead><tr><th>Identifier</th><th>Type</th><th>Agency</th><th>Package</th></tr></thead>
          <tbody>
            {device.identifiers.map((entry) => (
              <tr key={`${entry.id}-${entry.type}`}>
                <td><b className="mono-value">{entry.id}</b></td>
                <td>{entry.type || "—"}</td>
                <td>{entry.agency || "—"}</td>
                <td>{entry.quantityPerPackage ? `${entry.quantityPerPackage} × ${entry.unitOfUseId || "unit"}${entry.packageType ? ` · ${entry.packageType}` : ""}${entry.packageStatus ? ` · ${entry.packageStatus}` : ""}` : "—"}</td>
              </tr>
            ))}
            {!device.identifiers.length && <tr><td colSpan={4}>No identifiers on record.</td></tr>}
          </tbody>
        </table>
        {device.primaryDi && <a className="official-record-link secondary" href={accessGudidUrl(device.primaryDi)} target="_blank" rel="noreferrer">Open in AccessGUDID <ExternalLink size={12} /></a>}
      </section>

      <section className="detail-section">
        <h3><PackageSearch size={16} /> Product codes on this device</h3>
        <div className="product-list">
          {device.codes.map((entry) => (
            <article key={entry.code} className={hits.size && !hits.has(entry.code) ? "dim" : ""}>
              <div>
                <a className={`code-pill link${hits.has(entry.code) ? " hit" : ""}`} href={fdaProductCodeUrl(entry.code)} target="_blank" rel="noreferrer" title="Open the FDA product classification page">{entry.code} <ExternalLink size={10} /></a>
                <span>{entry.deviceClass && <span className={`class-badge class-${entry.deviceClass.toLowerCase()}`}>Class {entry.deviceClass}</span>}</span>
              </div>
              <h4>{entry.name || codeLabel(entry.code)}</h4>
              <p>{entry.specialty || "Specialty unavailable"} · Regulation {entry.regulation || "—"}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h3>Premarket submissions</h3>
        {device.premarket.length ? (
          <div className="chips">
            {device.premarket.map((entry) => {
              const url = fdaPremarketUrl(entry.number);
              const label = entry.supplement && entry.supplement !== "000" ? `${entry.number} · supplement ${entry.supplement}` : entry.number;
              return url
                ? <a key={`${entry.number}-${entry.supplement}`} className="chip-link" href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={10} /></a>
                : <span key={`${entry.number}-${entry.supplement}`}>{label}</span>;
            })}
          </div>
        ) : (
          <p className="panel-note">The labeler declared no 510(k), PMA or De Novo number on this GUDID record{device.pmExempt ? " and marked it premarket-exempt" : ""}.</p>
        )}
      </section>

      <section className="detail-section">
        <h3>Device facts</h3>
        <dl className="fcc-detail-list">
          {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>

      {device.gmdn.length > 0 && (
        <section className="detail-section">
          <h3>GMDN terms</h3>
          <div className="product-list">
            {device.gmdn.map((term) => <article key={`${term.code}-${term.name}`}><h4>{term.name}{term.code ? ` · ${term.code}` : ""}</h4>{term.definition && <p>{term.definition}</p>}</article>)}
          </div>
        </section>
      )}

      {device.contacts.length > 0 && (
        <section className="detail-section">
          <h3>Customer contacts</h3>
          <div className="chips">{device.contacts.map((contact) => <span key={`${contact.phone}-${contact.email}`}>{[contact.phone, contact.email].filter(Boolean).join(" · ")}</span>)}</div>
        </section>
      )}

      <section className="detail-section">
        <h3><Building2 size={16} /> FDA registration listings for this labeler</h3>
        {listings.status === "loading" && <div className="udi-panel-loading"><LoaderCircle className="spin" size={14} /> Checking registrations…</div>}
        {listings.status === "error" && <div className="section-error"><CircleAlert size={15} /> The registration lookup failed.</div>}
        {listings.status === "done" && (
          listings.total ? (
            <>
              <p className="panel-note"><b>{listings.total.toLocaleString()}</b> listing{listings.total === 1 ? "" : "s"} registered by <b>{device.company}</b> under {device.codeList.join(" / ")}.</p>
              <div className="udi-list">
                {listings.rows.map((item, index) => (
                  <div key={`${item.registration?.registration_number || "rec"}-${index}`} className="udi-device static">
                    <div className="udi-device-head"><b>{firmName(item)}</b><span className="di-pill">REG {item.registration?.registration_number || "—"}</span></div>
                    <div className="udi-meta">
                      {[...recordProductCodes(item)].map((code) => <span key={code} className={`code-pill${hits.has(code) ? " hit" : " neutral"}`}>{code}</span>)}
                      <span>{locationSummary(item)}</span>
                      <span>{premarketSummary(item) ? `Premarket ${premarketSummary(item)}` : "No premarket number on listing"}</span>
                    </div>
                  </div>
                ))}
              </div>
              {onShowListings && <button type="button" className="secondary" onClick={() => onShowListings(device.company, device.codeList)}>Show all listings in Records <ArrowUpRight size={13} /></button>}
            </>
          ) : (
            <p className="panel-note">No registration listing names <b>{device.company}</b> as owner/operator under {device.codeList.join(" / ")}. The registered owner/operator can be a parent or a different legal entity than the GUDID labeler.</p>
          )
        )}
      </section>

      <section className="detail-section raw-section"><details><summary>View raw GUDID JSON</summary><pre>{JSON.stringify(device.raw, null, 2)}</pre></details></section>
    </>
  );
}
