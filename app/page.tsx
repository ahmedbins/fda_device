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
  Columns3,
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
  productListings: number;
  establishments: number;
  deviceClasses: string[];
  specialties: string[];
  countries: string[];
  latestListing: string;
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
type RecordColumn = "establishment" | "ownerOperator" | "primaryDevice" | "productCodes" | "listedProducts" | "tradeNames" | "location" | "deviceClass" | "expiry" | "registrationNumber" | "feiNumber";
type MatrixColumn = "productCode" | "deviceType" | "company" | "listedDeviceCount" | "registeredDevices" | "registrations" | "productListings" | "establishments" | "deviceClass" | "specialty" | "countries" | "latestListing";

const RECORD_COLUMN_OPTIONS: { key: RecordColumn; label: string; hint: string }[] = [
  { key: "establishment", label: "Establishment", hint: "Registered facility name" },
  { key: "ownerOperator", label: "Owner / operator", hint: "Parent company or legal operator" },
  { key: "primaryDevice", label: "Primary device", hint: "First matching FDA device type" },
  { key: "productCodes", label: "Product codes", hint: "Matching FDA product codes" },
  { key: "listedProducts", label: "Listed products", hint: "Matching product entries on the record" },
  { key: "tradeNames", label: "Trade names", hint: "Proprietary device names" },
  { key: "location", label: "Location", hint: "City, state and country" },
  { key: "deviceClass", label: "Device class", hint: "FDA regulatory class" },
  { key: "expiry", label: "Expiry year", hint: "Registration expiry year" },
  { key: "registrationNumber", label: "Registration #", hint: "FDA registration number" },
  { key: "feiNumber", label: "FEI number", hint: "FDA establishment identifier" },
];

const MATRIX_COLUMN_OPTIONS: { key: MatrixColumn; label: string; hint: string }[] = [
  { key: "productCode", label: "Product code", hint: "FDA product code" },
  { key: "deviceType", label: "Device type", hint: "FDA device classification name" },
  { key: "company", label: "Company", hint: "Owner / operator" },
  { key: "listedDeviceCount", label: "Listed devices", hint: "Unique proprietary names for this company and code" },
  { key: "registeredDevices", label: "Registered devices", hint: "Unique proprietary device names" },
  { key: "registrations", label: "Registrations", hint: "Distinct FDA registration records" },
  { key: "productListings", label: "Product listings", hint: "Raw matching product entries" },
  { key: "establishments", label: "Establishments", hint: "Distinct registered facilities" },
  { key: "deviceClass", label: "Device class", hint: "FDA regulatory classes" },
  { key: "specialty", label: "Medical specialty", hint: "FDA specialty descriptions" },
  { key: "countries", label: "Countries", hint: "Countries represented by matching facilities" },
  { key: "latestListing", label: "Latest listing", hint: "Newest product created date in the group" },
];

