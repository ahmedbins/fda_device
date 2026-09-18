/**
 * Pure logic behind the FCC snapshot refresher (no Cloudflare bindings), so Node tests can cover it.
 *
 * The FCC Equipment Authorization endpoint (apps.fcc.gov/OETLabServices/getFCCIDList) answers 403 to
 * automated clients, including Cloudflare Workers. The refresher therefore tries, in order:
 *   1. the official endpoint directly (in case the FCC ever allows it);
 *   2. the official endpoint through the r.jina.ai reader, asking for the raw source, which returns the
 *      FCC's XML records re-serialised with lower-case tags — still the FCC's own response body;
 *   3. the fccid.io public index of FCC filings, clearly labelled as a public index, never as official.
 */
import { extractRawFccRecords, normalizeFccScope, parseFccPayload, type RawFccRecord } from "../../../app/fcc-core.ts";
import { fccidIoUrl, parseFccidListMarkdown, shouldFetchFccidListPages } from "../../../app/fcc-index.ts";

export const FCC_EAS_ENDPOINT = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
export const JINA_READER = "https://r.jina.ai/";
export const FCC_SCOPES_DEFAULT = ["KWC", "2A3UL"];
/** How long a manual refresh must wait after the previous run. */
export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
export const HISTORY_LIMIT = 30;

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
  const date = String(record.grantDate ?? record.authorizationDate ?? "");
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
export async function captureScope(scope: string, fetcher: Fetcher, now = () => new Date()): Promise<ScopeCapture | ScopeFailure> {
  const attempts: string[] = [];
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

  // The reader relay is shared infrastructure: give it two tries, the second one without bypassing its cache.
  for (const attempt of [1, 2]) {
    try {
      if (attempt === 2) await sleep(2_500);
      const headers: Record<string, string> = { accept: "text/plain", "x-return-format": "html", "user-agent": "Sonova-Regulatory-Data/1.0" };
      if (attempt === 1) headers["x-no-cache"] = "true";
      const response = await fetchWithTimeout(fetcher, `${JINA_READER}${officialUrl}`, { headers }, 45_000);
      if (response.ok) {
        const body = unwrapReaderBody(await response.text());
        const records = parseOfficialBody(body);
        if (records.length) return { scope, capturedAt: now().toISOString(), source: "official_relay", sourceUrl: officialUrl, records, recordCount: records.length, attempts: [...attempts, `official via reader relay: ${records.length} records`] };
        attempts.push(/access denied/i.test(body) ? "official via reader relay: FCC refused the relay" : `official via reader relay: no records in the response (${body.slice(0, 80).replace(/\s+/g, " ")})`);
        if (/access denied/i.test(body)) break;
      } else attempts.push(`official via reader relay: HTTP ${response.status} ${(await response.text()).slice(0, 120).replace(/\s+/g, " ")}`);
    } catch (error) {
      attempts.push(`official via reader relay: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  try {
    const pages: string[] = [];
    const maxPages = shouldFetchFccidListPages(scope) ? 3 : 1;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetchWithTimeout(fetcher, `${JINA_READER}${fccidIoUrl(scope, page)}`, { headers: { accept: "text/plain", "user-agent": "Sonova-Regulatory-Data/1.0" } }, 45_000);
      if (!response.ok) break;
      const markdown = await response.text();
      if (!markdown || /Security check/i.test(markdown)) break;
      pages.push(markdown);
      if ((markdown.match(/\*\*\[[A-Z0-9-]+\]/g) || []).length < 80) break;
    }
    const capturedAt = now().toISOString();
    const records = parsePublicIndex(pages, scope, capturedAt);
    if (records.length) return { scope, capturedAt, source: "public_index", sourceUrl: fccidIoUrl(scope), records, recordCount: records.length, attempts: [...attempts, `public index: ${records.length} records`] };
    attempts.push("public index: no records");
  } catch (error) {
    attempts.push(`public index: ${error instanceof Error ? error.message : "failed"}`);
  }

  return { scope, capturedAt: now().toISOString(), error: "No source answered with records.", attempts };
}
