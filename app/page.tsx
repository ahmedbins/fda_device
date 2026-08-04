"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  Ear,
  FileArchive,
  Filter,
  Link2,
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
import {
  API,
  CODE_NAMES,
  PRESET,
  PRESET_CODES,
  type RecordItem,
  companyName,
  downloadCsv,
  firmName,
  locationSummary,
  parseCodes,
  quote,
  useDevHost,
} from "./fda-shared";

type MatrixRow = {
  key: string;
  productCode: string;
  deviceType: string;
  company: string;
  devices: string[];
  registrations: number;
};

type Filters = {
  keyword: string;
  productCodes: string[];
  country: string;
  state: string;
  deviceClass: string;
  establishment: string;
};

type ViewMode = "records" | "matrix";

const EXPORT_CAP = 26000; // openFDA pagination ceiling: skip<=25000 + limit<=1000
const EMPTY_FILTERS: Filters = {
  keyword: "",
  productCodes: [],
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

function buildSearch(filters: Filters) {
  const clauses: string[] = [];
  if (filters.keyword.trim()) {
    const value = quote(filters.keyword);
    clauses.push(
      `(registration.name:${value} OR registration.owner_operator.firm_name:${value} OR proprietary_name:${value} OR products.openfda.device_name:${value})`,
    );
  }
  if (filters.productCodes.length) {
    const codes = filters.productCodes.map(quote);
    clauses.push(
      codes.length === 1
        ? `products.product_code:${codes[0]}`
        : `products.product_code:(${codes.join(" OR ")})`,
    );
  }
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

function productFilterActive(filters: Filters) {
  return filters.productCodes.length > 0 || !!filters.deviceClass;
}

/** Products on this record that satisfy the product-level filters (code + class). */
function matchingProducts(item: RecordItem, filters: Filters) {
  const products = item.products || [];
  if (!productFilterActive(filters)) return products;
  const codeSet = new Set(filters.productCodes.map((code) => code.toUpperCase()));
  return products.filter(
    (product) =>
      (!codeSet.size || (product.product_code && codeSet.has(product.product_code.toUpperCase()))) &&
      (!filters.deviceClass || product.openfda?.device_class === filters.deviceClass),
  );
}

function buildMatrix(items: RecordItem[], filters: Filters): MatrixRow[] {
  const groups = new Map<string, { productCode: string; deviceType: string; company: string; devices: Set<string>; registrationIds: Set<string> }>();
  items.forEach((item, recordIndex) => {
    const company = companyName(item);
    const tradeNames = (item.proprietary_name || []).filter(Boolean);
    matchingProducts(item, filters).forEach((product) => {
      const productCode = product.product_code || "—";
      const deviceType = product.openfda?.device_name || "Unspecified device type";
      const key = `${productCode.toLowerCase()}|${deviceType.toLowerCase()}|${company.toLowerCase()}`;
      const existing = groups.get(key) || {
        productCode,
        deviceType,
        company,
        devices: new Set<string>(),
        registrationIds: new Set<string>(),
      };
      (tradeNames.length ? tradeNames : [deviceType]).forEach((name) => existing.devices.add(name));
      existing.registrationIds.add(item.registration?.registration_number || `record-${recordIndex}`);
      groups.set(key, existing);
    });
  });
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      productCode: value.productCode,
      deviceType: value.deviceType,
      company: value.company,
      devices: [...value.devices].sort((a, b) => a.localeCompare(b)),
      registrations: value.registrationIds.size,
    }))
    .sort((a, b) => a.productCode.localeCompare(b.productCode) || a.company.localeCompare(b.company));
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
  const codeSet = new Set(filters.productCodes.map((code) => code.toUpperCase()));
  return (
    (!filters.keyword || haystack.includes(filters.keyword.toLowerCase())) &&
    (!codeSet.size ||
      !!item.products?.some((p) => p.product_code && codeSet.has(p.product_code.toUpperCase()))) &&
    (!filters.country || r?.iso_country_code?.toLowerCase() === filters.country.toLowerCase()) &&
    (!filters.state || r?.state_code?.toLowerCase() === filters.state.toLowerCase()) &&
    (!filters.deviceClass || !!item.products?.some((p) => p.openfda?.device_class === filters.deviceClass)) &&
    (!filters.establishment || !!item.establishment_type?.includes(filters.establishment))
  );
}

