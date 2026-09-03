"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Barcode, Building2, CircleAlert, ExternalLink, LoaderCircle, PackageSearch } from "lucide-react";
import {
  API,
  type CodeMatchMode,
  type RecordItem,
  fdaPremarketUrl,
  fdaProductCodeUrl,
  fetchOpenFda,
  firmName,
  locationSummary,
  normalizeCodes,
  premarketSummary,
  recordProductCodes,
} from "./fda-shared";
import {
  UDI_API,
  UDI_PM_EXEMPT,
  UDI_PREMARKET_EXISTS,
  type UdiDevice,
  type UdiRaw,
  accessGudidUrl,
  listingSearchForDevice,
  normalizeUdi,
  udiCompanySearch,
  udiPremarketLabel,
  udiSortParam,
} from "./fda-udi";

const PANEL_LIMIT = 50;

async function countFor(search: string) {
  const params = new URLSearchParams({ search, limit: "1" });
  const data = await fetchOpenFda<UdiRaw>(`${UDI_API}?${params.toString()}`);
  return data.meta?.results?.total || 0;
}

type CompanySummary = {
  name: string;
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
 * Everything GUDID knows about one labeler for a set of product codes:
 * server-side counts (any code, every code, premarket declared, exempt) and
 * the newest device records. Answers "does this company have devices filed
 * under both OSM and KLW, and do they list a submission number?".
 */
export function UdiCompanyPanel({
  company,
  alternates = [],
  codes,
  mode,
  onOpenDevicesView,
  onSelectDevice,
}: {
  company: string;
  alternates?: readonly string[];
  codes: readonly string[];
  mode: CodeMatchMode;
  onOpenDevicesView?: (labeler: string) => void;
  onSelectDevice?: (device: UdiDevice) => void;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [devices, setDevices] = useState<UdiDevice[]>([]);
  const [listedAll, setListedAll] = useState(false);
  const selected = normalizeCodes(codes);
  const codesKey = selected.join(",");
  const namesKey = [company, ...alternates].join("|");

  useEffect(() => {
    let cancelled = false;
    const names = [...new Set([company, ...alternates].map((name) => name.trim()).filter(Boolean))];
    const wanted = codesKey ? codesKey.split(",") : [];
    const multi = wanted.length > 1;
    (async () => {
      setStatus("loading");
      setError("");
      setSummary(null);
      setDevices([]);
      try {
        let name = names[0] || "";
        let any = 0;
        for (const candidate of names) {
          const total = await countFor(udiCompanySearch(candidate, wanted, "any"));
          if (total > 0) {
            name = candidate;
            any = total;
            break;
          }
        }
        let all: number | null = null;
        let allPremarket: number | null = null;
        let allExempt: number | null = null;
        let anyPremarket = 0;
        let anyExempt = 0;
        let list: UdiDevice[] = [];
        let listAll = false;
        if (any > 0) {
          [anyPremarket, anyExempt] = await Promise.all([
            countFor(udiCompanySearch(name, wanted, "any", UDI_PREMARKET_EXISTS)),
            countFor(udiCompanySearch(name, wanted, "any", UDI_PM_EXEMPT)),
          ]);
          if (multi) {
            all = await countFor(udiCompanySearch(name, wanted, "all"));
            if (all > 0) {
              [allPremarket, allExempt] = await Promise.all([
                countFor(udiCompanySearch(name, wanted, "all", UDI_PREMARKET_EXISTS)),
                countFor(udiCompanySearch(name, wanted, "all", UDI_PM_EXEMPT)),
              ]);
            } else {
              allPremarket = 0;
              allExempt = 0;
            }
          }
          listAll = multi && mode === "all" && (all || 0) > 0;
          const params = new URLSearchParams({ search: udiCompanySearch(name, wanted, listAll ? "all" : "any"), limit: String(PANEL_LIMIT), sort: udiSortParam("newest") });
          const data = await fetchOpenFda<UdiRaw>(`${UDI_API}?${params.toString()}`);
          list = data.results.map(normalizeUdi);
        }
        if (cancelled) return;
        setSummary({ name, any, all, allPremarket, allExempt, anyPremarket, anyExempt });
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
    // Keys stand in for the arrays so a re-render with equal codes does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, codesKey, mode]);

  if (status === "loading") {
    return <div className="udi-panel-loading"><LoaderCircle className="spin" size={15} /> Checking FDA GUDID for {company}…</div>;
  }
  if (status === "error") {
    return <div className="section-error"><CircleAlert size={15} /> {error}</div>;
  }
  if (!summary || summary.any === 0) {
    return (
      <div className="panel-note">
        <p>
          No GUDID device records are published under the labeler name <b>{company}</b>
          {selected.length ? <> for {selected.join(" + ")}</> : null}. Labelers file UDI under their own legal or brand entity — DEMANT A/S devices, for example, appear under Oticon A/S and SBO Hearing A/S — so the registration owner/operator and the GUDID labeler can differ.
        </p>
        {onOpenDevicesView && <button type="button" className="secondary" onClick={() => onOpenDevicesView(company)}><Barcode size={14} /> Search Devices (UDI)</button>}
      </div>
    );
  }

  const multi = selected.length > 1;
  const codesJoined = selected.join(" + ");
  const focusCount = multi ? summary.all ?? 0 : summary.any;
  const focusPremarket = multi ? summary.allPremarket ?? 0 : summary.anyPremarket;
  const focusExempt = multi ? summary.allExempt ?? 0 : summary.anyExempt;
  const explanation = multi
    ? focusCount
      ? `${summary.name} has ${focusCount.toLocaleString()} GUDID device record${focusCount === 1 ? "" : "s"} filed under both ${codesJoined}. ${focusPremarket ? `${focusPremarket.toLocaleString()} of them declare a premarket submission number` : "None of them declares a 510(k), PMA or De Novo number"}; ${focusExempt.toLocaleString()} ${focusExempt === 1 ? "is" : "are"} marked premarket-exempt by the labeler.`
      : `${summary.name} publishes ${summary.any.toLocaleString()} device record${summary.any === 1 ? "" : "s"} under ${selected.join(" or ")}, but none carries every code on the same device record.`
    : `${summary.name} publishes ${summary.any.toLocaleString()} device record${summary.any === 1 ? "" : "s"} under ${codesJoined || "these codes"}; ${focusPremarket ? `${focusPremarket.toLocaleString()} declare a premarket submission` : "none declares a premarket submission"} and ${focusExempt.toLocaleString()} ${focusExempt === 1 ? "is" : "are"} marked premarket-exempt.`;

  return (
    <div className="udi-panel">
      {summary.name !== company && <p className="panel-note">GUDID labeler name matched: <b>{summary.name}</b></p>}
      <div className="udi-summary">
        <div className="udi-tile"><b>{summary.any.toLocaleString()}</b><span>{multi ? `devices with any of ${selected.join(" / ")}` : `devices under ${codesJoined || "any code"}`}</span></div>
        {multi && <div className="udi-tile"><b>{(summary.all ?? 0).toLocaleString()}</b><span>carry all of {codesJoined}</span></div>}
        <div className={`udi-tile${focusCount && !focusPremarket ? " warn" : ""}`}><b>{focusPremarket.toLocaleString()}</b><span>{multi ? "of those list a premarket submission" : "list a premarket submission"}</span></div>
        <div className="udi-tile"><b>{focusExempt.toLocaleString()}</b><span>{multi ? "of those marked premarket-exempt" : "marked premarket-exempt"}</span></div>
      </div>
      <p className="panel-note">{explanation}</p>
      {devices.length > 0 && (
        <>
          <div className="udi-list">
            {devices.map((device) => <UdiDeviceRow key={device.key} device={device} highlight={selected} onSelect={onSelectDevice} />)}
          </div>
          <div className="udi-list-foot">
            <span>Showing {devices.length.toLocaleString()} of {(listedAll ? summary.all ?? 0 : summary.any).toLocaleString()} {listedAll ? `devices carrying all of ${codesJoined}` : "devices"} · newest published first</span>
            {onOpenDevicesView && <button type="button" className="secondary" onClick={() => onOpenDevicesView(summary.name)}>Open in Devices (UDI) <ArrowUpRight size={13} /></button>}
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
