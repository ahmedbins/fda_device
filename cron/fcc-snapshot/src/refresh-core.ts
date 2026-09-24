/**
 * Pure logic behind the FCC snapshot refresher (no Cloudflare bindings), so Node tests can cover it.
 *
 * The FCC Equipment Authorization endpoint (apps.fcc.gov/OETLabServices/getFCCIDList) answers 403 to
 * automated clients, including Cloudflare Workers. The refresher therefore tries, in order:
 *   1. the official endpoint directly (in case the FCC ever allows it);
 *   2. the official endpoint through the r.jina.ai reader, asking for the raw source, which returns the
 *      FCC's XML records re-serialised with lower-case tags — still the FCC's own response body;
 *   3. the fccid.io public index of FCC filings, clearly labelled as a public index, never as official.
 *
 * Without a key the reader limits requests per IP, and Cloudflare Workers share outbound IPs, so anonymous
 * calls from here are often refused with HTTP 429. Retries are spread out because each attempt can leave
 * from a different IP; a JINA_API_KEY secret moves the limit to the key and makes the relay dependable.
 */
import { extractRawFccRecords, normalizeFccScope, parseFccPayload, type RawFccRecord } from "../../../app/fcc-core.ts";
import { fccidIoUrl, parseFccidListMarkdown, shouldFetchFccidListPages } from "../../../app/fcc-index.ts";

export const FCC_EAS_ENDPOINT = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
export const JINA_READER = "https://r.jina.ai/";
export const FCC_SCOPES_DEFAULT = ["KWC", "2A3UL"];
/** How long a manual refresh must wait after the previous run. */
export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
export const HISTORY_LIMIT = 30;
/** Scheduled runs skip a scope whose last good capture is younger than this (the cron fires every two hours). */
export const CAPTURE_TARGET_AGE_MS = 10 * 60 * 60 * 1000;

export type CaptureSource = "official" | "official_relay" | "public_index";

export type ScopeCapture = {
  scope: string;
  capturedAt: string;
  source: CaptureSource;
  sourceUrl: string;
  /** Official captures keep the FCC's own record fields; public-index captures keep the index fields. */
  records: RawFccRecord[];
  recordCount: number;
  attempts: string[];
};

export type ScopeFailure = { scope: string; capturedAt: string; error: string; attempts: string[] };

export type ScopeSummary = {
  scope: string;
  capturedAt: string;
  source?: CaptureSource;
  recordCount: number;
  added: string[];
  removed: string[];
  error?: string;
  /** Present on failures so the run history explains what was tried. */
  attempts?: string[];
  /** A scheduled run that left a recent capture as it was. */
  skipped?: boolean;
};

export type RefreshSummary = {
  refreshedAt: string;
  trigger: "cron" | "manual";
  scopes: Record<string, ScopeSummary>;
};

export function parseScopes(value: string | undefined) {
  const scopes = (value || "").split(/[,\s]+/).map(normalizeFccScope).filter((scope) => scope.length >= 3);
  return scopes.length ? [...new Set(scopes)] : FCC_SCOPES_DEFAULT;
}

/** Official records (from any of the official routes) share the FCC field names; index records use the app's normalized fields. */
export function recordKey(record: RawFccRecord) {
  const id = String(record.FCCId ?? record.fccId ?? record.fccid ?? "").toUpperCase();
  // Official captures date grants MM/DD/YYYY and index captures YYYY-MM-DD; compare them in one form.
  const rawDate = String(record.grantDate ?? record.authorizationDate ?? "");
  const slashed = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = slashed ? `${slashed[3]}-${slashed[1]}-${slashed[2]}` : rawDate.slice(0, 10);
  const purpose = String(record.applicationPurpose ?? record.purposeCategory ?? "");
  return [id, date, purpose].join("|");
}

export function parseOfficialBody(body: string, contentType = ""): RawFccRecord[] {
  return extractRawFccRecords(parseFccPayload(body, contentType)).filter((record) => typeof record.FCCId === "string" && record.FCCId.trim());
}

/** The jina reader may wrap the raw source in JSON (`data.html`) or return it as text. */
export function unwrapReaderBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { data?: { html?: string; content?: string; text?: string } };
      return parsed.data?.html || parsed.data?.content || parsed.data?.text || "";
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function parsePublicIndex(pages: string[], scope: string, capturedAt: string): RawFccRecord[] {
  const seen = new Map<string, RawFccRecord>();
  for (const page of pages) {
    for (const record of parseFccidListMarkdown(page, capturedAt, [scope])) {
      const key = [record.fccId, record.authorizationDate || "", record.applicationPurpose || ""].join("|");
      if (!seen.has(key)) {
        seen.set(key, {
          fccId: record.fccId,
          granteeCode: record.granteeCode || "",
          granteeName: record.granteeName || "",
          authorizationDate: record.authorizationDate || "",
          applicationPurpose: record.applicationPurpose || "",
          purposeCategory: record.purposeCategory || "",
          sourceUrl: record.sourceUrl,
        });
      }
    }
  }
  return [...seen.values()];
}

export function diffCaptures(previous: ScopeCapture | null | undefined, next: ScopeCapture) {
  const before = new Set((previous?.records || []).map(recordKey));
  const after = new Set(next.records.map(recordKey));
  const label = (key: string) => key.split("|")[0];
  return {
    added: [...after].filter((key) => !before.has(key)).map(label),
    removed: [...before].filter((key) => !after.has(key)).map(label),
  };
}

