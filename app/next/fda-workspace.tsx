"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Compass,
  ExternalLink,
  GitCompareArrows,
  Layers,
  Link2,
  LoaderCircle,
  MapPin,
  PackageSearch,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import {
  API,
  CODE_NAMES,
  EMPTY_FILTERS,
  PRESET,
  type ExplorerFilters as Filters,
  type RecordItem,
  buildSearch,
  companyName,
  fetchOpenFda,
  filtersFromParams,
  filtersToParams,
  firmName,
  listedDeviceNames,
  locationSummary,
  matchingProducts,
  normalizeCodes,
  parseCodes,
  premarketSummary,
} from "../fda-shared";
import {
  EMPTY_SECTION,
  FETCH_LIMIT,
  WINDOWS,
  type Clearance,
  type EventRow,
  type RecallRow,
  type Section,
  errorSection,
  loadClearances,
  loadEvents,
  loadRecalls,
} from "../fda-monitor-core";
import { downloadExcel, type ExcelColumn, type ExcelValue } from "../excel-export";
import {
  BUILT_IN_SCOPES,
  MATCH_LEVELS,
  OTHER_KEY,
  type CompanyRow,
  type MatchLevel,
  type SavedScope,
  type SortDir,
  applyScopeMatch,
  asMatchLevel,
  buildCompanies,
  buildOverview,
  compareCompanies,
  companyKey,
  filterRows,
  isoDaysAgo,
  latestListingDate,
  matchLevelParam,
  newListingsWithin,
  parseSavedScopes,
  scopeCodes,
  scopeProducts,
  scopeSignature,
  scopeSummary,
  sortRows,
} from "./fda-workspace-core";
import { BarList, OTHER_COLOR, StackedColumns, seriesColor } from "./charts";
import { NextShell } from "./shell";
import "./next.css";

type Tab = "overview" | "companies" | "listings" | "timeline" | "changes";
type Pane = { kind: "company"; key: string } | { kind: "listing"; record: RecordItem } | { kind: "compare" } | null;
type CompanySort = "name" | "listings" | "establishments" | "countries" | "codes" | "first" | "latest" | "premarket";
type ListingSort = "establishment" | "company" | "country" | "codes" | "class" | "latest" | "premarket";
type CountryOption = { code: string; count: number; name: string };
type Changes = { key: string; clearances: Section<Clearance>; recalls: Section<RecallRow>; events: Section<EventRow> };

const TABS: { key: Tab; label: string; icon: typeof Compass }[] = [
  { key: "overview", label: "Overview", icon: Compass },
  { key: "companies", label: "Companies", icon: Users },
  { key: "listings", label: "Listings", icon: Table2 },
  { key: "timeline", label: "Timeline", icon: CalendarClock },
  { key: "changes", label: "Changes", icon: Activity },
];
const FETCH_PAGE = 1000;
const FETCH_CAP = 3000;
const PAGE_SIZES = [25, 50, 100];
const DEVICE_CLASSES: [string, string][] = [["", "Any class"], ["1", "Class I"], ["2", "Class II"], ["3", "Class III"], ["U", "Unclassified"]];
const ESTABLISHMENT_TYPES = [
  "Manufacture Medical Device",
  "Manufacture Medical Device for Another Party (Contract Manufacturer)",
  "Develop Specifications But Do Not Manufacture At This Facility",
  "Repack or Relabel Medical Device",
  "Sterilize Medical Device for Another Party (Contract Sterilizer)",
  "Export Device to the United States But Perform No Other Operation on Device",
  "Remanufacture Medical Device",
];
const SCOPES_KEY = "nx-fda-scopes";

function regionName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function classBadge(value?: string) {
  return <span className={`nx-class c${value || "u"}`}>{value ? (value === "U" ? "Unclassified" : `Class ${value}`) : "—"}</span>;
}