function localCodeCounts(items: RecordItem[], codes: string[]) {
  if (!codes.length) return null;
  return codes.map((code) => ({
    code,
    count: items.filter((item) =>
      item.products?.some((p) => p.product_code?.toUpperCase() === code),
    ).length,
  }));
}

function syncUrl(filters: Filters, view: ViewMode) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.productCodes.length) params.set("codes", filters.productCodes.join(","));
  if (filters.keyword.trim()) params.set("kw", filters.keyword.trim());
  if (filters.country.trim()) params.set("country", filters.country.trim().toUpperCase());
  if (filters.state.trim()) params.set("state", filters.state.trim().toUpperCase());
  if (filters.deviceClass) params.set("class", filters.deviceClass);
  if (filters.establishment) params.set("est", filters.establishment);
  if (view === "matrix") params.set("view", "matrix");
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function initialStateFromUrl() {
  const fallback = { filters: EMPTY_FILTERS, view: "records" as ViewMode, autorun: false };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const filters: Filters = {
    keyword: params.get("kw") || "",
    productCodes: parseCodes(params.get("codes") || ""),
    country: (params.get("country") || "").toUpperCase(),
    state: (params.get("state") || "").toUpperCase(),
    deviceClass: params.get("class") || "",
    establishment: params.get("est") || "",
  };
  const view: ViewMode = params.get("view") === "matrix" ? "matrix" : "records";
  const autorun = !!(
    filters.keyword || filters.productCodes.length || filters.country ||
    filters.state || filters.deviceClass || filters.establishment
  );
  return { filters, view, autorun };
}

