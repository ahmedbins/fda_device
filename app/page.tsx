"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  FileArchive,
  Filter,
  LoaderCircle,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { unzip } from "fflate";

type Product = {
  product_code?: string;
  created_date?: string;
  owner_operator_number?: string;
  exempt?: string;
  openfda?: {
    device_name?: string;
    medical_specialty_description?: string;
    regulation_number?: string;
    device_class?: string;
  };
};

type Registration = {
  registration_number?: string;
  fei_number?: string;
  status_code?: string;
  reg_expiry_date_year?: string;
  name?: string;
  business_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_code?: string;
  iso_country_code?: string;
  zip_code?: string;
  postal_code?: string;
  owner_operator?: { firm_name?: string; owner_operator_number?: string };
  us_agent?: { business_name?: string; name?: string; email_address?: string };
};

type RecordItem = {
  proprietary_name?: string[];
  establishment_type?: string[];
  registration?: Registration;
  pma_number?: string;
  k_number?: string;
  products?: Product[];
};

type Filters = {
  keyword: string;
  productCode: string;
  country: string;
  state: string;
  deviceClass: string;
  establishment: string;
};

const API = "https://api.fda.gov/device/registrationlisting.json";
const EMPTY_FILTERS: Filters = {
  keyword: "",
  productCode: "",
  country: "",
  state: "",
  deviceClass: "",
  establishment: "",
};

const ESTABLISHMENT_TYPES = [
  "Manufacture Medical Device",
  "Manufacture Medical Device for Another Party (Contract Manufacturer)",
  "Develop Specifications But Do Not Manufacture At This Facility",
  "Repack or Relabel Medical Device",
  "Sterilize Medical Device for Another Party (Contract Sterilizer)",
  "Export Device to the United States But Perform No Other Operation on Device",
  "Remanufacture Medical Device",
];