function readUrl() {
  const empty = { filters: EMPTY_FILTERS, level: "any" as MatchLevel, tab: "overview" as Tab, days: 90, autorun: false };
  if (typeof window === "undefined") return empty;
  const params = new URLSearchParams(window.location.search);
  const parsed = filtersFromParams(params);
  const tab = TABS.some((entry) => entry.key === params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const days = WINDOWS.includes(Number(params.get("days"))) ? Number(params.get("days")) : 90;
  return { filters: { ...parsed.filters, codeMatch: "any" as const }, level: asMatchLevel(params.get("match")), tab, days, autorun: parsed.autorun };
}

function writeUrl(filters: Filters, level: MatchLevel, tab: Tab, days: number) {
  if (typeof window === "undefined") return;
  const params = filtersToParams({ ...filters, codeMatch: "any" }, "records");
  params.delete("match");
  const match = matchLevelParam(level);
  if (match) params.set("match", match);
  if (tab !== "overview") params.set("tab", tab);
  if (days !== 90) params.set("days", String(days));
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function kLink(value: string) {
  return /^[KP]\d{6,}/i.test(value)
    ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cf${value.toUpperCase().startsWith("P") ? "pma/pma" : "pmn/pmn"}.cfm?ID=${encodeURIComponent(value)}`
    : "";
}

function codeLink(code: string) {
  return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpcd/classification.cfm?id=${encodeURIComponent(code)}`;
}

function SortHead({ label, active, dir, onClick, numeric }: { label: string; active: boolean; dir: SortDir; onClick: () => void; numeric?: boolean }) {
  return (
    <th className={numeric ? "nx-num" : undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`nx-sort ${active ? "on" : ""}`} onClick={onClick}>{label} <ArrowUpDown size={11} /></button>
    </th>
  );
}

export default function FdaWorkspace() {
  const [initial] = useState(readUrl);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [level, setLevel] = useState<MatchLevel>(initial.level);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [days, setDays] = useState(initial.days);
  const [codeDraft, setCodeDraft] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [datasetUpdated, setDatasetUpdated] = useState("");
  const [datasetTotal, setDatasetTotal] = useState(0);
  const [apiCountries, setApiCountries] = useState<CountryOption[]>([]);
  const [pane, setPane] = useState<Pane>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [companySort, setCompanySort] = useState<{ key: CompanySort; dir: SortDir }>({ key: "listings", dir: "desc" });
  const [companyQuery, setCompanyQuery] = useState("");
  const [listingSort, setListingSort] = useState<{ key: ListingSort; dir: SortDir }>({ key: "latest", dir: "desc" });
  const [listingQuery, setListingQuery] = useState("");
  const [listingPage, setListingPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [savedScopes, setSavedScopes] = useState<SavedScope[]>([]);
  const [scopesReady, setScopesReady] = useState(false);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const keywordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const morePicker = useRef<HTMLDetailsElement>(null);
  const seqRef = useRef(0);

  const hasSearched = fetchedAt !== null;
  const capped = total > records.length;
  const selectedCodes = normalizeCodes(applied.productCodes);
  const levelApplies = selectedCodes.length > 1;

  /* ---------- derived data: one fetched set, many lenses ---------- */
  const scoped = useMemo(() => applyScopeMatch(records, applied, level), [records, applied, level]);
  const products = useMemo(() => scopeProducts(scoped, applied), [scoped, applied]);
  const codes = useMemo(() => scopeCodes(applied, products), [applied, products]);
  const codeColor = useCallback((code: string) => {
    const index = codes.indexOf(code);
    return index >= 0 ? seriesColor(index) : OTHER_COLOR;
  }, [codes]);
  const companies = useMemo(() => buildCompanies(scoped, applied, codes), [scoped, applied, codes]);
  const companyByKey = useMemo(() => new Map(companies.map((company) => [company.key, company])), [companies]);
  const overview = useMemo(() => buildOverview(scoped, applied, companies, { regionName }), [scoped, applied, companies]);
  const series = useMemo(() => {
    const list = codes.slice(0, 8).map((code, index) => ({ key: code, label: code, color: seriesColor(index) }));
    if (overview.byYear.some((bucket) => bucket.perCode[OTHER_KEY])) list.push({ key: OTHER_KEY, label: "Other codes", color: OTHER_COLOR });
    return list;
  }, [codes, overview.byYear]);
  const yearBuckets = useMemo(() => overview.byYear.map((bucket) => ({ label: String(bucket.year), values: bucket.perCode, total: bucket.total })), [overview.byYear]);

  const visibleCompanies = useMemo(() => {
    const filtered = filterRows(companies, companyQuery, (company) => `${company.name} ${company.tradeNames.join(" ")} ${company.countries.join(" ")} ${company.codes.join(" ")} ${company.establishments.map((e) => e.name).join(" ")}`);
    const accessor = (company: CompanyRow): string | number => ({
      name: company.name,
      listings: company.listings,
      establishments: company.establishments.length,
      countries: company.countries.length,
      codes: company.codes.length,
      first: company.firstListed,
      latest: company.latestListed,
      premarket: company.premarket.length,
    })[companySort.key];
    return sortRows(filtered, accessor, companySort.dir);
  }, [companies, companyQuery, companySort]);

  const visibleListings = useMemo(() => {
    const filtered = filterRows(scoped, listingQuery, (record) => `${firmName(record)} ${companyName(record)} ${listedDeviceNames(record).join(" ")} ${locationSummary(record)} ${matchingProducts(record, applied).map((p) => `${p.product_code} ${p.openfda?.device_name || ""}`).join(" ")} ${premarketSummary(record)} ${record.registration?.registration_number || ""}`);
    const accessor = (record: RecordItem): string | number => ({
      establishment: firmName(record),
      company: companyName(record),
      country: record.registration?.iso_country_code || "",
      codes: matchingProducts(record, applied).map((p) => p.product_code).sort().join(" "),
      class: matchingProducts(record, applied)[0]?.openfda?.device_class || "",
      latest: latestListingDate(record, applied),
      premarket: premarketSummary(record),
    })[listingSort.key];
    return sortRows(filtered, accessor, listingSort.dir);
  }, [scoped, listingQuery, listingSort, applied]);
  const pageCount = Math.max(1, Math.ceil(visibleListings.length / pageSize));
  const pageListings = visibleListings.slice(listingPage * pageSize, (listingPage + 1) * pageSize);

  const allScopes = useMemo(() => [...BUILT_IN_SCOPES, ...savedScopes], [savedScopes]);
  const activeScope = useMemo(() => {
    const signature = scopeSignature({ ...applied, codeMatch: "any" });
    return allScopes.find((scope) => scopeSignature({ ...scope.filters, codeMatch: "any" }) === signature && (scope.level ?? (scope.filters.codeMatch === "all" ? "company" : "any")) === level) || null;
  }, [allScopes, applied, level]);

  /* ---------- loading ---------- */
  const loadScope = useCallback(async (next: Filters) => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError("");
    setProgress("");
    try {
      const search = buildSearch({ ...next, codeMatch: "any" });
      const all: RecordItem[] = [];
      let grand = 0;
      let updated = "";
      for (let offset = 0; offset < FETCH_CAP; offset += FETCH_PAGE) {
        const params = new URLSearchParams({ limit: String(FETCH_PAGE), skip: String(offset) });
        if (search) params.set("search", search);
        const data = await fetchOpenFda<RecordItem>(`${API}?${params.toString()}`);
        if (seq !== seqRef.current) return;
        if (offset === 0) {
          grand = data.meta?.results?.total || 0;
          updated = data.meta?.last_updated || "";
        }
        all.push(...data.results);
        if (!data.results.length || all.length >= grand) break;
        setProgress(`Loaded ${all.length.toLocaleString()} of ${Math.min(grand, FETCH_CAP).toLocaleString()} listings…`);
      }
      setRecords(all);
      setTotal(grand);
      setApplied({ ...next, codeMatch: "any" });
      setFetchedAt(new Date());
      if (updated) setDatasetUpdated(updated);
      setPane(null);
      setPinned([]);
      setListingPage(0);
      setChanges(null);
    } catch (caught) {
      if (seq !== seqRef.current) return;
      setRecords([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "Unable to reach the FDA API.");
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setProgress("");
      }
    }
  }, []);

  useEffect(() => {
    fetchOpenFda(`${API}?limit=1`)
      .then((data) => {
        if (data.meta?.last_updated) setDatasetUpdated(data.meta.last_updated);
        if (data.meta?.results?.total) setDatasetTotal(data.meta.results.total);
      })
      .catch(() => {});
    const countryParams = new URLSearchParams({ count: "registration.iso_country_code", limit: "250" });
    fetchOpenFda<{ term?: string; count?: number }>(`${API}?${countryParams.toString()}`)
      .then((data) => setApiCountries(
        data.results
          .filter((entry) => entry.term)
          .map((entry) => ({ code: String(entry.term).toUpperCase(), count: entry.count || 0, name: regionName(String(entry.term).toUpperCase()) }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      ))
      .catch(() => {});
    if (initial.autorun) queueMicrotask(() => loadScope(initial.filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let parsed: SavedScope[] = [];
    try {
      parsed = parseSavedScopes(localStorage.getItem(SCOPES_KEY));
    } catch {
      parsed = [];
    }
    queueMicrotask(() => {
      setSavedScopes(parsed);
      setScopesReady(true);
    });
  }, []);

  useEffect(() => {
    if (!scopesReady) return;
    try {
      localStorage.setItem(SCOPES_KEY, JSON.stringify(savedScopes));
    } catch {
      // Storage may be unavailable; saved scopes then live for the session only.
    }
  }, [scopesReady, savedScopes]);

  useEffect(() => {
    if (!hasSearched) return;
    writeUrl(applied, level, tab, days);
  }, [applied, level, tab, days, hasSearched]);

  useEffect(() => {
    if (tab !== "changes" || !hasSearched) return;
    const key = scopeSignature(applied);
    if (changes?.key === key) return;
    const scopeCodesNow = normalizeCodes(applied.productCodes);
    const done = <T,>(): Section<T> => ({ ...EMPTY_SECTION, status: "done", rows: [] as T[] });
    const patch = (partial: Partial<Changes>) => setChanges((current) => (current?.key === key ? { ...current, ...partial } : current));
    // Deferred so the effect itself never sets state synchronously; the feeds then patch in as they arrive.
    queueMicrotask(() => {
      if (!scopeCodesNow.length) {
        setChanges({ key, clearances: done<Clearance>(), recalls: done<RecallRow>(), events: done<EventRow>() });
        return;
      }
      setChanges({ key, clearances: { ...EMPTY_SECTION }, recalls: { ...EMPTY_SECTION }, events: { ...EMPTY_SECTION } });
      loadClearances(scopeCodesNow).then((section) => patch({ clearances: section }), (caught) => patch({ clearances: errorSection(caught) }));
      loadRecalls(scopeCodesNow).then((section) => patch({ recalls: section }), (caught) => patch({ recalls: errorSection(caught) }));
      loadEvents(scopeCodesNow).then((section) => patch({ events: section }), (caught) => patch({ events: errorSection(caught) }));
    });
  }, [tab, hasSearched, applied, changes]);

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      const picker = morePicker.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        keywordInput.current?.focus();
      } else if (event.key === "Escape") {
        if (morePicker.current?.open) morePicker.current.open = false;
        else setPane(null);
      }
    };
    document.addEventListener("pointerdown", closePopovers);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closePopovers);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /* ---------- scope editing ---------- */
  const commitCodes = (text: string) => {
    const parsed = parseCodes(text);
    if (parsed.length) setFilters((prev) => ({ ...prev, productCodes: [...new Set([...prev.productCodes, ...parsed])] }));
    setCodeDraft("");
  };

  const applyNow = () => {
    let next = filters;
    const parsed = parseCodes(codeDraft);
    if (parsed.length) {
      next = { ...filters, productCodes: [...new Set([...filters.productCodes, ...parsed])] };
      setFilters(next);
    }
    setCodeDraft("");
    loadScope(next);
  };

  const removeCode = (code: string) => {
    const next = { ...filters, productCodes: filters.productCodes.filter((c) => c !== code) };
    setFilters(next);
    if (hasSearched) loadScope(next);
  };

  const applySavedScope = (scope: SavedScope) => {
    const nextFilters = { ...scope.filters, codeMatch: "any" as const };
    setFilters(nextFilters);
    setLevel(scope.level ?? (scope.filters.codeMatch === "all" ? "company" : "any"));
    setCodeDraft("");
    loadScope(nextFilters);
  };

  const saveScope = () => {
    const name = window.prompt("Name this scope", scopeSummary(applied).slice(0, 40));
    if (!name?.trim()) return;
    const scope: SavedScope = { id: `s-${Date.now().toString(36)}`, name: name.trim().slice(0, 60), filters: { ...applied }, level };
    setSavedScopes((current) => [...current, scope]);
  };

  const deleteScope = (id: string) => setSavedScopes((current) => current.filter((scope) => scope.id !== id));

  const reset = () => {
    seqRef.current += 1;
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setLevel("any");
    setCodeDraft("");
    setRecords([]);
    setTotal(0);
    setError("");
    setLoading(false);
    setProgress("");
    setPane(null);
    setPinned([]);
    setChanges(null);
    setCompanyQuery("");
    setListingQuery("");
    setFetchedAt(null);
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
    keywordInput.current?.focus();
  };

  const togglePin = (key: string) => setPinned((current) => (current.includes(key) ? current.filter((k) => k !== key) : current.length >= 4 ? current : [...current, key]));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      setError("Could not copy the link — copy it from the address bar instead.");
    }
  };

  const toggleCompanySort = (key: CompanySort) => setCompanySort((current) => ({ key, dir: current.key === key ? (current.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc" }));
  const toggleListingSort = (key: ListingSort) => {
    setListingSort((current) => ({ key, dir: current.key === key ? (current.dir === "asc" ? "desc" : "asc") : key === "latest" ? "desc" : "asc" }));
    setListingPage(0);
  };
  const changeListingQuery = (value: string) => { setListingQuery(value); setListingPage(0); };
  const changePageSize = (value: number) => { setPageSize(value); setListingPage(0); };
  const changeLevel = (value: MatchLevel) => { setLevel(value); setListingPage(0); setPane(null); };

  /* ---------- exports ---------- */
  const stamp = () => new Date().toISOString().slice(0, 10);
  const scopePart = () => (selectedCodes.length ? selectedCodes.join("+") : applied.keyword.trim() ? applied.keyword.trim().replace(/\s+/g, "-") : "all");

  const listingRow = (record: RecordItem): ExcelValue[] => {
    const matched = matchingProducts(record, applied);
    return [
      firmName(record),
      record.establishment_type?.join("; ") || "",
      companyName(record),
      [...new Set(matched.map((p) => p.product_code).filter(Boolean))].join("; "),
      [...new Set(matched.map((p) => p.openfda?.device_name).filter(Boolean))].join("; "),
      listedDeviceNames(record).join("; "),
      locationSummary(record),
      record.registration?.iso_country_code || "",
      [...new Set(matched.map((p) => p.openfda?.device_class).filter(Boolean))].join("; "),
      premarketSummary(record),
      latestListingDate(record, applied),
      record.registration?.registration_number || "",
      record.registration?.fei_number || "",
      record.registration?.reg_expiry_date_year || "",
    ];
  };
  const listingColumns: ExcelColumn[] = [
    { header: "Establishment", width: 30 }, { header: "Roles", width: 30 }, { header: "Owner / operator", width: 28 },
    { header: "Codes", width: 14 }, { header: "Device types", width: 34 }, { header: "Trade names", width: 34 },
    { header: "Location", width: 22 }, { header: "Country", width: 9 }, { header: "Class", width: 8 }, { header: "510(k) / PMA", width: 14 },
    { header: "Latest in-scope listing", type: "date", width: 14 }, { header: "Registration #", width: 14 }, { header: "FEI", width: 12 }, { header: "Expiry", width: 8 },
  ];

  const exportListings = (rows: readonly RecordItem[], name: string) => downloadExcel({
    filename: `fda-${name}-${scopePart()}-${stamp()}.xlsx`,
    sheetName: "FDA listings",
    columns: listingColumns,
    rows: rows.map(listingRow),
  });

  const exportCompanies = () => downloadExcel({
    filename: `fda-companies-${scopePart()}-${stamp()}.xlsx`,
    sheetName: "Companies",
    columns: [
      { header: "Company", width: 32 }, { header: "Operator #", width: 12 }, { header: "Listings", type: "number", width: 10 },
      { header: "Establishments", type: "number", width: 12 }, { header: "Countries", width: 14 }, { header: "Codes covered", width: 16 },
      ...codes.map((code) => ({ header: code, type: "number" as const, width: 8 })),
      { header: "Trade names", width: 40 }, { header: "510(k) / PMA", width: 20 }, { header: "First listed", type: "date", width: 12 }, { header: "Latest listed", type: "date", width: 12 }, { header: "Roles", width: 34 },
    ],
    rows: visibleCompanies.map((company) => [
      company.name, company.operatorNumber, company.listings, company.establishments.length, company.countries.join("; "), company.codes.join("; "),
      ...codes.map((code) => company.codeCounts[code] || 0),
      company.tradeNames.join("; "), company.premarket.join("; "), company.firstListed, company.latestListed, company.roles.join("; "),
    ]),
  });

  const exportTimeline = () => downloadExcel({
    filename: `fda-timeline-${scopePart()}-${stamp()}.xlsx`,
    sheetName: "Listings by year",
    columns: [{ header: "Year", width: 8 }, ...series.map((entry) => ({ header: entry.label, type: "number" as const, width: 10 })), { header: "Total", type: "number", width: 10 }],
    rows: overview.byYear.map((bucket) => [String(bucket.year), ...series.map((entry) => bucket.perCode[entry.key] || 0), bucket.total]),
  });

  /* ---------- changes ---------- */
  const cutoff = isoDaysAgo(days);
  const recentListings = useMemo(() => newListingsWithin(products, days), [products, days]);
  const windowed = <T,>(section: Section<T> | undefined, dateOf: (row: T) => string) => (section?.rows || []).filter((row) => dateOf(row) >= cutoff);
  const recentClearances = windowed(changes?.clearances, (row) => row.decisionDate);
  const recentRecalls = windowed(changes?.recalls, (row) => row.initiated);
  const recentEvents = windowed(changes?.events, (row) => row.received);

  /* ---------- presentation helpers ---------- */
  const paneCompany = pane?.kind === "company" ? companyByKey.get(pane.key) || null : null;
  const pinnedCompanies = pinned.map((key) => companyByKey.get(key)).filter((company): company is CompanyRow => !!company);
  const timeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const levelHint = MATCH_LEVELS.find((entry) => entry.value === level)?.hint || "";
  const openCompany = (key: string) => { setPane({ kind: "company", key }); };
  const openListing = (record: RecordItem) => { setPane({ kind: "listing", record }); };
  const showCompanyListings = (company: CompanyRow) => { setTab("listings"); setListingQuery(company.name); setPane(null); };

  const codeChips = (company: CompanyRow) => (
    <span className="nx-coverage">
      {(codes.length ? codes : company.codes).map((code) => {
        const count = company.codeCounts[code] || 0;
        return <span key={code} className={`nx-cov ${count ? "on" : ""}`} style={count ? { borderColor: codeColor(code), color: codeColor(code) } : undefined} title={`${code}${CODE_NAMES.get(code) ? ` — ${CODE_NAMES.get(code)}` : ""}: ${count} listing${count === 1 ? "" : "s"}`}>{code}{count > 1 ? <em>{count}</em> : null}</span>;
      })}
    </span>
  );

  const sectionState = (section: Section<unknown> | undefined) => {
    if (!section || section.status === "loading") return <span className="nx-pill"><LoaderCircle className="nx-spin" size={11} /> loading</span>;
    if (section.status === "error") return <span className="nx-pill bad">error</span>;
    return null;
  };

  /* ---------- render ---------- */
  return (
    <NextShell active="fda-workspace">
      <header className="nx-topbar">
        <div className="nx-scope-row">
          <label className={`nx-select nx-scope-pick ${activeScope ? "on" : ""}`} title="Saved scopes">
            <Layers size={13} />
            <select value={activeScope?.id || ""} onChange={(e) => { const scope = allScopes.find((entry) => entry.id === e.target.value); if (scope) applySavedScope(scope); }} aria-label="Saved scopes">
              <option value="">{hasSearched ? "Custom scope" : "Pick a saved scope…"}</option>
              <optgroup label="Built in">{BUILT_IN_SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</optgroup>
              {savedScopes.length > 0 && <optgroup label="Saved on this device">{savedScopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</optgroup>}
            </select>
            <ChevronDown size={13} />
          </label>
          <div className="nx-codes" onClick={() => codeInput.current?.focus()}>
            {filters.productCodes.map((code) => (
              <span key={code} className="nx-code-chip" title={CODE_NAMES.get(code) || `Product code ${code}`}>
                {code}
                <button type="button" onClick={(e) => { e.stopPropagation(); removeCode(code); }} aria-label={`Remove ${code}`}><X size={11} /></button>
              </span>
            ))}
            <input
              ref={codeInput}
              value={codeDraft}
              onChange={(e) => { const value = e.target.value; if (/[,\s;]/.test(value)) commitCodes(value); else setCodeDraft(value.toUpperCase()); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (codeDraft.trim()) commitCodes(codeDraft); else applyNow(); }
                else if (e.key === "Backspace" && !codeDraft && filters.productCodes.length) removeCode(filters.productCodes[filters.productCodes.length - 1]);
              }}
              onBlur={() => codeDraft.trim() && commitCodes(codeDraft)}
              list="nx-code-options"
              placeholder={filters.productCodes.length ? "Add code…" : "Product codes, e.g. QUH, OSM, SCR"}
              aria-label="Product codes"
            />
            <datalist id="nx-code-options">{PRESET.map((item) => <option key={item.code} value={item.code} label={item.name} />)}</datalist>
          </div>
          <div className="nx-search nx-search-compact">
            <Search size={14} />
            <input ref={keywordInput} value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyNow()} placeholder="Company, device or trade name" aria-label="Keywords" />
            {filters.keyword && <button type="button" className="nx-clear" onClick={() => setFilters({ ...filters, keyword: "" })} aria-label="Clear keywords"><X size={12} /></button>}
            <kbd>/</kbd>
          </div>
          <label className={`nx-select ${filters.country ? "on" : ""}`}>
            <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} aria-label="Country">
              <option value="">Any country</option>
              {filters.country && !apiCountries.some((country) => country.code === filters.country) && <option value={filters.country}>{regionName(filters.country)}</option>}
              {apiCountries.slice(0, 40).map((country) => <option key={country.code} value={country.code}>{country.name} · {country.count.toLocaleString()}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <label className={`nx-select ${filters.deviceClass ? "on" : ""}`}>
            <select value={filters.deviceClass} onChange={(e) => setFilters({ ...filters, deviceClass: e.target.value })} aria-label="Device class">
              {DEVICE_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <details ref={morePicker} className="nx-pop left">
            <summary className={`nx-select ${filters.state || filters.establishment ? "on" : ""}`}><SlidersHorizontal size={13} /> More{[filters.state, filters.establishment].filter(Boolean).length ? ` · ${[filters.state, filters.establishment].filter(Boolean).length}` : ""} <ChevronDown size={13} /></summary>
            <div className="nx-pop-menu">
              <label className="nx-field"><span>State / region code</span><input value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value.toUpperCase().slice(0, 3) })} placeholder="CA" maxLength={3} onKeyDown={(e) => e.key === "Enter" && applyNow()} /></label>
              <label className="nx-field"><span>Establishment role</span><select value={filters.establishment} onChange={(e) => setFilters({ ...filters, establishment: e.target.value })}><option value="">All roles</option>{ESTABLISHMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            </div>
          </details>
          <button type="button" className="nx-btn primary" onClick={applyNow} disabled={loading}>{loading ? <LoaderCircle className="nx-spin" size={14} /> : <Search size={14} />} Apply scope</button>
          <button type="button" className="nx-btn ghost" onClick={reset}>Reset</button>
        </div>
        <div className="nx-scope-meta">
          <div className="nx-seg" role="group" aria-label="How several product codes combine">
            {MATCH_LEVELS.map((entry) => (
              <button key={entry.value} type="button" className={level === entry.value ? "active" : ""} aria-pressed={level === entry.value} title={entry.hint} onClick={() => changeLevel(entry.value)} disabled={entry.value !== "any" && filters.productCodes.length < 2 && !levelApplies}>{entry.label}</button>
            ))}
          </div>
          <span className="nx-hint">{levelApplies || filters.productCodes.length > 1 ? levelHint : "Add two or more codes to choose how they combine."}</span>
          <span className="nx-scope-actions">
            {hasSearched && !activeScope && <button type="button" className="nx-btn small" onClick={saveScope}><Save size={12} /> Save scope</button>}
            {activeScope && !activeScope.builtIn && <button type="button" className="nx-btn small ghost" onClick={() => deleteScope(activeScope.id)} title="Delete this saved scope"><Trash2 size={12} /> Delete scope</button>}
            <button type="button" className="nx-btn small" onClick={copyLink} disabled={!hasSearched}>{linkCopied ? <Check size={12} /> : <Link2 size={12} />} {linkCopied ? "Copied" : "Share"}</button>
            <button type="button" className="nx-btn small icon" onClick={() => loadScope(applied)} disabled={!hasSearched || loading} aria-label="Reload scope" title="Reload from openFDA"><RefreshCw className={loading ? "nx-spin" : ""} size={12} /></button>
          </span>
        </div>
      </header>

      <nav className="nx-tabs" aria-label="Workspace views">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === "companies" ? companies.length : key === "listings" ? scoped.length : key === "changes" && hasSearched ? recentListings.length + recentClearances.length + recentRecalls.length + recentEvents.length : null;
          return (
            <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}>
              <Icon size={14} /> {label}{hasSearched && count !== null && <em>{count.toLocaleString()}</em>}
            </button>
          );
        })}
        <span className="nx-tabs-scope" title={scopeSummary(applied)}>{hasSearched ? scopeSummary(applied) : "No scope applied"}</span>
      </nav>

      <div className={`nx-workbench ${pane ? "with-detail" : ""}`}>
        <div className="nx-tab-area">
          {error && <div className="nx-error" role="alert"><CircleAlert size={16} /><div><b>openFDA request failed</b><span>{error}</span></div><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}
          {capped && hasSearched && <div className="nx-banner"><TriangleAlert size={14} /> This scope has {total.toLocaleString()} listings; the workspace analyses the first {records.length.toLocaleString()}. Narrow the scope (codes, country, keyword) for complete figures.</div>}

          {!hasSearched && !loading ? (
            <div className="nx-empty">
              <Compass size={30} />
              <h2>Define a scope.</h2>
              <p>{datasetTotal ? `${datasetTotal.toLocaleString()} listings` : "openFDA"}{datasetUpdated ? ` · FDA data as of ${datasetUpdated}` : ""}. A scope is the set of product codes, country and keyword you care about. Every view below answers that one scope.</p>
              <div className="nx-quick">
                {BUILT_IN_SCOPES.map((scope) => (
                  <button key={scope.id} type="button" onClick={() => applySavedScope(scope)}><b>{scope.name}</b><span>{scopeSummary(scope.filters)}</span></button>
                ))}
              </div>
            </div>
          ) : hasSearched && !scoped.length && !loading ? (
            <div className="nx-empty" role="status">
              <PackageSearch size={30} />
              <h2>Nothing in this scope.</h2>
              {records.length && level !== "any" ? (
                <p>{records.length.toLocaleString()} listings carry at least one selected code, but no single company covers every code. Switch to <b>Any code</b> to see them.</p>
              ) : (
                <p>Nothing in the openFDA registration and listing dataset matches this combination. Try fewer filters or double-check the codes.</p>
              )}
              <div className="nx-empty-actions">
                {records.length > 0 && level !== "any" && <button type="button" className="nx-btn primary" onClick={() => changeLevel("any")}>Match any code</button>}
                <button type="button" className="nx-btn" onClick={reset}>Reset scope</button>
              </div>
            </div>
          ) : (
            <>
              {tab === "overview" && hasSearched && (
                <div className="nx-scroll">
                  <div className="nx-tiles">
                    <div className="nx-tile"><span>Listings</span><b>{overview.listings.toLocaleString()}</b><small>{capped ? `of ${total.toLocaleString()} in scope` : "FDA filings in scope"}</small></div>
                    <div className="nx-tile"><span>Companies</span><b>{overview.companies.toLocaleString()}</b><small>owner / operators</small></div>
                    <div className="nx-tile"><span>Establishments</span><b>{overview.establishments.toLocaleString()}</b><small>registered facilities</small></div>
                    <div className="nx-tile"><span>Countries</span><b>{overview.countries.toLocaleString()}</b><small>{overview.byCountry[0] ? `${overview.byCountry[0].label} leads` : ""}</small></div>
                    <div className="nx-tile"><span>Codes covered</span><b>{overview.byCode.filter((d) => d.value).length}{selectedCodes.length ? ` / ${selectedCodes.length}` : ""}</b><small>{selectedCodes.length ? "of the selected codes" : "distinct product codes"}</small></div>
                    <button type="button" className="nx-tile link" onClick={() => setTab("companies")}><span>New entrants</span><b>{overview.newCompanies.length.toLocaleString()}</b><small>first in-scope listing ≤ 12 months</small></button>
                  </div>
                  <div className="nx-charts">
                    <section className="nx-chart">
                      <h3>Listings per code</h3>
                      {level === "company" && levelApplies && <p className="nx-chart-note">Only companies covering all {selectedCodes.length} codes are counted.</p>}
                      {<BarList items={overview.byCode.map((d) => ({ ...d, color: codeColor(d.key), hint: CODE_NAMES.get(d.key) ? `${d.key} — ${CODE_NAMES.get(d.key)}` : d.key }))} total={overview.listings} />}
                    </section>
                    <section className="nx-chart wide">
                      <h3>Listings by year <small>in-scope product entries by the year FDA created them</small></h3>
                      <StackedColumns buckets={yearBuckets} series={series} ariaLabel="Listings per year by product code" />
                      <button type="button" className="nx-linklike" onClick={() => setTab("timeline")}><Table2 size={12} /> Table view in Timeline</button>
                    </section>
                    <section className="nx-chart"><h3>By country</h3><BarList items={overview.byCountry} /></section>
                    <section className="nx-chart"><h3>By device class</h3><BarList items={overview.byClass} /></section>
                    <section className="nx-chart"><h3>Establishment roles <small>a listing can carry several</small></h3><BarList items={overview.byRole} /></section>
                    <section className="nx-chart">
                      <h3>New entrants <small>first in-scope listing in the last 12 months</small></h3>
                      {overview.newCompanies.length ? (
                        <ul className="nx-list">
                          {overview.newCompanies.slice(0, 8).map((company) => (
                            <li key={company.key}><button type="button" onClick={() => openCompany(company.key)}><b>{company.name}</b><span>{company.firstListed} · {company.codes.join(", ")} · {company.countries.join(", ") || "—"}</span></button></li>
                          ))}
                          {overview.newCompanies.length > 8 && <li className="nx-list-more"><button type="button" onClick={() => { setTab("companies"); setCompanySort({ key: "first", dir: "desc" }); }}>All {overview.newCompanies.length} in Companies →</button></li>}
                        </ul>
                      ) : <p className="nx-chart-empty">No company entered this scope in the last 12 months.</p>}
                    </section>
                    <section className="nx-chart">
                      <h3>Latest listings</h3>
                      <ul className="nx-list">
                        {overview.latest.map((entry, index) => (
                          <li key={`${entry.createdDate}-${index}`}><button type="button" onClick={() => openListing(entry.record)}><b>{companyName(entry.record)}</b><span>{entry.createdDate} · <i className="nx-code" style={{ background: "transparent", border: `1px solid ${codeColor(entry.code)}`, color: codeColor(entry.code) }}>{entry.code}</i> {entry.product.openfda?.device_name || "Unnamed device"}</span></button></li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </div>
              )}

              {tab === "companies" && hasSearched && (
                <>
                  <div className="nx-subbar">
                    <div className="nx-search nx-search-compact"><Search size={13} /><input value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Filter companies, trade names, countries…" aria-label="Filter companies" />{companyQuery && <button type="button" className="nx-clear" onClick={() => setCompanyQuery("")} aria-label="Clear filter"><X size={12} /></button>}</div>
                    <span className="nx-subbar-count">{visibleCompanies.length.toLocaleString()} of {companies.length.toLocaleString()} companies · pin up to 4 to compare</span>
                    <span className="nx-subbar-actions"><button type="button" className="nx-btn small" onClick={exportCompanies} disabled={!visibleCompanies.length}><ArrowDownToLine size={12} /> Excel</button></span>
                  </div>
                  <div className="nx-table-wrap">
                    <table className="nx-table">
                      <thead><tr>
                        <th aria-label="Pin" />
                        <SortHead label="Company" active={companySort.key === "name"} dir={companySort.dir} onClick={() => toggleCompanySort("name")} />
                        <SortHead label="Coverage" active={companySort.key === "codes"} dir={companySort.dir} onClick={() => toggleCompanySort("codes")} />
                        <SortHead label="Listings" numeric active={companySort.key === "listings"} dir={companySort.dir} onClick={() => toggleCompanySort("listings")} />
                        <SortHead label="Sites" numeric active={companySort.key === "establishments"} dir={companySort.dir} onClick={() => toggleCompanySort("establishments")} />
                        <SortHead label="Countries" active={companySort.key === "countries"} dir={companySort.dir} onClick={() => toggleCompanySort("countries")} />
                        <th>Trade names</th>
                        <SortHead label="510(k) / PMA" numeric active={companySort.key === "premarket"} dir={companySort.dir} onClick={() => toggleCompanySort("premarket")} />
                        <SortHead label="First listed" active={companySort.key === "first"} dir={companySort.dir} onClick={() => toggleCompanySort("first")} />
                        <SortHead label="Latest" active={companySort.key === "latest"} dir={companySort.dir} onClick={() => toggleCompanySort("latest")} />
                      </tr></thead>
                      <tbody>
                        {visibleCompanies.map((company) => (
                          <tr key={company.key} className={paneCompany?.key === company.key ? "selected" : ""} onClick={() => openCompany(company.key)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openCompany(company.key)}>
                            <td className="nx-pin-cell"><button type="button" className={`nx-pin ${pinned.includes(company.key) ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); togglePin(company.key); }} aria-label={pinned.includes(company.key) ? "Unpin" : "Pin to compare"} title={pinned.includes(company.key) ? "Unpin" : pinned.length >= 4 ? "Four companies pinned" : "Pin to compare"}>{pinned.includes(company.key) ? <PinOff size={12} /> : <Pin size={12} />}</button></td>
                            <td><b>{company.name}</b><span className="sub">{company.operatorNumber ? `Operator ${company.operatorNumber}` : "Operator number not published"}{company.firstListed && company.firstListed >= isoDaysAgo(365) ? " · new entrant" : ""}</span></td>
                            <td>{codeChips(company)}</td>
                            <td className="nx-num"><b>{company.listings.toLocaleString()}</b></td>
                            <td className="nx-num">{company.establishments.length.toLocaleString()}</td>
                            <td>{company.countries.length ? company.countries.slice(0, 4).map((country) => <span key={country} className="nx-code dim">{country}</span>) : "—"}{company.countries.length > 4 && <span className="nx-code dim">+{company.countries.length - 4}</span>}</td>
                            <td><div className="nx-names">{company.tradeNames.length ? company.tradeNames.slice(0, 2).map((name) => <span key={name} title={name}>{name}</span>) : <em>None listed</em>}{company.tradeNames.length > 2 && <em>+{company.tradeNames.length - 2} more</em>}</div></td>
                            <td className="nx-num">{company.premarket.length || "—"}</td>
                            <td className="nx-mono">{company.firstListed || "—"}</td>
                            <td className="nx-mono">{company.latestListed || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleCompanies.length && <p className="nx-chart-empty nx-pad">No company matches that filter.</p>}
                  </div>
                </>
              )}

              {tab === "listings" && hasSearched && (
                <>
                  <div className="nx-subbar">
                    <div className="nx-search nx-search-compact"><Search size={13} /><input value={listingQuery} onChange={(e) => changeListingQuery(e.target.value)} placeholder="Filter listings: company, device, trade name, code, registration…" aria-label="Filter listings" />{listingQuery && <button type="button" className="nx-clear" onClick={() => changeListingQuery("")} aria-label="Clear filter"><X size={12} /></button>}</div>
                    <span className="nx-subbar-count">{visibleListings.length.toLocaleString()} listings{visibleListings.length !== scoped.length ? ` of ${scoped.length.toLocaleString()}` : ""}</span>
                    <span className="nx-subbar-actions">
                      <label className="nx-select"><select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} aria-label="Rows per page">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size} rows</option>)}</select><ChevronDown size={13} /></label>
                      <button type="button" className="nx-btn small" onClick={() => exportListings(visibleListings, "listings")} disabled={!visibleListings.length}><ArrowDownToLine size={12} /> Excel · {visibleListings.length.toLocaleString()}</button>
                    </span>
                  </div>
                  <div className="nx-table-wrap">
                    <table className="nx-table">
                      <thead><tr>
                        <SortHead label="Establishment" active={listingSort.key === "establishment"} dir={listingSort.dir} onClick={() => toggleListingSort("establishment")} />
                        <SortHead label="Owner / operator" active={listingSort.key === "company"} dir={listingSort.dir} onClick={() => toggleListingSort("company")} />
                        <SortHead label="Codes" active={listingSort.key === "codes"} dir={listingSort.dir} onClick={() => toggleListingSort("codes")} />
                        <th>Device type</th>
                        <th>Trade names</th>
                        <SortHead label="Location" active={listingSort.key === "country"} dir={listingSort.dir} onClick={() => toggleListingSort("country")} />
                        <SortHead label="Class" active={listingSort.key === "class"} dir={listingSort.dir} onClick={() => toggleListingSort("class")} />
                        <SortHead label="510(k) / PMA" active={listingSort.key === "premarket"} dir={listingSort.dir} onClick={() => toggleListingSort("premarket")} />
                        <SortHead label="Listed" active={listingSort.key === "latest"} dir={listingSort.dir} onClick={() => toggleListingSort("latest")} />
                      </tr></thead>
                      <tbody>
                        {pageListings.map((record, index) => {
                          const matched = matchingProducts(record, applied);
                          const primary = matched[0];
                          const isSelected = pane?.kind === "listing" && pane.record === record;
                          const names = listedDeviceNames(record);
                          return (
                            <tr key={`${record.registration?.registration_number || "r"}-${index}`} className={isSelected ? "selected" : ""} onClick={() => openListing(record)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openListing(record)}>
                              <td><b>{firmName(record)}</b><span className="sub">{record.establishment_type?.[0] || "Role not listed"}</span></td>
                              <td><button type="button" className="nx-linklike" onClick={(e) => { e.stopPropagation(); openCompany(companyKey(record)); }}>{companyName(record)}</button></td>
                              <td>{[...new Set(matched.map((p) => p.product_code).filter(Boolean))].map((code) => <span key={code} className="nx-code" style={{ background: "transparent", border: `1px solid ${codeColor(code as string)}`, color: codeColor(code as string) }}>{code}</span>)}</td>
                              <td><b>{primary?.openfda?.device_name || "Unspecified device"}</b>{matched.length > 1 && <span className="sub">+{matched.length - 1} more product{matched.length > 2 ? "s" : ""}</span>}</td>
                              <td><div className="nx-names">{names.length ? names.slice(0, 2).map((name) => <span key={name} title={name}>{name}</span>) : <em>None listed</em>}{names.length > 2 && <em>+{names.length - 2} more</em>}</div></td>
                              <td>{locationSummary(record)}</td>
                              <td>{classBadge(primary?.openfda?.device_class)}</td>
                              <td className="nx-mono">{premarketSummary(record) || "—"}</td>
                              <td className="nx-mono">{latestListingDate(record, applied) || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!visibleListings.length && <p className="nx-chart-empty nx-pad">No listing matches that filter.</p>}
                  </div>
                  <div className="nx-pagebar">
                    <span>Page {listingPage + 1} of {pageCount}</span>
                    <div className="nx-pager">
                      <button type="button" className="nx-btn icon" onClick={() => setListingPage((page) => Math.max(0, page - 1))} disabled={listingPage === 0} aria-label="Previous page"><ArrowLeft size={14} /></button>
                      <button type="button" className="nx-btn icon" onClick={() => setListingPage((page) => Math.min(pageCount - 1, page + 1))} disabled={listingPage >= pageCount - 1} aria-label="Next page"><ArrowRight size={14} /></button>
                    </div>
                  </div>
                </>
              )}

              {tab === "timeline" && hasSearched && (
                <div className="nx-scroll">
                  <div className="nx-subbar">
                    <span className="nx-subbar-count">In-scope product entries by the year FDA created the listing · {products.filter((p) => p.year).length.toLocaleString()} dated entries</span>
                    <span className="nx-subbar-actions"><button type="button" className="nx-btn small" onClick={exportTimeline} disabled={!overview.byYear.length}><ArrowDownToLine size={12} /> Excel</button></span>
                  </div>
                  <section className="nx-chart wide nx-pad"><StackedColumns buckets={yearBuckets} series={series} height={280} ariaLabel="Listings per year by product code" /></section>
                  <div className="nx-table-wrap nx-pad">
                    <table className="nx-table nx-table-compact">
                      <thead><tr><th>Year</th>{series.map((entry) => <th key={entry.key} className="nx-num"><i className="nx-swatch" style={{ background: entry.color }} />{entry.label}</th>)}<th className="nx-num">Total</th></tr></thead>
                      <tbody>
                        {[...overview.byYear].reverse().map((bucket) => (
                          <tr key={bucket.year}><td className="nx-mono">{bucket.year}</td>{series.map((entry) => <td key={entry.key} className="nx-num">{bucket.perCode[entry.key] ? bucket.perCode[entry.key].toLocaleString() : <span className="nx-muted">·</span>}</td>)}<td className="nx-num"><b>{bucket.total.toLocaleString()}</b></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "changes" && hasSearched && (
                <div className="nx-scroll">
                  <div className="nx-subbar">
                    <label className="nx-select on"><CalendarClock size={13} /><select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Window">{WINDOWS.map((value) => <option key={value} value={value}>Last {value} days</option>)}</select><ChevronDown size={13} /></label>
                    <span className="nx-subbar-count">{selectedCodes.length ? `510(k), recall and MAUDE feeds are queried for ${selectedCodes.join(", ")}` : "Add product codes to the scope to load 510(k), recall and MAUDE feeds"}</span>
                  </div>
                  <section className="nx-change">
                    <h3><PackageSearch size={14} /> New listings <em>{recentListings.length}</em><span className="nx-subbar-actions"><button type="button" className="nx-btn small" onClick={() => exportListings([...new Set(recentListings.map((entry) => entry.record))], "new-listings")} disabled={!recentListings.length}><ArrowDownToLine size={12} /> Excel</button></span></h3>
                    {recentListings.length ? (
                      <div className="nx-table-wrap"><table className="nx-table nx-table-compact"><thead><tr><th>Created</th><th>Code</th><th>Device type</th><th>Company</th><th>Establishment</th><th>Location</th></tr></thead><tbody>
                        {recentListings.map((entry, index) => <tr key={`${entry.createdDate}-${index}`} onClick={() => openListing(entry.record)} tabIndex={0}><td className="nx-mono">{entry.createdDate}</td><td><span className="nx-code" style={{ background: "transparent", border: `1px solid ${codeColor(entry.code)}`, color: codeColor(entry.code) }}>{entry.code}</span></td><td>{entry.product.openfda?.device_name || "—"}</td><td><b>{companyName(entry.record)}</b></td><td>{firmName(entry.record)}</td><td>{locationSummary(entry.record)}</td></tr>)}
                      </tbody></table></div>
                    ) : <p className="nx-chart-empty">No in-scope listing was created in the last {days} days.</p>}
                  </section>
                  <section className="nx-change">
                    <h3><BadgeCheck size={14} /> 510(k) clearances <em>{recentClearances.length}</em>{sectionState(changes?.clearances)}{changes?.clearances.datasetDate && <span className="nx-muted">FDA data as of {changes.clearances.datasetDate}</span>}</h3>
                    {changes?.clearances.status === "error" && <p className="nx-chart-empty">{changes.clearances.error}</p>}
                    {changes?.clearances.status === "done" && (recentClearances.length ? (
                      <div className="nx-table-wrap"><table className="nx-table nx-table-compact"><thead><tr><th>Decision</th><th>K number</th><th>Applicant</th><th>Device</th><th>Code</th><th>Outcome</th></tr></thead><tbody>
                        {recentClearances.map((row) => <tr key={row.kNumber}><td className="nx-mono">{row.decisionDate}</td><td><a className="nx-ext" href={kLink(row.kNumber)} target="_blank" rel="noreferrer">{row.kNumber} <ExternalLink size={10} /></a></td><td><b>{row.applicant}</b></td><td>{row.deviceName}</td><td><span className="nx-code">{row.code}</span></td><td>{row.decision} · {row.clearanceType}</td></tr>)}
                      </tbody></table></div>
                    ) : <p className="nx-chart-empty">None in the last {days} days.{changes.clearances.rows[0] ? ` Most recent: ${changes.clearances.rows[0].decisionDate} — ${changes.clearances.rows[0].applicant}.` : ""}</p>)}
                  </section>
                  <section className="nx-change">
                    <h3><TriangleAlert size={14} /> Recalls <em>{recentRecalls.length}</em>{sectionState(changes?.recalls)}{changes?.recalls.datasetDate && <span className="nx-muted">FDA data as of {changes.recalls.datasetDate}</span>}</h3>
                    {changes?.recalls.status === "error" && <p className="nx-chart-empty">{changes.recalls.error}</p>}
                    {changes?.recalls.status === "done" && (recentRecalls.length ? (
                      <div className="nx-table-wrap"><table className="nx-table nx-table-compact"><thead><tr><th>Initiated</th><th>Code</th><th>Recalling firm</th><th>Product</th><th>Reason</th><th>Status</th></tr></thead><tbody>
                        {recentRecalls.map((row, index) => <tr key={`${row.cfresId || row.initiated}-${index}`}><td className="nx-mono">{row.initiated}</td><td><span className="nx-code">{row.code}</span></td><td><b>{row.firm}</b></td><td>{row.product}</td><td className="nx-wrap" title={row.reason}>{row.reason}</td><td>{row.cfresId ? <a className="nx-ext" href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=${row.cfresId}`} target="_blank" rel="noreferrer">{row.status} <ExternalLink size={10} /></a> : row.status}</td></tr>)}
                      </tbody></table></div>
                    ) : <p className="nx-chart-empty">None in the last {days} days.{changes.recalls.rows[0] ? ` Most recent: ${changes.recalls.rows[0].initiated} — ${changes.recalls.rows[0].firm}.` : " No recalls on record for these codes."}</p>)}
                  </section>
                  <section className="nx-change">
                    <h3><Activity size={14} /> Adverse events (MAUDE) <em>{recentEvents.length}{changes?.events.capped && recentEvents.length === changes.events.rows.length && recentEvents.length ? "+" : ""}</em>{sectionState(changes?.events)}{changes?.events.datasetDate && <span className="nx-muted">FDA data as of {changes.events.datasetDate}</span>}</h3>
                    {changes?.events.status === "error" && <p className="nx-chart-empty">{changes.events.error}</p>}
                    {changes?.events.status === "done" && (recentEvents.length ? (
                      <div className="nx-table-wrap"><table className="nx-table nx-table-compact"><thead><tr><th>Received</th><th>Type</th><th>Brand</th><th>Manufacturer</th><th>Code</th></tr></thead><tbody>
                        {recentEvents.map((row, index) => <tr key={`${row.reportKey || row.received}-${index}`}><td className="nx-mono">{row.received}</td><td><span className={`nx-pill ${/death|injury/i.test(row.eventType) ? "bad" : ""}`}>{row.eventType}</span></td><td><b>{row.brand}</b></td><td>{row.manufacturer}</td><td><span className="nx-code">{row.code}</span></td></tr>)}
                      </tbody></table></div>
                    ) : <p className="nx-chart-empty">None in the last {days} days.{changes.events.rows[0] ? ` Most recent: ${changes.events.rows[0].received} — ${changes.events.rows[0].brand}.` : ""}</p>)}
                    {changes?.events.status === "done" && <p className="nx-footnote">Showing the latest {Math.min(changes.events.rows.length, FETCH_LIMIT)} of {changes.events.total.toLocaleString()} reports on record. MAUDE entries are raw reports, not confirmed device problems, and recent months arrive with a lag.</p>}
                  </section>
                </div>
              )}
            </>
          )}
          {loading && <div className="nx-loading"><LoaderCircle className="nx-spin" size={18} /><span>{progress || "Loading scope from openFDA…"}</span></div>}
        </div>

        {paneCompany && (
          <aside className="nx-detail" aria-label="Company profile">
            <div className="nx-detail-head">
              <div>
                <span className="nx-eyebrow">Company · {paneCompany.operatorNumber ? `operator ${paneCompany.operatorNumber}` : "no operator number"}</span>
                <h2>{paneCompany.name}</h2>
                <p><MapPin size={12} /> {paneCompany.countries.map(regionName).join(", ") || "Country unavailable"} · {paneCompany.establishments.length} establishment{paneCompany.establishments.length === 1 ? "" : "s"}</p>
              </div>
              <button type="button" className="nx-btn icon" onClick={() => setPane(null)} aria-label="Close profile"><X size={15} /></button>
            </div>
            <div className="nx-detail-actions">
              <button type="button" className={`nx-btn small ${pinned.includes(paneCompany.key) ? "primary" : ""}`} onClick={() => togglePin(paneCompany.key)}>{pinned.includes(paneCompany.key) ? <PinOff size={12} /> : <Pin size={12} />} {pinned.includes(paneCompany.key) ? "Pinned" : "Pin to compare"}</button>
              <button type="button" className="nx-btn small" onClick={() => showCompanyListings(paneCompany)}><Table2 size={12} /> Listings</button>
              <button type="button" className="nx-btn small" onClick={() => exportListings(paneCompany.records, `company-${paneCompany.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`)}><ArrowDownToLine size={12} /> Excel</button>
            </div>
            <div className="nx-kv">
              <div><span>Listings in scope</span><b>{paneCompany.listings}</b></div>
              <div><span>Codes covered</span><b>{paneCompany.codes.length}{selectedCodes.length ? ` / ${selectedCodes.length}` : ""}</b></div>
              <div><span>First listed</span><b>{paneCompany.firstListed || "—"}</b></div>
              <div><span>Latest listed</span><b>{paneCompany.latestListed || "—"}</b></div>
            </div>
            <section className="nx-detail-section">
              <h3>Coverage</h3>
              {codeChips(paneCompany)}
            </section>
            <section className="nx-detail-section">
              <h3><Building2 size={13} /> Establishments <i>{paneCompany.establishments.length}</i></h3>
              {paneCompany.establishments.map((site) => (
                <div key={`${site.registrationNumber}-${site.name}`} className="nx-site">
                  <b>{site.name}</b>
                  <span>{site.role} · {site.location}</span>
                  <span className="nx-mono">REG {site.registrationNumber}{site.fei ? ` · FEI ${site.fei}` : ""}{site.expiry ? ` · expires ${site.expiry}` : ""}</span>
                </div>
              ))}
            </section>
            <section className="nx-detail-section">
              <h3><PackageSearch size={13} /> Listings by code</h3>
              {(codes.length ? codes.filter((code) => paneCompany.codeCounts[code]) : paneCompany.codes).map((code) => (
                <div key={code} className="nx-bycode">
                  <div className="nx-bycode-head"><span className="nx-code" style={{ background: "transparent", border: `1px solid ${codeColor(code)}`, color: codeColor(code) }}>{code}</span><span>{CODE_NAMES.get(code) || paneCompany.records.flatMap((r) => matchingProducts(r, applied)).find((p) => p.product_code === code)?.openfda?.device_name || "Product code"}</span><a className="nx-ext" href={codeLink(code)} target="_blank" rel="noreferrer" title="FDA product classification"><ExternalLink size={10} /></a></div>
                  {paneCompany.records.filter((record) => matchingProducts(record, applied).some((p) => p.product_code === code)).map((record, index) => (
                    <button key={`${record.registration?.registration_number}-${index}`} type="button" className="nx-listing-line" onClick={() => openListing(record)}>
                      <b>{listedDeviceNames(record).slice(0, 2).join(", ") || matchingProducts(record, applied).find((p) => p.product_code === code)?.openfda?.device_name || "Unnamed device"}</b>
                      <span>{firmName(record)} · {record.registration?.iso_country_code || "—"}{premarketSummary(record) ? ` · ${premarketSummary(record)}` : ""}{latestListingDate(record, applied) ? ` · ${latestListingDate(record, applied)}` : ""}</span>
                    </button>
                  ))}
                </div>
              ))}
            </section>
            {paneCompany.premarket.length > 0 && (
              <section className="nx-detail-section">
                <h3>510(k) / PMA</h3>
                <div className="nx-chips">{paneCompany.premarket.map((value) => (kLink(value) ? <a key={value} className="nx-ext" href={kLink(value)} target="_blank" rel="noreferrer">{value} <ExternalLink size={10} /></a> : <span key={value}>{value}</span>))}</div>
              </section>
            )}
            {paneCompany.tradeNames.length > 0 && (
              <section className="nx-detail-section">
                <h3>Trade names <i>{paneCompany.tradeNames.length}</i></h3>
                <div className="nx-chips">{paneCompany.tradeNames.map((name) => <span key={name}>{name}</span>)}</div>
              </section>
            )}
          </aside>
        )}

        {pane?.kind === "listing" && (() => {
          const record = pane.record;
          const matched = new Set(matchingProducts(record, applied));
          const listingProducts = [...(record.products || [])].map((product) => ({ product, matches: matched.has(product) })).sort((a, b) => Number(b.matches) - Number(a.matches));
          const owner = companyByKey.get(companyKey(record));
          return (
            <aside className="nx-detail" aria-label="Listing details">
              <div className="nx-detail-head">
                <div>
                  <span className="nx-eyebrow">Listing · REG {record.registration?.registration_number || "—"}</span>
                  <h2>{firmName(record)}</h2>
                  <p><MapPin size={12} /> {locationSummary(record)}</p>
                </div>
                <button type="button" className="nx-btn icon" onClick={() => setPane(null)} aria-label="Close details"><X size={15} /></button>
              </div>
              <div className="nx-detail-actions">
                {owner && <button type="button" className="nx-btn small" onClick={() => openCompany(owner.key)}><Users size={12} /> {owner.name}{owner.listings > 1 ? ` · ${owner.listings} listings` : ""}</button>}
                {premarketSummary(record) && kLink(premarketSummary(record).split(" · ")[0]) && <a className="nx-btn small" href={kLink(premarketSummary(record).split(" · ")[0])} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {premarketSummary(record).split(" · ")[0]} on FDA</a>}
              </div>
              <div className="nx-kv">
                <div><span>Registration #</span><b>{record.registration?.registration_number || "—"}</b></div>
                <div><span>FEI number</span><b>{record.registration?.fei_number || "—"}</b></div>
                <div><span>510(k) / PMA</span><b>{premarketSummary(record) || "—"}</b></div>
                <div><span>Expiry year</span><b>{record.registration?.reg_expiry_date_year || "—"}</b></div>
                <div><span>Owner / operator</span><b className="sans">{companyName(record)}</b></div>
                <div><span>Products on listing</span><b>{record.products?.length || 0}</b></div>
              </div>
              <section className="nx-detail-section">
                <h3><Building2 size={13} /> Establishment roles</h3>
                <div className="nx-chips">{record.establishment_type?.length ? record.establishment_type.map((type) => <span key={type}>{type}</span>) : <span>Not listed</span>}</div>
              </section>
              <section className="nx-detail-section">
                <h3><PackageSearch size={13} /> Products on this listing{selectedCodes.length > 0 && <i>{listingProducts.filter((entry) => entry.matches).length} in scope</i>}</h3>
                {listingProducts.map(({ product, matches }, index) => (
                  <article key={`${product.product_code}-${index}`} className={`nx-product ${selectedCodes.length && !matches ? "dim" : ""}`}>
                    <div><span className="nx-code" style={matches ? { background: "transparent", border: `1px solid ${codeColor(product.product_code || "")}`, color: codeColor(product.product_code || "") } : undefined}>{product.product_code || "—"}</span>{classBadge(product.openfda?.device_class)}{product.product_code && <a className="nx-ext" href={codeLink(product.product_code)} target="_blank" rel="noreferrer" title="FDA product classification"><ExternalLink size={10} /></a>}</div>
                    <h4>{product.openfda?.device_name || "Unnamed device"}</h4>
                    <p>{product.openfda?.medical_specialty_description || "Specialty unavailable"} · Regulation {product.openfda?.regulation_number || "—"}{product.created_date ? ` · Listed ${String(product.created_date).slice(0, 10)}` : ""}</p>
                  </article>
                ))}
              </section>
              {listedDeviceNames(record).length > 0 && (
                <section className="nx-detail-section"><h3>Trade names</h3><div className="nx-chips">{listedDeviceNames(record).map((name) => <span key={name}>{name}</span>)}</div></section>
              )}
              <section className="nx-detail-section"><details><summary>Raw openFDA record</summary><pre>{JSON.stringify(record, null, 2)}</pre></details></section>
            </aside>
          );
        })()}

        {pane?.kind === "compare" && (
          <aside className="nx-detail nx-compare" aria-label="Compare companies">
            <div className="nx-detail-head">
              <div><span className="nx-eyebrow">Compare</span><h2>{pinnedCompanies.length} compan{pinnedCompanies.length === 1 ? "y" : "ies"}</h2><p>Side by side within this scope. Pin up to four from the Companies view.</p></div>
              <button type="button" className="nx-btn icon" onClick={() => setPane(null)} aria-label="Close compare"><X size={15} /></button>
            </div>
            <div className="nx-table-wrap">
              <table className="nx-table nx-table-compact nx-compare-table">
                <thead><tr><th />{pinnedCompanies.map((company) => <th key={company.key}><button type="button" className="nx-linklike" onClick={() => openCompany(company.key)}>{company.name}</button></th>)}</tr></thead>
                <tbody>
                  {compareCompanies(pinnedCompanies, codes).map((row) => (
                    <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`}>{value}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        )}
      </div>

      {pinnedCompanies.length > 0 && (
        <div className="nx-tray" role="region" aria-label="Pinned companies">
          <GitCompareArrows size={14} />
          <span className="nx-tray-label">Comparing</span>
          {pinnedCompanies.map((company) => <span key={company.key} className="nx-tray-chip">{company.name}<button type="button" onClick={() => togglePin(company.key)} aria-label={`Unpin ${company.name}`}><X size={11} /></button></span>)}
          <button type="button" className="nx-btn small primary" onClick={() => setPane({ kind: "compare" })} disabled={pinnedCompanies.length < 2}>Compare {pinnedCompanies.length}</button>
          <button type="button" className="nx-btn small ghost" onClick={() => { setPinned([]); if (pane?.kind === "compare") setPane(null); }}>Clear</button>
        </div>
      )}

      <footer className="nx-status">
        <span className="nx-dot" aria-hidden="true" />
        <span className="nx-live">openFDA live</span>
        {datasetUpdated && <span title="The date openFDA last rebuilt this dataset — newer records aren't published yet.">FDA data as of {datasetUpdated}</span>}
        {fetchedAt && <span title="When this page last called the live API.">Pulled {fetchedAt.toLocaleString([], timeFormat)}</span>}
        {datasetTotal > 0 && <span>{datasetTotal.toLocaleString()} listings in dataset</span>}
        <div className="right">{hasSearched && <span>{scoped.length.toLocaleString()} listings · {companies.length.toLocaleString()} companies in scope</span>}</div>
      </footer>
    </NextShell>
  );
}
