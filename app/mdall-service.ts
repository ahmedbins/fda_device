import {
  MDALL_API,
  asMdallList,
  deviceSearchTokens,
  looksLikeMdallNumber,
  normalizeMdallCompany,
  normalizeMdallDevice,
  normalizeMdallLicence,
  parseMdallQuery,
  uniqueMdallLicences,
  type MdallCompany,
  type MdallDevice,
  type MdallLicence,
  type MdallLicenceState,
  type MdallSearchMode,
  type MdallSearchResult,
  type RawMdallRecord,
} from "./mdall-core";

const CACHE_MS = 5 * 60 * 1000;
const companyCache = new Map<number, MdallCompany>();
const searchCache = new Map<string, { expires: number; result: MdallSearchResult }>();

type SearchOptions = {
  query: string;
  mode?: MdallSearchMode;
  state?: MdallLicenceState;
  companyIds?: number[];
  signal?: AbortSignal;
};

function requestSignal(signal?: AbortSignal, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The Health Canada MDALL request timed out.", "TimeoutError")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function fetchMdall<T extends RawMdallRecord>(path: string, signal?: AbortSignal): Promise<T[]> {
  const timed = requestSignal(signal);
  try {
    const response = await fetch(`${MDALL_API}${path}`, {
      signal: timed.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Health Canada MDALL returned ${response.status}.`);
    return asMdallList<T>(await response.json());
  } finally {
    timed.cleanup();
  }
}

function licenceStates(state: MdallLicenceState): Array<"active" | "archived"> {
  if (state === "both") return ["active", "archived"];
  return [state];
}

function cacheKey(options: SearchOptions) {
  return JSON.stringify({
    query: parseMdallQuery(options.query),
    mode: options.mode || "auto",
    state: options.state || "active",
    companyIds: options.companyIds || [],
  });
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function fetchMdallCompany(companyId: number, signal?: AbortSignal) {
  const cached = companyCache.get(companyId);
  if (cached) return cached;
  const [raw] = await fetchMdall(`/company/?id=${companyId}&type=json`, signal);
  const company = raw ? normalizeMdallCompany(raw) : null;
  if (company) companyCache.set(companyId, company);
  return company;
}

export async function searchMdallCompanies(name: string, signal?: AbortSignal) {
  const query = parseMdallQuery(name);
  if (!query) return [];
  const rows = looksLikeMdallNumber(query)
    ? await fetchMdall(`/company/?id=${query}&type=json`, signal)
    : await fetchMdall(`/company/?company_name=${encodeURIComponent(query)}&type=json`, signal);
  return rows.map(normalizeMdallCompany).filter((company): company is MdallCompany => !!company);
}

async function fetchLicencesForCompany(companyId: number, state: MdallLicenceState, retrievedAt: string, signal?: AbortSignal) {
  const company = await fetchMdallCompany(companyId, signal);
  const batches = await Promise.all(licenceStates(state).map((item) => (
    fetchMdall(`/licence/?company_id=${companyId}&state=${item}&lang=en&type=json`, signal)
  )));
  return uniqueMdallLicences(batches.flat().map((raw) => normalizeMdallLicence(raw, retrievedAt, company || undefined)).filter((licence): licence is MdallLicence => !!licence));
}

async function fetchLicenceByNumber(licenceNumber: string, retrievedAt: string, signal?: AbortSignal) {
  const rows = await fetchMdall(`/licence/?id=${encodeURIComponent(licenceNumber)}&lang=en&type=json`, signal);
  return rows.map((raw) => normalizeMdallLicence(raw, retrievedAt)).filter((licence): licence is MdallLicence => !!licence);
}

async function attachCompanies(licences: MdallLicence[], signal?: AbortSignal) {
  const ids = [...new Set(licences.map((licence) => licence.companyId).filter((id): id is number => !!id && !companyCache.has(id)))];
  await mapPool(ids.slice(0, 40), 6, async (companyId) => fetchMdallCompany(companyId, signal));
  return licences.map((licence) => {
    const company = licence.company || (licence.companyId ? companyCache.get(licence.companyId) : undefined);
    return company ? { ...licence, company, companyName: company.companyName } : licence;
  });
}

async function licencesFromDeviceName(query: string, retrievedAt: string, signal?: AbortSignal) {
  const rows = await fetchMdall(`/device/?device_name=${encodeURIComponent(query)}&type=json`, signal);
  const devices = rows.map(normalizeMdallDevice).filter((device): device is MdallDevice => !!device).slice(0, 400);
  const numbers = [...new Set(devices.map((device) => device.licenceNumber))].slice(0, 80);
  const licences = (await mapPool(numbers, 6, async (licenceNumber) => fetchLicenceByNumber(String(licenceNumber), retrievedAt, signal))).flat();
  return { licences, devices };
}

async function licencesFromIdentifier(query: string, retrievedAt: string, signal?: AbortSignal) {
  const rows = await fetchMdall(`/deviceidentifier/?device_identifier=${encodeURIComponent(query)}&type=json`, signal);
  const numbers = [...new Set(rows.map((row) => Number(row.original_licence_no)).filter((value) => Number.isFinite(value) && value > 0))].slice(0, 80);
  const licences = (await mapPool(numbers, 6, async (licenceNumber) => fetchLicenceByNumber(String(licenceNumber), retrievedAt, signal))).flat();
  return licences;
}

export async function searchMdall(options: SearchOptions): Promise<MdallSearchResult> {
  const query = parseMdallQuery(options.query);
  const mode = options.mode || "auto";
  const state = options.state || "active";
  const key = cacheKey(options);
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;

  const retrievedAt = new Date().toISOString();
  const notes: string[] = [];
  let licences: MdallLicence[] = [];
  const companies: MdallCompany[] = [];

  if (options.companyIds?.length && (mode === "auto" || mode === "company") && !query) {
    const preset = (await mapPool(options.companyIds, 3, async (companyId) => fetchLicencesForCompany(companyId, state, retrievedAt, options.signal))).flat();
    licences = uniqueMdallLicences([...licences, ...preset]);
  }

  if (query && (mode === "auto" || mode === "company" || mode === "licenceNumber") && (mode === "company" || looksLikeMdallNumber(query) || mode === "auto")) {
    const foundCompanies = mode === "licenceNumber" ? [] : await searchMdallCompanies(query, options.signal);
    companies.push(...foundCompanies);
    const fromCompanies = (await mapPool(foundCompanies.map((company) => company.companyId), 4, async (companyId) => fetchLicencesForCompany(companyId, state, retrievedAt, options.signal))).flat();
    licences = uniqueMdallLicences([...licences, ...fromCompanies]);
    if (looksLikeMdallNumber(query) && (mode === "auto" || mode === "licenceNumber")) {
      licences = uniqueMdallLicences([...licences, ...await fetchLicenceByNumber(query, retrievedAt, options.signal)]);
    }
  }

  if (query && (mode === "auto" || mode === "licence") && !looksLikeMdallNumber(query)) {
    const rows = (await Promise.all(licenceStates(state).map((item) => (
      fetchMdall(`/licence/?licence_name=${encodeURIComponent(query)}&state=${item}&lang=en&type=json`, options.signal)
    )))).flat();
    licences = uniqueMdallLicences([
      ...licences,
      ...rows.map((raw) => normalizeMdallLicence(raw, retrievedAt)).filter((licence): licence is MdallLicence => !!licence),
    ]);
  }

  if (query && (mode === "auto" || mode === "device") && query.length >= 3) {
    const fromDevices = await licencesFromDeviceName(query, retrievedAt, options.signal);
    licences = uniqueMdallLicences([...licences, ...fromDevices.licences]);
    if (fromDevices.devices.length >= 400) notes.push("Device-name matches were capped. Narrow the device name if a licence is missing.");
  }

  if (query && (mode === "auto" || mode === "identifier") && query.length >= 3) {
    licences = uniqueMdallLicences([...licences, ...await licencesFromIdentifier(query, retrievedAt, options.signal)]);
  }

  if (state !== "both") {
    licences = licences.filter((licence) => state === "archived" ? licence.state === "archived" : licence.state === "active");
  }

  const withCompanies = await attachCompanies(licences, options.signal);
  const result: MdallSearchResult = {
    licences: uniqueMdallLicences(withCompanies),
    companies: [...new Map([...companies, ...withCompanies.map((licence) => licence.company).filter((company): company is MdallCompany => !!company)].map((company) => [company.companyId, company])).values()],
    retrievedAt,
    lastRefreshAt: withCompanies.find((licence) => licence.lastRefreshAt)?.lastRefreshAt,
    resolved: true,
    notes,
  };
  searchCache.set(key, { expires: Date.now() + CACHE_MS, result });
  return result;
}

export async function fetchMdallDevicesForLicence(licence: MdallLicence, signal?: AbortSignal): Promise<MdallDevice[]> {
  const tokens = deviceSearchTokens(licence.licenceName);
  const queries = [...tokens.slice(0, 2), licence.licenceName];
  const collected: MdallDevice[] = [];
  for (const query of queries) {
    const rows = await fetchMdall(`/device/?device_name=${encodeURIComponent(query)}&type=json`, signal);
    const matches = rows
      .map(normalizeMdallDevice)
      .filter((device): device is MdallDevice => !!device && device.licenceNumber === licence.licenceNumber);
    for (const device of matches) {
      if (!collected.some((item) => item.deviceId === device.deviceId)) collected.push(device);
    }
    if (collected.length) break;
  }
  const withIdentifiers = await mapPool(collected.slice(0, 12), 4, async (device) => {
    try {
      const rows = await fetchMdall(`/deviceidentifier/?id=${device.deviceId}&type=json`, signal);
      const identifiers = [...new Set(rows.map((row) => String(row.device_identifier || "").trim()).filter(Boolean))];
      return { ...device, identifiers };
    } catch {
      return device;
    }
  });
  return withIdentifiers;
}

export function clearMdallCache() {
  searchCache.clear();
  companyCache.clear();
}
