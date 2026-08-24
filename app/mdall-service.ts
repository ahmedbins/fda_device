import {
  MDALL_API,
  asMdallList,
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
} from "./mdall-core.ts";

const CACHE_MS = 5 * 60 * 1000;
const companyCache = new Map<number, MdallCompany>();
const searchCache = new Map<string, { expires: number; result: MdallSearchResult }>();
type ConcreteState = Exclude<MdallLicenceState, "both">;
type DeviceIndex = Map<number, MdallDevice[]>;
const deviceIndexCache = new Map<ConcreteState, { expires: number; index: DeviceIndex }>();
const deviceIndexRequests = new Map<ConcreteState, Promise<DeviceIndex>>();
const identifierCache = new Map<string, { expires: number; identifiers: string[] }>();

type SearchOptions = {
  query: string;
  mode?: MdallSearchMode;
  state?: MdallLicenceState;
  companyIds?: number[];
  signal?: AbortSignal;
};

export type MdallDeviceLookupResult = {
  devices: MdallDevice[];
  identifiersComplete: boolean;
  identifierErrors: string[];
};

export type MdallDeviceLookupOutcome =
  | ({ status: "complete" } & MdallDeviceLookupResult)
  | { status: "error"; error: string };

type DeviceLookupOptions = {
  state?: MdallLicenceState;
  includeIdentifiers?: boolean;
  signal?: AbortSignal;
};

type BulkDeviceLookupOptions = DeviceLookupOptions & {
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
};

export function mdallDeviceLookupKey(licence: MdallLicence) {
  return `${licence.licenceNumber}:${licence.state}`;
}

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

async function fetchMdall<T extends RawMdallRecord>(path: string, signal?: AbortSignal, timeoutMs = 20_000): Promise<T[]> {
  const timed = requestSignal(signal, timeoutMs);
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
  await mapPool(ids, 6, async (companyId) => fetchMdallCompany(companyId, signal));
  return licences.map((licence) => {
    const company = licence.company || (licence.companyId ? companyCache.get(licence.companyId) : undefined);
    return company ? { ...licence, company, companyName: company.companyName } : licence;
  });
}

function matchesState(endDate: string | undefined, state: ConcreteState) {
  return state === "active" ? !endDate : !!endDate;
}

function uniqueDevices(devices: MdallDevice[]) {
  const unique = new Map<number, MdallDevice>();
  for (const device of devices) {
    const current = unique.get(device.deviceId);
    if (!current || (current.endDate && !device.endDate) || (device.firstLicensedAt || "") > (current.firstLicensedAt || "")) {
      unique.set(device.deviceId, device);
    }
  }
  return [...unique.values()].sort((a, b) => (b.firstLicensedAt || "").localeCompare(a.firstLicensedAt || "") || a.tradeName.localeCompare(b.tradeName));
}

async function devicesForStateQuery(query: string, state: ConcreteState, signal?: AbortSignal) {
  const rows = await fetchMdall(`/device/?device_name=${encodeURIComponent(query)}&state=${state}&type=json`, signal);
  return rows
    .map(normalizeMdallDevice)
    .filter((device): device is MdallDevice => !!device && matchesState(device.endDate, state));
}

async function licencesFromDeviceName(query: string, retrievedAt: string, state: MdallLicenceState, signal?: AbortSignal) {
  const devices = uniqueDevices((await Promise.all(licenceStates(state).map((item) => devicesForStateQuery(query, item, signal)))).flat());
  const numbers = [...new Set(devices.map((device) => device.licenceNumber))];
  const licences = (await mapPool(numbers, 6, async (licenceNumber) => fetchLicenceByNumber(String(licenceNumber), retrievedAt, signal))).flat();
  return { licences, devices };
}