const DEFAULT_RECORD_COLUMNS: RecordColumn[] = ["establishment", "primaryDevice", "productCodes", "listedProducts", "location", "deviceClass"];
const DEFAULT_MATRIX_COLUMNS: MatrixColumn[] = ["productCode", "deviceType", "company", "listedDeviceCount", "registeredDevices", "registrations"];

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
  const groups = new Map<string, {
    productCode: string;
    deviceType: string;
    company: string;
    devices: Set<string>;
    registrationIds: Set<string>;
    productListings: number;
    establishments: Set<string>;
    deviceClasses: Set<string>;
    specialties: Set<string>;
    countries: Set<string>;
    latestListing: string;
  }>();
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
        productListings: 0,
        establishments: new Set<string>(),
        deviceClasses: new Set<string>(),
        specialties: new Set<string>(),
        countries: new Set<string>(),
        latestListing: "",
      };
      tradeNames.forEach((name) => existing.devices.add(name));
      existing.registrationIds.add(item.registration?.registration_number || `record-${recordIndex}`);
      existing.productListings += 1;
      existing.establishments.add(firmName(item));
      if (product.openfda?.device_class) existing.deviceClasses.add(product.openfda.device_class);
      if (product.openfda?.medical_specialty_description) existing.specialties.add(product.openfda.medical_specialty_description);
      if (item.registration?.iso_country_code) existing.countries.add(item.registration.iso_country_code);
      if (product.created_date && product.created_date > existing.latestListing) existing.latestListing = product.created_date;
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
      productListings: value.productListings,
      establishments: value.establishments.size,
      deviceClasses: [...value.deviceClasses].sort(),
      specialties: [...value.specialties].sort(),
      countries: [...value.countries].sort(),
      latestListing: value.latestListing,
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
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [codeCounts, setCodeCounts] = useState<{ code: string; count: number }[] | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [recordColumns, setRecordColumns] = useState<RecordColumn[]>(DEFAULT_RECORD_COLUMNS);
  const [matrixColumns, setMatrixColumns] = useState<MatrixColumn[]>(DEFAULT_MATRIX_COLUMNS);
  const [columnPrefsReady, setColumnPrefsReady] = useState(false);
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
        setCheckedAt(new Date());
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
        setCheckedAt(new Date());
      })
      .catch(() => {});
    if (initial.autorun) queueMicrotask(() => runSearch(0, initial.view, initial.filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const savedRecords = JSON.parse(localStorage.getItem("fda-record-columns") || "null") as RecordColumn[] | null;
      const savedMatrix = JSON.parse(localStorage.getItem("fda-matrix-columns") || "null") as MatrixColumn[] | null;
      const validRecords = savedRecords?.filter((key) => RECORD_COLUMN_OPTIONS.some((option) => option.key === key));
      const validMatrix = savedMatrix?.filter((key) => MATRIX_COLUMN_OPTIONS.some((option) => option.key === key));
      queueMicrotask(() => {
        if (validRecords?.length) setRecordColumns(validRecords);
        if (validMatrix?.length) setMatrixColumns(validMatrix);
        setColumnPrefsReady(true);
      });
    } catch {
      // Ignore malformed local preferences and use the defaults.
      queueMicrotask(() => setColumnPrefsReady(true));
    }
  }, []);

  useEffect(() => {
    if (!columnPrefsReady) return;
    localStorage.setItem("fda-record-columns", JSON.stringify(recordColumns));
    localStorage.setItem("fda-matrix-columns", JSON.stringify(matrixColumns));
  }, [columnPrefsReady, recordColumns, matrixColumns]);

  const toggleRecordColumn = (key: RecordColumn) => {
    setRecordColumns((current) => current.includes(key)
      ? (current.length > 1 ? current.filter((column) => column !== key) : current)
      : [...current, key]);
  };

  const toggleMatrixColumn = (key: MatrixColumn) => {
    setMatrixColumns((current) => current.includes(key)
      ? (current.length > 1 ? current.filter((column) => column !== key) : current)
      : [...current, key]);
  };

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
        const labels: Record<MatrixColumn, string> = {
          productCode: "Product code", deviceType: "Device type", company: "Company",
          listedDeviceCount: "Listed devices", registeredDevices: "Registered devices",
          registrations: "Registrations", productListings: "Product listings",
          establishments: "Establishments", deviceClass: "Device class",
          specialty: "Medical specialty", countries: "Countries", latestListing: "Latest listing",
        };
        const value = (row: MatrixRow, column: MatrixColumn): unknown => ({
          productCode: row.productCode,
          deviceType: row.deviceType,
          company: row.company,
          listedDeviceCount: row.devices.length,
          registeredDevices: row.devices.join("; "),
          registrations: row.registrations,
          productListings: row.productListings,
          establishments: row.establishments,
          deviceClass: row.deviceClasses.join("; "),
          specialty: row.specialties.join("; "),
          countries: row.countries.join("; "),
          latestListing: row.latestListing,
        })[column];
        const rows = buildMatrix(all, appliedFilters).map((row) => matrixColumns.map((column) => value(row, column)));
        downloadCsv(
          [matrixColumns.map((column) => labels[column]), ...rows],
          `fda-devices-matrix-${codesPart}-${stamp}.csv`,
        );
      } else {
        const labels: Record<RecordColumn, string> = {
          establishment: "Establishment", ownerOperator: "Owner / operator", primaryDevice: "Primary device",
          productCodes: "Product codes", listedProducts: "Listed products", tradeNames: "Trade names",
          location: "Location", deviceClass: "Device class", expiry: "Expiry year",
          registrationNumber: "Registration #", feiNumber: "FEI number",
        };
        const rows = all.map((item) => {
          const matched = matchingProducts(item, appliedFilters);
          const shown = productFilterActive(appliedFilters) ? matched : item.products || [];
          const primary = shown[0];
          const values: Record<RecordColumn, unknown> = {
            establishment: firmName(item),
            ownerOperator: companyName(item),
            primaryDevice: primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device",
            productCodes: [...new Set(shown.map((p) => p.product_code).filter(Boolean))].join("; "),
            listedProducts: shown.length,
            tradeNames: (item.proprietary_name || []).join("; "),
            location: locationSummary(item),
            deviceClass: [...new Set(shown.map((p) => p.openfda?.device_class).filter(Boolean))].join("; "),
            expiry: item.registration?.reg_expiry_date_year,
            registrationNumber: item.registration?.registration_number,
            feiNumber: item.registration?.fei_number,
          };
          return recordColumns.map((column) => values[column]);
        });
        downloadCsv(
          [recordColumns.map((column) => labels[column]), ...rows],
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
  const dateTimeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const freshnessHint = "\"FDA data as of\" is the date openFDA last rebuilt this dataset — records newer than that aren't published yet. \"Pulled\" is when this page last called the live API.";

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
          <div className="source-status" title={freshnessHint}>
            <span className="pulse" /> openFDA live{datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}
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
          <div className="dataset-note" title={freshnessHint}>
            <Database size={20} />
            <div>
              <b>{datasetTotal ? `${datasetTotal.toLocaleString()} records` : "openFDA device registry"}</b>
              <span>{datasetUpdated ? `FDA data as of ${datasetUpdated}` : "Registrations & listings"}</span>
              <span>{checkedAt ? `Pulled ${checkedAt.toLocaleString([], dateTimeFormat)}` : "Contacting live API…"}</span>
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
                  <small className="fetch-meta" title={mode === "api" ? freshnessHint : undefined}>
                    {mode === "api"
                      ? `Pulled ${fetchedAt.toLocaleString([], dateTimeFormat)}${datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}`
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
              <details className="column-picker">
                <summary className="secondary"><Columns3 size={15} /> Columns · {viewMode === "records" ? recordColumns.length : matrixColumns.length}</summary>
                <div className="column-menu">
                  <div className="column-menu-head">
                    <div><b>Display columns</b><span>Saved on this device</span></div>
                    <button type="button" onClick={() => viewMode === "records" ? setRecordColumns(DEFAULT_RECORD_COLUMNS) : setMatrixColumns(DEFAULT_MATRIX_COLUMNS)}>Reset</button>
                  </div>
                  <div className="column-options">
                    {(viewMode === "records" ? RECORD_COLUMN_OPTIONS : MATRIX_COLUMN_OPTIONS).map((option) => {
                      const checked = viewMode === "records"
                        ? recordColumns.includes(option.key as RecordColumn)
                        : matrixColumns.includes(option.key as MatrixColumn);
                      const onlyVisible = checked && (viewMode === "records" ? recordColumns.length === 1 : matrixColumns.length === 1);
                      return (
                        <label key={option.key} title={onlyVisible ? "Keep at least one column visible" : undefined}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={onlyVisible}
                            onChange={() => viewMode === "records"
                              ? toggleRecordColumn(option.key as RecordColumn)
                              : toggleMatrixColumn(option.key as MatrixColumn)}
                          />
                          <span><b>{option.label}</b><small>{option.hint}</small></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
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
                  <span>{total > 1000 && `Grouping the first 1,000 of ${total.toLocaleString()} matches · `}Listed devices counts unique proprietary names; CSV export fetches every available match.</span>
                </div>
              )}
              <div className="table-wrap" aria-live="polite">
                {viewMode === "records" ? <table>
                  <thead><tr>
                    {recordColumns.includes("establishment") && <th>Establishment</th>}
                    {recordColumns.includes("ownerOperator") && <th>Owner / operator</th>}
                    {recordColumns.includes("primaryDevice") && <th>Primary device</th>}
                    {recordColumns.includes("productCodes") && <th>Product codes</th>}
                    {recordColumns.includes("listedProducts") && <th className="numeric-head">Listed products</th>}
                    {recordColumns.includes("tradeNames") && <th>Trade names</th>}
                    {recordColumns.includes("location") && <th>Location</th>}
                    {recordColumns.includes("deviceClass") && <th>Class</th>}
                    {recordColumns.includes("expiry") && <th>Expiry</th>}
                    {recordColumns.includes("registrationNumber") && <th>Registration #</th>}
                    {recordColumns.includes("feiNumber") && <th>FEI number</th>}
                    <th aria-label="Open record" />
                  </tr></thead>
                  <tbody>
                    {records.map((item, index) => {
                      const matched = matchingProducts(item, appliedFilters);
                      const shown = productFilterActive(appliedFilters) ? matched : item.products || [];
                      const primary = shown[0];
                      const codes = [...new Set(shown.map((p) => p.product_code).filter(Boolean))] as string[];
                      const listingCount = item.products?.length || 0;
                      return (
                        <tr key={`${item.registration?.registration_number || "record"}-${index}`} onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(item)}>
                          {recordColumns.includes("establishment") && <td><b>{firmName(item)}</b><span>{item.establishment_type?.[0] || "Role not listed"}</span></td>}
                          {recordColumns.includes("ownerOperator") && <td><b>{companyName(item)}</b><span>Operator {item.registration?.owner_operator?.owner_operator_number || "—"}</span></td>}
                          {recordColumns.includes("primaryDevice") && <td><b>{primary?.openfda?.device_name || item.proprietary_name?.[0] || "Unspecified device"}</b><span>{primary?.openfda?.medical_specialty_description || "Specialty unavailable"}</span></td>}
                          {recordColumns.includes("productCodes") && <td>
                            <div className="pill-row">
                              {codes.slice(0, 3).map((code) => <span key={code} className="code-pill">{code}</span>)}
                              {codes.length > 3 && <span className="pill-more">+{codes.length - 3}</span>}
                              {!codes.length && <span className="code-pill">—</span>}
                            </div>
                          </td>}
                          {recordColumns.includes("listedProducts") && <td className="count-cell"><b>{shown.length.toLocaleString()}</b><span>{productFilterActive(appliedFilters) ? `${matched.length} of ${listingCount} match` : "Product entries"}</span></td>}
                          {recordColumns.includes("tradeNames") && <td><div className="device-name-list compact">{item.proprietary_name?.length ? item.proprietary_name.slice(0, 5).map((name) => <span key={name}>{name}</span>) : <em>None listed</em>}{(item.proprietary_name?.length || 0) > 5 && <em>+{(item.proprietary_name?.length || 0) - 5} more</em>}</div></td>}
                          {recordColumns.includes("location") && <td><b>{locationSummary(item)}</b></td>}
                          {recordColumns.includes("deviceClass") && <td><span className={`class-badge class-${primary?.openfda?.device_class || "u"}`}>{primary?.openfda?.device_class ? `Class ${primary.openfda.device_class}` : "—"}</span></td>}
                          {recordColumns.includes("expiry") && <td><b>{item.registration?.reg_expiry_date_year || "—"}</b></td>}
                          {recordColumns.includes("registrationNumber") && <td><b className="mono-value">{item.registration?.registration_number || "—"}</b></td>}
                          {recordColumns.includes("feiNumber") && <td><b className="mono-value">{item.registration?.fei_number || "—"}</b></td>}
                          <td><ArrowRight size={17} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table> : <table className="matrix-table">
                  <thead><tr>
                    {matrixColumns.includes("productCode") && <th>Product code</th>}
                    {matrixColumns.includes("deviceType") && <th>Device type</th>}
                    {matrixColumns.includes("company") && <th>Company</th>}
                    {matrixColumns.includes("listedDeviceCount") && <th className="numeric-head">Listed devices</th>}
                    {matrixColumns.includes("registeredDevices") && <th>Registered devices</th>}
                    {matrixColumns.includes("registrations") && <th className="numeric-head">Registrations</th>}
                    {matrixColumns.includes("productListings") && <th className="numeric-head">Product listings</th>}
                    {matrixColumns.includes("establishments") && <th className="numeric-head">Establishments</th>}
                    {matrixColumns.includes("deviceClass") && <th>Device class</th>}
                    {matrixColumns.includes("specialty") && <th>Medical specialty</th>}
                    {matrixColumns.includes("countries") && <th>Countries</th>}
                    {matrixColumns.includes("latestListing") && <th>Latest listing</th>}
                  </tr></thead>
                  <tbody>
                    {matrixRows.map((row) => (
                      <tr key={row.key}>
                        {matrixColumns.includes("productCode") && <td><span className="code-pill">{row.productCode}</span></td>}
                        {matrixColumns.includes("deviceType") && <td><b>{row.deviceType}</b></td>}
                        {matrixColumns.includes("company") && <td><b>{row.company}</b></td>}
                        {matrixColumns.includes("listedDeviceCount") && <td className="count-cell"><b>{row.devices.length.toLocaleString()}</b><span>Unique names</span></td>}
                        {matrixColumns.includes("registeredDevices") && <td><div className="device-name-list">{row.devices.length ? row.devices.map((device) => <span key={device}>{device}</span>) : <em>No proprietary names listed</em>}</div></td>}
                        {matrixColumns.includes("registrations") && <td className="count-cell"><b>{row.registrations.toLocaleString()}</b></td>}
                        {matrixColumns.includes("productListings") && <td className="count-cell"><b>{row.productListings.toLocaleString()}</b></td>}
                        {matrixColumns.includes("establishments") && <td className="count-cell"><b>{row.establishments.toLocaleString()}</b></td>}
                        {matrixColumns.includes("deviceClass") && <td><div className="pill-row">{row.deviceClasses.length ? row.deviceClasses.map((value) => <span key={value} className={`class-badge class-${value.toLowerCase()}`}>Class {value}</span>) : "—"}</div></td>}
                        {matrixColumns.includes("specialty") && <td><span className="cell-list">{row.specialties.join(" · ") || "—"}</span></td>}
                        {matrixColumns.includes("countries") && <td><div className="pill-row">{row.countries.length ? row.countries.map((value) => <span key={value} className="code-pill neutral">{value}</span>) : "—"}</div></td>}
                        {matrixColumns.includes("latestListing") && <td><b className="mono-value">{row.latestListing || "—"}</b></td>}
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