export function summarizeScope(previous: ScopeCapture | null | undefined, outcome: ScopeCapture | ScopeFailure): ScopeSummary {
  if ("error" in outcome) {
    return { scope: outcome.scope, capturedAt: outcome.capturedAt, recordCount: previous?.recordCount ?? 0, added: [], removed: [], error: outcome.error, attempts: outcome.attempts };
  }
  const { added, removed } = diffCaptures(previous, outcome);
  return { scope: outcome.scope, capturedAt: outcome.capturedAt, source: outcome.source, recordCount: outcome.recordCount, added, removed };
}

export function appendHistory(history: RefreshSummary[] | null | undefined, summary: RefreshSummary) {
  return [summary, ...(history || [])].slice(0, HISTORY_LIMIT);
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type CaptureOptions = {
  /** Reader API key (the JINA_API_KEY secret); requests with it are limited per key instead of per IP. */
  readerKey?: string;
  /** Wait before each reader attempt, in ms; the first entry is normally 0. */
  relayDelays?: number[];
  sleep?: (ms: number) => Promise<unknown>;
};

/** Spread over about four minutes so a per-IP, per-minute limit has reset and the Worker may leave from another IP. */
export const SCHEDULED_RELAY_DELAYS = [0, 20_000, 45_000, 75_000, 110_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Captures one scope, trying the official routes before the public index. */
export async function captureScope(scope: string, fetcher: Fetcher, now = () => new Date(), options: CaptureOptions = {}): Promise<ScopeCapture | ScopeFailure> {
  const attempts: string[] = [];
  const wait = options.sleep || sleep;
  const readerHeaders = (extra: Record<string, string>): Record<string, string> => ({ ...extra, ...(options.readerKey ? { authorization: `Bearer ${options.readerKey}` } : {}) });
  const officialUrl = `${FCC_EAS_ENDPOINT}?fccId=${encodeURIComponent(scope)}`;

  try {
    const response = await fetchWithTimeout(fetcher, officialUrl, { headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" } }, 8_000);
    if (response.status === 204) return { scope, capturedAt: now().toISOString(), source: "official", sourceUrl: officialUrl, records: [], recordCount: 0, attempts: [...attempts, "official: no records (204)"] };
    if (response.ok) {
      const records = parseOfficialBody(await response.text(), response.headers.get("content-type") || "");
      if (records.length) return { scope, capturedAt: now().toISOString(), source: "official", sourceUrl: officialUrl, records, recordCount: records.length, attempts: [...attempts, `official: ${records.length} records`] };
      attempts.push("official: answered without records");
    } else attempts.push(`official: HTTP ${response.status}`);
  } catch (error) {
    attempts.push(`official: ${error instanceof Error ? error.message : "failed"}`);
  }

  // The reader relay is shared infrastructure: retry on its rate limit, and only the first try bypasses its cache.
  const delays = options.relayDelays || [0, 2_500];
  for (const [index, delay] of delays.entries()) {
    try {
      if (delay) await wait(delay);
      const headers = readerHeaders({ accept: "text/plain", "x-return-format": "html", "user-agent": "Sonova-Regulatory-Data/1.0" });
      if (index === 0) headers["x-no-cache"] = "true";
      const response = await fetchWithTimeout(fetcher, `${JINA_READER}${officialUrl}`, { headers }, 30_000);
      if (response.ok) {
        const body = unwrapReaderBody(await response.text());
        const records = parseOfficialBody(body);
        if (records.length) return { scope, capturedAt: now().toISOString(), source: "official_relay", sourceUrl: officialUrl, records, recordCount: records.length, attempts: [...attempts, `official via reader relay: ${records.length} records`] };
        attempts.push(/access denied/i.test(body) ? "official via reader relay: FCC refused the relay" : `official via reader relay: no records in the response (${body.slice(0, 80).replace(/\s+/g, " ")})`);
        if (/access denied/i.test(body)) break;
      } else {
        attempts.push(`official via reader relay: HTTP ${response.status} ${(await response.text()).slice(0, 120).replace(/\s+/g, " ")}`);
        // Only a rate limit or a server hiccup is worth waiting out; anything else will answer the same way again.
        if (response.status !== 429 && response.status < 500) break;
      }
    } catch (error) {
      attempts.push(`official via reader relay: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  try {
    const pages: string[] = [];
    const maxPages = shouldFetchFccidListPages(scope) ? 3 : 1;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetchWithTimeout(fetcher, `${JINA_READER}${fccidIoUrl(scope, page)}`, { headers: readerHeaders({ accept: "text/plain", "user-agent": "Sonova-Regulatory-Data/1.0" }) }, 45_000);
      if (!response.ok) {
        attempts.push(`public index: HTTP ${response.status}`);
        break;
      }
      const markdown = await response.text();
      if (!markdown || /Security check/i.test(markdown)) break;
      pages.push(markdown);
      if ((markdown.match(/\*\*\[[A-Z0-9-]+\]/g) || []).length < 80) break;
    }
    const capturedAt = now().toISOString();
    const records = parsePublicIndex(pages, scope, capturedAt);
    if (records.length) return { scope, capturedAt, source: "public_index", sourceUrl: fccidIoUrl(scope), records, recordCount: records.length, attempts: [...attempts, `public index: ${records.length} records`] };
    if (!attempts.at(-1)?.startsWith("public index")) attempts.push("public index: no records");
  } catch (error) {
    attempts.push(`public index: ${error instanceof Error ? error.message : "failed"}`);
  }

  return { scope, capturedAt: now().toISOString(), error: "No source answered with records.", attempts };
}