export default function Home() {
  const [initial] = useState(initialStateFromUrl);
  const [mode, setMode] = useState<"api" | "files">("api");
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [codeDraft, setCodeDraft] = useState("");
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
  const [exportProgress, setExportProgress] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [datasetUpdated, setDatasetUpdated] = useState("");
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [codeCounts, setCodeCounts] = useState<{ code: string; count: number }[] | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  const devHost = useDevHost();
  const activeFilters = [
    filters.keyword.trim(),
    filters.productCodes.length,
    filters.country.trim(),
    filters.state.trim(),
    filters.deviceClass,
    filters.establishment,
  ].filter(Boolean).length;

  const presetActive =
    filters.productCodes.length === PRESET_CODES.length &&
    PRESET_CODES.every((code) => filters.productCodes.includes(code));

  const runSearch = useCallback(
    async (nextSkip = 0, requestedView: ViewMode = viewMode, nextFilters: Filters = filters) => {
      const seq = ++searchSeq.current;
      setError("");
      setSelected(null);
      if (mode === "files") {
        const filtered = localRecords.filter((record) => localMatches(record, nextFilters));
        setSkip(nextSkip);
        setTotal(filtered.length);
        setRecords(requestedView === "matrix" ? filtered.slice(0, 1000) : filtered.slice(nextSkip, nextSkip + limit));
        setAppliedFilters(nextFilters);
        setFetchedAt(new Date());
        setCodeCounts(localCodeCounts(filtered, nextFilters.productCodes));
        syncUrl(nextFilters, requestedView);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(requestedView === "matrix" ? 1000 : limit),
          skip: String(requestedView === "matrix" ? 0 : nextSkip),
        });
        const search = buildSearch(nextFilters);
        if (search) params.set("search", search);
        const response = await fetch(`${API}?${params.toString()}`);
        const data = (await response.json()) as {
          meta?: { last_updated?: string; results?: { total?: number } };
          results?: RecordItem[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(data.error?.message || "The FDA API could not complete this search.");
        if (seq !== searchSeq.current) return;
        setRecords(data.results || []);
        setTotal(data.meta?.results?.total || 0);
        setSkip(requestedView === "matrix" ? 0 : nextSkip);
        setAppliedFilters(nextFilters);
        setFetchedAt(new Date());
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        syncUrl(nextFilters, requestedView);
        if (nextFilters.productCodes.length) {
          const countParams = new URLSearchParams({ count: "products.product_code", limit: "1000" });
          if (search) countParams.set("search", search);
          fetch(`${API}?${countParams.toString()}`)
            .then((res) => res.json())
            .then((countData: { results?: { term?: string; count?: number }[] }) => {
              if (seq !== searchSeq.current) return;
              const terms = new Map(
                (countData.results || []).map((entry) => [String(entry.term).toUpperCase(), entry.count || 0]),
              );
              setCodeCounts(nextFilters.productCodes.map((code) => ({ code, count: terms.get(code) ?? 0 })));
            })
            .catch(() => setCodeCounts(null));
        } else {
          setCodeCounts(null);
        }
      } catch (caught) {
        if (seq !== searchSeq.current) return;
        setRecords([]);
        setTotal(0);
        setCodeCounts(null);
        setError(caught instanceof Error ? caught.message : "Unable to reach the FDA API.");
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    },
    [filters, limit, localRecords, mode, viewMode],
  );

  useEffect(() => {
    fetch(`${API}?limit=1`)
      .then((res) => res.json())
      .then((data: { meta?: { last_updated?: string; results?: { total?: number } } }) => {
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        if (data.meta?.results?.total) setDatasetTotal(data.meta.results.total);
      })
      .catch(() => {});
    if (initial.autorun) queueMicrotask(() => runSearch(0, initial.view, initial.filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitCodes = (text: string) => {
    const parsed = parseCodes(text);
    if (parsed.length) {
      setFilters((prev) => ({
        ...prev,
        productCodes: [...new Set([...prev.productCodes, ...parsed])],
      }));
    }
    setCodeDraft("");
  };

  const removeCode = (code: string) => {
    const next = { ...filters, productCodes: filters.productCodes.filter((c) => c !== code) };
    setFilters(next);
    if (records.length || total) runSearch(0, viewMode, next);
  };

  const applyPreset = () => {
    const next = { ...filters, productCodes: [...PRESET_CODES] };
    setFilters(next);
    setCodeDraft("");
    runSearch(0, viewMode, next);
  };

  const togglePreset = () => {
    if (presetActive) {
      const next = { ...filters, productCodes: [] };
      setFilters(next);
      if (records.length || total) runSearch(0, viewMode, next);
    } else {
      applyPreset();
    }
  };

  const searchNow = () => {
    let next = filters;
    const parsed = parseCodes(codeDraft);
    if (parsed.length) {
      next = { ...filters, productCodes: [...new Set([...filters.productCodes, ...parsed])] };
      setFilters(next);
    }
    setCodeDraft("");
    runSearch(0, viewMode, next);
    setFiltersOpen(false);
  };

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
      const filtered = collected.filter((record) => localMatches(record, filters));
      setRecords(viewMode === "matrix" ? filtered.slice(0, 1000) : filtered.slice(0, limit));
      setTotal(filtered.length);
      setSkip(0);
      setAppliedFilters(filters);
      setFetchedAt(new Date());
      setCodeCounts(localCodeCounts(filtered, filters.productCodes));
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
      setRecords(viewMode === "matrix" ? filtered.slice(0, 1000) : filtered.slice(0, limit));
      setTotal(filtered.length);
      setAppliedFilters(filters);
      setFetchedAt(new Date());
      setCodeCounts(localCodeCounts(filtered, filters.productCodes));
    } else {
      setRecords([]);
      setTotal(0);
      setCodeCounts(null);
    }
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCodeDraft("");
    setCodeCounts(null);
    setRecords(mode === "files" ? localRecords.slice(0, limit) : []);
    setTotal(mode === "files" ? localRecords.length : 0);
    setSkip(0);
    setError("");
    syncUrl(EMPTY_FILTERS, viewMode);
  };

  const fetchAllMatching = async () => {
    if (mode === "files") return localRecords.filter((record) => localMatches(record, appliedFilters));
    const cap = Math.min(total, EXPORT_CAP);
    const all: RecordItem[] = [];
    const search = buildSearch(appliedFilters);
    for (let offset = 0; offset < cap; offset += 1000) {
      setExportProgress(`Downloading ${Math.min(offset + 1000, cap).toLocaleString()} of ${cap.toLocaleString()} records…`);
      const params = new URLSearchParams({
        limit: String(Math.min(1000, cap - offset)),
        skip: String(offset),
      });
      if (search) params.set("search", search);
      const response = await fetch(`${API}?${params.toString()}`);
      const data = (await response.json()) as { results?: RecordItem[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || "Export interrupted while fetching records.");
      const batch = data.results || [];
      all.push(...batch);
      if (!batch.length) break;
    }
    return all;
  };

  const exportCsv = async () => {
    if (!total || exportProgress) return;
    setError("");
    try {
      const all = await fetchAllMatching();
      const stamp = new Date().toISOString().slice(0, 10);
      const codesPart = appliedFilters.productCodes.length ? appliedFilters.productCodes.join("+") : "all";
      if (viewMode === "matrix") {
        const rows = buildMatrix(all, appliedFilters).map((row) => [
          row.productCode,
          row.deviceType,
          row.company,
          row.devices.join("; "),
          row.registrations,
        ]);
        downloadCsv(
          [["Product code", "Device type", "Company", "Registered devices", "Registrations"], ...rows],
          `fda-devices-matrix-${codesPart}-${stamp}.csv`,
        );
      } else {
        const filtered = productFilterActive(appliedFilters);
        const rows = all.map((item) => {
          const matched = matchingProducts(item, appliedFilters);
          return [
            item.registration?.registration_number,
            firmName(item),
            companyName(item),
            item.registration?.city,
            item.registration?.state_code,
            item.registration?.iso_country_code,
            [...new Set(matched.map((p) => p.product_code).filter(Boolean))].join("; "),
            [...new Set(matched.map((p) => p.openfda?.device_name).filter(Boolean))].join("; "),
            [...new Set((item.products || []).map((p) => p.product_code).filter(Boolean))].join("; "),
            (item.proprietary_name || []).join("; "),
            (item.establishment_type || []).join("; "),
            item.registration?.reg_expiry_date_year,
          ];
        });
        downloadCsv(
          [[
            "Registration #",
            "Establishment",
            "Owner / operator",
            "City",
            "State",
            "Country",
            filtered ? "Matched product codes" : "Product codes",
            filtered ? "Matched device types" : "Device types",
            "All product codes",
            "Trade names",
            "Establishment types",
            "Expiry year",
          ], ...rows],
          `fda-devices-${codesPart}-${stamp}.csv`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The export could not be completed.");
    } finally {
      setExportProgress("");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      setError("Could not copy the link — copy it from the address bar instead.");
    }
  };

  const rangeLabel = useMemo(() => {
    if (!total) return "0 records";
    return `${(skip + 1).toLocaleString()}–${Math.min(skip + records.length, total).toLocaleString()} of ${total.toLocaleString()}`;
  }, [records.length, skip, total]);

  const matrixRows = useMemo(() => buildMatrix(records, appliedFilters), [records, appliedFilters]);

  const drawerProducts = useMemo(() => {
    if (!selected) return [];
    const matched = new Set(matchingProducts(selected, appliedFilters));
    return [...(selected.products || [])]
      .map((product) => ({ product, matches: matched.has(product) }))
      .sort((a, b) => Number(b.matches) - Number(a.matches));
  }, [selected, appliedFilters]);

  const switchView = (nextView: ViewMode) => {
    if (nextView === viewMode) return;
    setViewMode(nextView);
    if (records.length || total) {
      runSearch(0, nextView, appliedFilters);
    } else {
      syncUrl(appliedFilters, nextView);
    }
  };

  const exportCount = Math.min(total, mode === "files" ? total : EXPORT_CAP);
  const timeFormat: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FDA Device Explorer home">
          <span className="brand-mark"><PackageSearch size={19} /></span>
          <span><b>SONOVA</b> / DEVICE DATA</span>
          {devHost && <span className="dev-badge">DEV</span>}
        </a>
        <div className="topbar-right">
          <nav className="top-nav" aria-label="Pages">
            <a className="current" href="/">Explorer</a>
            <a href="/monitor">Monitoring</a>
          </nav>
          <div className="source-status">
            <span className="pulse" /> openFDA live{datasetUpdated ? ` · data ${datasetUpdated}` : ""}
          </div>
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
            <div>
              <b>{datasetTotal ? `${datasetTotal.toLocaleString()} records` : "openFDA device registry"}</b>
              <span>{datasetUpdated ? `Dataset refreshed ${datasetUpdated}` : "Registrations & listings"}</span>
            </div>
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
            <div className="input-shell"><Search size={16} /><input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="Company, device, trade name…" onKeyDown={(e) => e.key === "Enter" && searchNow()} /></div>
          </label>

          <div className="field">
            <span>Product codes</span>
            <div className="chip-input" onClick={() => codeInput.current?.focus()}>
              {filters.productCodes.map((code) => (
                <span key={code} className="chip" title={CODE_NAMES.get(code) || `Product code ${code}`}>
                  {code}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeCode(code); }} aria-label={`Remove ${code}`}><X size={11} /></button>
                </span>
              ))}
              <input
                ref={codeInput}
                value={codeDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/[,\s;]/.test(value)) commitCodes(value);
                  else setCodeDraft(value.toUpperCase());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (codeDraft.trim()) commitCodes(codeDraft);
                    else searchNow();
                  } else if (e.key === "Backspace" && !codeDraft && filters.productCodes.length) {
                    removeCode(filters.productCodes[filters.productCodes.length - 1]);
                  }
                }}
                onBlur={() => codeDraft.trim() && commitCodes(codeDraft)}
                placeholder={filters.productCodes.length ? "Add code…" : "e.g. QUH, OSM, SCR"}
                aria-label="Product codes"
              />
            </div>
            <small className="field-hint">Add several codes — results match any of them.</small>
          </div>

          <button
            type="button"
            className={`preset-toggle ${presetActive ? "active" : ""}`}
            onClick={togglePreset}
            aria-pressed={presetActive}
            title={PRESET.map((p) => `${p.code} — ${p.name}`).join("\n")}
          >
            <Ear size={16} />
            <span className="preset-copy"><b>Hearing aid preset</b><em>{PRESET_CODES.join(" · ")}</em></span>
            <span className="preset-state">{presetActive ? <><Check size={12} /> ON</> : "OFF"}</span>
          </button>

          <div className="two-col">
            <label className="field"><span>Device class</span><span className="select-wrap"><select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })}><option value="">Any class</option><option value="1">Class I</option><option value="2">Class II</option><option value="3">Class III</option><option value="U">Unclassified</option></select><ChevronDown size={14} /></span></label>
            <label className="field"><span>Country code</span><input value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} placeholder="US" maxLength={2} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
          </div>

          <div className="two-col">
            <label className="field"><span>State code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} placeholder="CA" maxLength={3} onKeyDown={(e) => e.key === "Enter" && searchNow()} /></label>
            <label className="field"><span>Establishment</span><span className="select-wrap"><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All types</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={14} /></span></label>
          </div>

          <div className="query-actions">
            <button className="primary" onClick={searchNow} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Search records</button>
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
              <div>
                <span>03 / RESULTS</span>
                <h2>{records.length ? (viewMode === "matrix" ? `${matrixRows.length.toLocaleString()} grouped rows` : rangeLabel) : "Search records"}</h2>
                {fetchedAt && (
                  <small className="fetch-meta">
                    {mode === "api"
                      ? `Fetched ${fetchedAt.toLocaleTimeString([], timeFormat)}${datasetUpdated ? ` · FDA dataset updated ${datasetUpdated}` : ""}`
                      : `Filtered ${fetchedAt.toLocaleTimeString([], timeFormat)} · local import`}
                  </small>
                )}
              </div>
            </div>
            <div className="toolbar-actions">
              <div className="view-switch" role="group" aria-label="Results view">
                <button className={viewMode === "records" ? "active" : ""} onClick={() => switchView("records")}>Records</button>
                <button className={viewMode === "matrix" ? "active" : ""} onClick={() => switchView("matrix")}>Company + devices</button>
              </div>
              {activeFilters > 0 && <span className="filter-count"><Filter size={13} /> {activeFilters} active</span>}
              {viewMode === "records" && <label className="page-size">Rows <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option>25</option><option>50</option><option>100</option></select></label>}
              <button
                className="secondary export-button"
                onClick={exportCsv}
                disabled={!total || loading || !!exportProgress}
                title={total > EXPORT_CAP && mode === "api" ? `Exports the first ${EXPORT_CAP.toLocaleString()} matching records (openFDA limit)` : "Download every matching record as CSV"}
              >
                <ArrowDownToLine size={15} /> CSV{total ? ` · ${exportCount.toLocaleString()}` : ""}
              </button>
              <button className="icon-button" onClick={copyLink} disabled={!fetchedAt} aria-label="Copy shareable link" title="Copy a shareable link to this exact view">{linkCopied ? <Check size={17} /> : <Link2 size={17} />}</button>
              <button className="icon-button" onClick={() => runSearch(skip, viewMode, appliedFilters)} disabled={loading} aria-label="Refresh results" title="Re-run this search"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
            </div>
          </div>

          {error && <div className="error-banner"><CircleAlert size={18} /><div><b>Search interrupted</b><span>{error}</span></div><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}

          {!records.length && !loading ? (
            <div className="empty-state">
              <div className="empty-number">{datasetTotal ? `${Math.round(datasetTotal / 1000)}K` : "FDA"}</div>
              <PackageSearch size={34} />
              <h3>Search the FDA<br />device registry.</h3>
              <p>Use live data or import the two files.</p>
              <div className="empty-actions">
                <button className="primary" onClick={() => runSearch(0)}><Database size={16} /> View records</button>
                <button className="secondary" onClick={applyPreset}><Ear size={15} /> Load the 6 hearing-aid codes</button>
              </div>
            </div>
          ) : (
            <>
              {codeCounts && records.length > 0 && (
                <div className="code-count-strip" aria-label="Matches per product code">
                  <span className="strip-label"><Filter size={12} /> Per code</span>
                  {codeCounts.map(({ code, count }) => (
                    <span key={code} className={`code-count${count ? "" : " zero"}`} title={CODE_NAMES.get(code) || `Product code ${code}`}>
                      <b>{code}</b> {count.toLocaleString()}
                    </span>
                  ))}
                </div>
              )}
              {viewMode === "matrix" && (
                <div className="matrix-note">
                  <div><Building2 size={16} /><span><b>{matrixRows.length.toLocaleString()} company-device groups</b> from {records.length.toLocaleString()} matching records</span></div>
                  {total > 1000 && <span>Grouping the first 1,000 of {total.toLocaleString()} matches — the CSV export fetches them all.</span>}
                </div>
              )}
              <div className="table-wrap" aria-live="polite">
                {viewMode === "records" ? <table>
                  <thead><tr><th>Establishment</th><th>Primary device</th><th>Product</th><th>Location</th><th>Class</th><th aria-label="Open record" /></tr></thead>
                  <tbody>
                    {records.map((item, index) => {
                      const matched = matchingProducts(item, appliedFilters);
                      const shown = matched.length ? matched : item.products || [];
                      const primary = shown[0];
                      const codes = [...new Set(shown.map((p) => p.product_code).filter(Boolean))] as string[];
                      const listingCount = item.products?.length || 0;
                      return (
                        <tr key={`${item.registration?.registration_number || "record"}-${index}`} onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(item)}>
                          <td><b>{firmName(item)}</b><span>REG {item.registration?.registration_number || "—"}</span></td>
                          <td><b>{primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device"}</b><span>{item.proprietary_name?.slice(0, 2).join(" · ") || "No proprietary name"}</span></td>
                          <td>
                            <div className="pill-row">
                              {codes.slice(0, 3).map((code) => <span key={code} className="code-pill">{code}</span>)}
                              {codes.length > 3 && <span className="pill-more">+{codes.length - 3}</span>}
                              {!codes.length && <span className="code-pill">—</span>}
                            </div>
                            <span>{productFilterActive(appliedFilters) ? `${matched.length} of ${listingCount} listing${listingCount === 1 ? "" : "s"} match` : `${listingCount.toLocaleString()} listing${listingCount === 1 ? "" : "s"}`}</span>
                          </td>
                          <td><b>{locationSummary(item)}</b><span>{item.registration?.reg_expiry_date_year ? `Expires ${item.registration.reg_expiry_date_year}` : "Expiry not listed"}</span></td>
                          <td><span className={`class-badge class-${primary?.openfda?.device_class || "u"}`}>{primary?.openfda?.device_class ? `Class ${primary.openfda.device_class}` : "—"}</span></td>
                          <td><ArrowRight size={17} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table> : <table className="matrix-table">
                  <thead><tr><th>Product code</th><th>Device type</th><th>Company</th><th>Registered devices</th><th>Regs.</th></tr></thead>
                  <tbody>
                    {matrixRows.map((row) => (
                      <tr key={row.key}>
                        <td><span className="code-pill">{row.productCode}</span></td>
                        <td><b>{row.deviceType}</b></td>
                        <td><b>{row.company}</b></td>
                        <td><div className="device-name-list">{row.devices.map((device) => <span key={device}>{device}</span>)}</div></td>
                        <td><b>{row.registrations}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
              </div>
              {viewMode === "records" && <div className="pagination">
                <span>{rangeLabel}</span>
                <div><button className="secondary" onClick={() => runSearch(Math.max(0, skip - limit), viewMode, appliedFilters)} disabled={skip === 0 || loading}><ArrowLeft size={15} /> Previous</button><button className="secondary" onClick={() => runSearch(skip + limit, viewMode, appliedFilters)} disabled={skip + records.length >= total || loading}>Next <ArrowRight size={15} /></button></div>
              </div>}
            </>
          )}
          {(loading || exportProgress) && <div className="loading-layer"><LoaderCircle className="spin" size={28} /><span>{exportProgress || importProgress || "Searching openFDA…"}</span></div>}
        </section>
      </section>

      {selected && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <aside className="drawer" aria-label="Registration details">
            <div className="drawer-top"><span>RECORD DETAIL</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19} /></button></div>
            <div className="drawer-hero"><span className="record-id">REG {selected.registration?.registration_number || "—"}</span><h2>{firmName(selected)}</h2><p><MapPin size={15} /> {locationSummary(selected)}</p></div>
            <div className="detail-stats"><div><span>FEI number</span><b>{selected.registration?.fei_number || "—"}</b></div><div><span>Expiry year</span><b>{selected.registration?.reg_expiry_date_year || "—"}</b></div><div><span>Products</span><b>{selected.products?.length || 0}</b></div></div>
            <section className="detail-section"><h3><Building2 size={16} /> Establishment roles</h3><div className="chips">{selected.establishment_type?.map((type) => <span key={type}>{type}</span>) || <span>Not listed</span>}</div></section>
            <section className="detail-section">
              <h3>
                <PackageSearch size={16} /> Device listings
                {productFilterActive(appliedFilters) && <i className="listing-note">{drawerProducts.filter((entry) => entry.matches).length} of {drawerProducts.length} match filter</i>}
              </h3>
              <div className="product-list">
                {drawerProducts.length ? drawerProducts.map(({ product, matches }, index) => (
                  <article key={`${product.product_code}-${index}`} className={productFilterActive(appliedFilters) && !matches ? "dim" : ""}>
                    <div>
                      <span className="code-pill">{product.product_code || "—"}</span>
                      <span>
                        {productFilterActive(appliedFilters) && matches && <span className="match-tag">Match</span>}
                        <span className={`class-badge class-${product.openfda?.device_class || "u"}`}>{product.openfda?.device_class ? `Class ${product.openfda.device_class}` : "Unclassified"}</span>
                      </span>
                    </div>
                    <h4>{product.openfda?.device_name || "Unnamed device"}</h4>
                    <p>{product.openfda?.medical_specialty_description || "Specialty unavailable"} · Regulation {product.openfda?.regulation_number || "—"}</p>
                  </article>
                )) : <p>No device listings attached.</p>}
              </div>
            </section>
            <section className="detail-section raw-section"><details><summary>View raw JSON <ChevronDown size={15} /></summary><pre>{JSON.stringify(selected, null, 2)}</pre></details></section>
          </aside>
        </div>
      )}
    </main>
  );
}