function rawEndDate(row: RawMdallRecord) {
  const value = row.end_date;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function licencesFromIdentifier(query: string, retrievedAt: string, state: MdallLicenceState, signal?: AbortSignal) {
  const batches = await Promise.all(licenceStates(state).map((item) => (
    fetchMdall(`/deviceidentifier/?device_identifier=${encodeURIComponent(query)}&state=${item}&type=json`, signal)
      .then((rows) => rows.filter((row) => matchesState(rawEndDate(row), item)))
  )));
  const numbers = [...new Set(batches.flat().map((row) => Number(row.original_licence_no)).filter((value) => Number.isFinite(value) && value > 0))];
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
    const fromDevices = await licencesFromDeviceName(query, retrievedAt, state, options.signal);
    licences = uniqueMdallLicences([...licences, ...fromDevices.licences]);
  }

  if (query && (mode === "auto" || mode === "identifier") && query.length >= 3) {
    licences = uniqueMdallLicences([...licences, ...await licencesFromIdentifier(query, retrievedAt, state, options.signal)]);
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

async function fetchDeviceIndex(state: ConcreteState, signal?: AbortSignal) {
  const cached = deviceIndexCache.get(state);
  if (cached && cached.expires > Date.now()) return cached.index;
  const pending = deviceIndexRequests.get(state);
  if (pending) return pending;

  const request = (async () => {
    const rows = await fetchMdall(`/device/?state=${state}&type=json`, signal, 60_000);
    const devices = uniqueDevices(rows
      .map(normalizeMdallDevice)
      .filter((device): device is MdallDevice => !!device && matchesState(device.endDate, state)));
    const index: DeviceIndex = new Map();
    for (const device of devices) index.set(device.licenceNumber, [...(index.get(device.licenceNumber) || []), device]);
    deviceIndexCache.set(state, { expires: Date.now() + CACHE_MS, index });
    return index;
  })();
  deviceIndexRequests.set(state, request);
  try {
    return await request;
  } finally {
    deviceIndexRequests.delete(state);
  }
}

async function fetchIdentifiersForDevice(device: MdallDevice, state: MdallLicenceState, signal?: AbortSignal) {
  const cacheId = `${state}:${device.deviceId}`;
  const cached = identifierCache.get(cacheId);
  if (cached && cached.expires > Date.now()) return cached.identifiers;

  const rows = (await Promise.all(licenceStates(state).map((item) => (
    fetchMdall(`/deviceidentifier/?id=${device.deviceId}&state=${item}&type=json`, signal)
      .then((batch) => batch.filter((row) => {
        const rowDeviceId = Number(row.device_id);
        const rowLicenceNumber = Number(row.original_licence_no);
        return rowDeviceId === device.deviceId
          && rowLicenceNumber === device.licenceNumber
          && matchesState(rawEndDate(row), item);
      }))
  )))).flat();
  const identifiers = [...new Map(rows.map((row) => {
    const identifier = String(row.device_identifier || "").trim();
    return [`${device.deviceId}|${identifier}`, identifier] as const;
  }).filter((entry) => !!entry[1])).values()];
  identifierCache.set(cacheId, { expires: Date.now() + CACHE_MS, identifiers });
  return identifiers;
}

export async function fetchMdallDevicesForLicence(licence: MdallLicence, options: DeviceLookupOptions = {}): Promise<MdallDeviceLookupResult> {
  const state = options.state || licence.state;
  const indexes = await Promise.all(licenceStates(state).map((item) => fetchDeviceIndex(item, options.signal)));
  const devices = uniqueDevices(indexes.flatMap((index) => index.get(licence.licenceNumber) || []));
  if (options.includeIdentifiers === false) return { devices, identifiersComplete: false, identifierErrors: [] };

  const identifierErrors: string[] = [];
  const withIdentifiers = await mapPool(devices, 6, async (device) => {
    try {
      const identifiers = await fetchIdentifiersForDevice(device, state, options.signal);
      return { ...device, identifiers, identifierDataComplete: true };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Identifier lookup failed.";
      identifierErrors.push(`Device ${device.deviceId}: ${message}`);
      return { ...device, identifierDataComplete: false, identifierDataError: message };
    }
  });
  return { devices: withIdentifiers, identifiersComplete: identifierErrors.length === 0, identifierErrors };
}

export async function fetchMdallDevicesForLicences(licences: MdallLicence[], options: BulkDeviceLookupOptions = {}) {
  const outcomes = new Map<string, MdallDeviceLookupOutcome>();
  let completed = 0;
  await mapPool(licences, options.concurrency || 6, async (licence) => {
    try {
      const result = await fetchMdallDevicesForLicence(licence, options);
      outcomes.set(mdallDeviceLookupKey(licence), { status: "complete", ...result });
    } catch (caught) {
      outcomes.set(mdallDeviceLookupKey(licence), {
        status: "error",
        error: caught instanceof Error ? caught.message : "Device data was not retrieved.",
      });
    } finally {
      completed += 1;
      options.onProgress?.(completed, licences.length);
    }
  });
  return outcomes;
}

export function clearMdallCache() {
  searchCache.clear();
  companyCache.clear();
  deviceIndexCache.clear();
  deviceIndexRequests.clear();
  identifierCache.clear();
}