function quote(value: string) {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

function buildSearch(filters: Filters) {
  const clauses: string[] = [];
  if (filters.keyword.trim()) {
    const value = quote(filters.keyword);
    clauses.push(
      `(registration.name:${value} OR proprietary_name:${value} OR products.openfda.device_name:${value})`,
    );
  }
  if (filters.productCode.trim())
    clauses.push(`products.product_code:${quote(filters.productCode.toUpperCase())}`);
  if (filters.country.trim())
    clauses.push(`registration.iso_country_code:${quote(filters.country.toUpperCase())}`);
  if (filters.state.trim())
    clauses.push(`registration.state_code:${quote(filters.state.toUpperCase())}`);
  if (filters.deviceClass)
    clauses.push(`products.openfda.device_class:${quote(filters.deviceClass)}`);
  if (filters.establishment)
    clauses.push(`establishment_type:${quote(filters.establishment)}`);
  return clauses.join(" AND ");
}

function firmName(item: RecordItem) {
  return (
    item.registration?.name ||
    item.registration?.business_name ||
    item.registration?.owner_operator?.firm_name ||
    "Unnamed establishment"
  );
}

function productSummary(item: RecordItem) {
  const product = item.products?.[0];
  return product?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device";
}

function locationSummary(item: RecordItem) {
  const r = item.registration;
  return [r?.city, r?.state_code, r?.iso_country_code].filter(Boolean).join(", ") || "Location unavailable";
}

function localMatches(item: RecordItem, filters: Filters) {
  const haystack = [
    firmName(item),
    ...(item.proprietary_name || []),
    ...(item.products || []).flatMap((p) => [p.product_code, p.openfda?.device_name]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const r = item.registration;
  return (
    (!filters.keyword || haystack.includes(filters.keyword.toLowerCase())) &&
    (!filters.productCode ||
      item.products?.some((p) => p.product_code?.toLowerCase() === filters.productCode.toLowerCase())) &&
    (!filters.country || r?.iso_country_code?.toLowerCase() === filters.country.toLowerCase()) &&
    (!filters.state || r?.state_code?.toLowerCase() === filters.state.toLowerCase()) &&
    (!filters.deviceClass || item.products?.some((p) => p.openfda?.device_class === filters.deviceClass)) &&
    (!filters.establishment || item.establishment_type?.includes(filters.establishment))
  );
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function Home() {
  const [mode, setMode] = useState<"api" | "files">("api");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [localRecords, setLocalRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeFilters = Object.values(filters).filter(Boolean).length;

  const runSearch = useCallback(
    async (nextSkip = 0) => {
      setError("");
      setSelected(null);
      if (mode === "files") {
        setSkip(nextSkip);
        const filtered = localRecords.filter((record) => localMatches(record, filters));
        setTotal(filtered.length);
        setRecords(filtered.slice(nextSkip, nextSkip + limit));
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(limit), skip: String(nextSkip) });
        const search = buildSearch(filters);
        if (search) params.set("search", search);
        const response = await fetch(`${API}?${params.toString()}`);
        const data = (await response.json()) as {
          meta?: { results?: { total?: number } };
          results?: RecordItem[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(data.error?.message || "The FDA API could not complete this search.");
        setRecords(data.results || []);
        setTotal(data.meta?.results?.total || 0);
        setSkip(nextSkip);
      } catch (caught) {
        setRecords([]);
        setTotal(0);
        setError(caught instanceof Error ? caught.message : "Unable to reach the FDA API.");
      } finally {
        setLoading(false);
      }
    },
    [filters, limit, localRecords, mode],
  );

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setError("");
    const collected: RecordItem[] = [];
    const names: string[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        names.push(file.name);
        setImportProgress(`Parsing ${index + 1} of ${files.length}: ${file.name}`);
        let jsonText = "";
        if (file.name.toLowerCase().endsWith(".zip")) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
            unzip(bytes, (err, output) => (err ? reject(err) : resolve(output))),
          );
          const jsonEntry = Object.entries(unzipped).find(([name]) => name.toLowerCase().endsWith(".json"));
          if (!jsonEntry) throw new Error(`${file.name} does not contain a JSON file.`);
          jsonText = new TextDecoder().decode(jsonEntry[1]);
        } else {
          jsonText = await file.text();
        }
        const parsed = JSON.parse(jsonText) as RecordItem[] | { results?: RecordItem[] };
        const batch = Array.isArray(parsed) ? parsed : parsed.results;
        if (!Array.isArray(batch)) throw new Error(`${file.name} is not an openFDA results file.`);
        collected.push(...batch);
      }
      setLocalRecords(collected);
      setFileNames(names);
      setMode("files");
      setRecords(collected.slice(0, limit));
      setTotal(collected.length);
      setSkip(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Those files could not be parsed.");
    } finally {
      setImportProgress("");
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const setSource = (next: "api" | "files") => {
    setMode(next);
    setSkip(0);
    setSelected(null);
    setError("");
    if (next === "files" && localRecords.length) {
      const filtered = localRecords.filter((record) => localMatches(record, filters));
      setRecords(filtered.slice(0, limit));
      setTotal(filtered.length);
    } else {
      setRecords([]);
      setTotal(0);
    }
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setRecords(mode === "files" ? localRecords.slice(0, limit) : []);
    setTotal(mode === "files" ? localRecords.length : 0);
    setSkip(0);
    setError("");
  };

  const exportCsv = () => {
    const rows = records.map((item) => [
      item.registration?.registration_number,
      firmName(item),
      locationSummary(item),
      item.products?.map((p) => p.product_code).filter(Boolean).join("; "),
      item.products?.map((p) => p.openfda?.device_name).filter(Boolean).join("; "),
      item.establishment_type?.join("; "),
    ]);
    const csv = [
      ["Registration #", "Establishment", "Location", "Product codes", "Devices", "Establishment types"],
      ...rows,
    ]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fda-device-results.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rangeLabel = useMemo(() => {
    if (!total) return "0 records";
    return `${(skip + 1).toLocaleString()}–${Math.min(skip + records.length, total).toLocaleString()} of ${total.toLocaleString()}`;
  }, [records.length, skip, total]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FDA Device Explorer home">
          <span className="brand-mark"><PackageSearch size={19} /></span>
          <span><b>SONOVA</b> / DEVICE DATA</span>
        </a>
        <div className="source-status">
          <span className="pulse" /> openFDA live
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> FDA DEVICE DATA</div>
        <div className="hero-grid">
          <div>
            <h1>Device registrations.<br /><em>Made searchable.</em></h1>
            <p>Search FDA registrations and listings.</p>
          </div>
          <div className="dataset-note">
            <Database size={20} />
            <div><b>329,536 records</b><span>2 files · 2026-07-30</span></div>
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="Device data explorer">
        <aside className={`filter-panel ${filtersOpen ? "open" : ""}`}>
          <div className="panel-heading">
            <div><span>02</span><h2>Filters</h2></div>
            <button className="icon-button mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
          </div>

          <div className="source-switch" role="group" aria-label="Data source">
            <button className={mode === "api" ? "active" : ""} onClick={() => setSource("api")}><Database size={15} /> Live API</button>
            <button className={mode === "files" ? "active" : ""} onClick={() => setSource("files")} disabled={!localRecords.length}><FileArchive size={15} /> Local files</button>
          </div>

          <label className="field keyword-field">
            <span>Keywords</span>
            <div className="input-shell"><Search size={16} /><input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="Company, device, trade name…" onKeyDown={(e) => e.key === "Enter" && runSearch(0)} /></div>
          </label>

          <div className="two-col">
            <label className="field"><span>Product code</span><input value={filters.productCode} onChange={(e) => setFilters({ ...filters, productCode: e.target.value })} placeholder="e.g. HQY" maxLength={8} /></label>
            <label className="field"><span>Device class</span><span className="select-wrap"><select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })}><option value="">Any class</option><option value="1">Class I</option><option value="2">Class II</option><option value="3">Class III</option><option value="U">Unclassified</option></select><ChevronDown size={14} /></span></label>
          </div>

          <div className="two-col">
            <label className="field"><span>Country code</span><input value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} placeholder="US" maxLength={2} /></label>
            <label className="field"><span>State code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} placeholder="CA" maxLength={3} /></label>
          </div>

          <label className="field"><span>Establishment type</span><span className="select-wrap"><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All establishment types</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={14} /></span></label>

          <div className="query-actions">
            <button className="primary" onClick={() => { runSearch(0); setFiltersOpen(false); }} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Search records</button>
            <button className="text-button" onClick={reset}>Clear all</button>
          </div>

          <div className="import-box">
            <div className="import-copy"><Upload size={18} /><div><b>Local files</b><span>Import JSON or ZIP.</span></div></div>
            <input ref={fileInput} type="file" accept=".json,.zip,application/json,application/zip" multiple hidden onChange={(e) => importFiles(e.target.files)} />
            <button className="secondary" onClick={() => fileInput.current?.click()} disabled={loading}><FileArchive size={15} /> Choose files</button>
            {importProgress && <small><LoaderCircle className="spin" size={12} /> {importProgress}</small>}
            {!!fileNames.length && <small className="success"><Check size={12} /> {fileNames.length} file{fileNames.length > 1 ? "s" : ""} · {localRecords.length.toLocaleString()} records</small>}
          </div>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar">
            <div className="results-title">
              <button className="icon-button filter-toggle" onClick={() => setFiltersOpen(true)} aria-label="Open filters"><SlidersHorizontal size={18} /></button>
              <div><span>03 / RESULTS</span><h2>{records.length ? rangeLabel : "Search records"}</h2></div>
            </div>
            <div className="toolbar-actions">
              {activeFilters > 0 && <span className="filter-count"><Filter size={13} /> {activeFilters} active</span>}
              <label className="page-size">Rows <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option>25</option><option>50</option><option>100</option></select></label>
              <button className="icon-button" onClick={exportCsv} disabled={!records.length} aria-label="Export visible results to CSV"><ArrowDownToLine size={18} /></button>
              <button className="icon-button" onClick={() => runSearch(skip)} disabled={loading} aria-label="Refresh results"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
            </div>
          </div>

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Search interrupted</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

          {!records.length && !loading ? (
            <div className="empty-state">
              <div className="empty-number">329K</div>
              <PackageSearch size={34} />
              <h3>Search the FDA<br />device registry.</h3>
              <p>Use live data or import the two files.</p>
              <button className="primary" onClick={() => runSearch(0)}><Database size={16} /> View records</button>
            </div>
          ) : (
            <>
              <div className="table-wrap" aria-live="polite">
                <table>
                  <thead><tr><th>Establishment</th><th>Primary device</th><th>Product</th><th>Location</th><th>Class</th><th aria-label="Open record" /></tr></thead>
                  <tbody>
                    {records.map((item, index) => {
                      const product = item.products?.[0];
                      return (
                        <tr key={`${item.registration?.registration_number || "record"}-${index}`} onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(item)}>
                          <td><b>{firmName(item)}</b><span>REG {item.registration?.registration_number || "—"}</span></td>
                          <td><b>{productSummary(item)}</b><span>{item.proprietary_name?.slice(0, 2).join(" · ") || "No proprietary name"}</span></td>
                          <td><span className="code-pill">{product?.product_code || "—"}</span><span>{(item.products?.length || 0).toLocaleString()} listing{item.products?.length === 1 ? "" : "s"}</span></td>
                          <td><b>{locationSummary(item)}</b><span>{item.registration?.reg_expiry_date_year ? `Expires ${item.registration.reg_expiry_date_year}` : "Expiry not listed"}</span></td>
                          <td><span className={`class-badge class-${product?.openfda?.device_class || "u"}`}>{product?.openfda?.device_class ? `Class ${product.openfda.device_class}` : "—"}</span></td>
                          <td><ArrowRight size={17} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{rangeLabel}</span>
                <div><button className="secondary" onClick={() => runSearch(Math.max(0, skip - limit))} disabled={skip === 0 || loading}><ArrowLeft size={15} /> Previous</button><button className="secondary" onClick={() => runSearch(skip + limit)} disabled={skip + records.length >= total || loading}>Next <ArrowRight size={15} /></button></div>
              </div>
            </>
          )}
          {loading && <div className="loading-layer"><LoaderCircle className="spin" size={28} /><span>{importProgress || "Searching openFDA…"}</span></div>}
        </section>
      </section>

      {selected && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <aside className="drawer" aria-label="Registration details">
            <div className="drawer-top"><span>RECORD DETAIL</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button></div>
            <div className="drawer-hero"><span className="record-id">REG {selected.registration?.registration_number || "—"}</span><h2>{firmName(selected)}</h2><p><MapPin size={15} /> {locationSummary(selected)}</p></div>
            <div className="detail-stats"><div><span>FEI number</span><b>{selected.registration?.fei_number || "—"}</b></div><div><span>Expiry year</span><b>{selected.registration?.reg_expiry_date_year || "—"}</b></div><div><span>Products</span><b>{selected.products?.length || 0}</b></div></div>
            <section className="detail-section"><h3><Building2 size={16} /> Establishment roles</h3><div className="chips">{selected.establishment_type?.map((type) => <span key={type}>{type}</span>) || <span>Not listed</span>}</div></section>
            <section className="detail-section"><h3><PackageSearch size={16} /> Device listings</h3><div className="product-list">{selected.products?.map((product, index) => <article key={`${product.product_code}-${index}`}><div><span className="code-pill">{product.product_code || "—"}</span><span className={`class-badge class-${product.openfda?.device_class || "u"}`}>{product.openfda?.device_class ? `Class ${product.openfda.device_class}` : "Unclassified"}</span></div><h4>{product.openfda?.device_name || selected.proprietary_name?.[index] || "Unnamed device"}</h4><p>{product.openfda?.medical_specialty_description || "Specialty unavailable"} · Regulation {product.openfda?.regulation_number || "—"}</p></article>) || <p>No device listings attached.</p>}</div></section>
            <section className="detail-section raw-section"><details><summary>View raw JSON <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected, null, 2)}</pre></details></section>
          </aside>
        </div>
      )}
    </main>
  );
}
