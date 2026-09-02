import {
  type GazetteIssue,
  type GazetteItem,
  type GazettePart,
  extractPageText,
  extractSectionBodies,
  parsePartIExtra,
  parsePartIIIYear,
  parsePartIIIndex,
  parsePartIIInstrumentPage,
  parsePartIIndex,
  parseYearIndex,
  yearIndexUrl,
} from "./gazette-core.ts";

/*
 * Orchestrates Canada Gazette loading over an injected `fetchText`, so the
 * same code runs in the browser (through the same-origin proxy), in Node for
 * calibration against real publications, and in tests with fixtures.
 */

export type FetchText = (url: string) => Promise<string>;

export type PartStatus = {
  part: GazettePart;
  status: "ok" | "partial" | "error" | "empty";
  message?: string;
  issues: number;
  items: number;
  updatedAt?: string;
  latestIssueDate?: string;
};

export type LoadResult = {
  items: GazetteItem[];
  issues: GazetteIssue[];
  statuses: PartStatus[];
  checkedAt: string;
};

export type LoadOptions = {
  parts: GazettePart[];
  since: string;
  fetchText: FetchText;
  now?: Date;
  concurrency?: number;
  onProgress?: (message: string) => void;
};

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function sinceWeeks(weeks: number, now = new Date()) {
  return isoDate(new Date(now.getTime() - weeks * 7 * 86400000));
}

async function runPool<T, R>(inputs: readonly T[], concurrency: number, task: (input: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, inputs.length)) }, async () => {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(inputs[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function yearsBetween(since: string, now: Date) {
  const start = Number(since.slice(0, 4));
  const end = now.getFullYear();
  const years: number[] = [];
  for (let year = end; year >= start && year >= end - 3; year -= 1) years.push(year);
  return years;
}

async function loadIssueList(part: GazettePart, since: string, now: Date, fetchText: FetchText) {
  const issues: GazetteIssue[] = [];
  const errors: string[] = [];
  for (const year of yearsBetween(since, now)) {
    try {
      const html = await fetchText(yearIndexUrl(part, year));
      issues.push(...parseYearIndex(html, part, year).filter((issue) => issue.date >= since));
    } catch (caught) {
      errors.push(`${year}: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }
  return { issues: issues.sort((a, b) => b.date.localeCompare(a.date)), errors };
}

async function loadIssueItems(issue: GazetteIssue, fetchText: FetchText): Promise<GazetteItem[]> {
  const html = await fetchText(issue.url);
  if (issue.part === "I") return issue.extra ? parsePartIExtra(html, issue) : parsePartIIndex(html, issue);
  return issue.extra ? [parsePartIIInstrumentPage(html, issue)] : parsePartIIIndex(html, issue);
}

async function loadPartIII(since: string, now: Date, fetchText: FetchText): Promise<{ items: GazetteItem[]; status: PartStatus }> {
  const items: GazetteItem[] = [];
  const errors: string[] = [];
  let loadedYears = 0;
  // Acts assented this year are published in the volume that closed last year, so always look one year back.
  const years = [...new Set([now.getFullYear(), now.getFullYear() - 1, ...yearsBetween(since, now)])];
  for (const year of years) {
    try {
      const html = await fetchText(yearIndexUrl("III", year));
      items.push(...parsePartIIIYear(html, year).filter((item) => item.issueDate >= since));
      loadedYears += 1;
    } catch (caught) {
      // Part III only exists for years with royal assents; a missing year is normal.
      const message = caught instanceof Error ? caught.message : String(caught);
      if (!/404|not found/i.test(message)) errors.push(`${year}: ${message}`);
    }
  }
  const status: PartStatus = {
    part: "III",
    status: errors.length ? (loadedYears ? "partial" : "error") : items.length ? "ok" : "empty",
    message: errors.join("; ") || undefined,
    issues: new Set(items.map((item) => item.issueDate)).size,
    items: items.length,
    updatedAt: loadedYears ? now.toISOString() : undefined,
    latestIssueDate: items[0]?.issueDate,
  };
  return { items, status };
}

export async function loadGazette(options: LoadOptions): Promise<LoadResult> {
  const now = options.now ?? new Date();
  const concurrency = options.concurrency ?? 4;
  const allItems: GazetteItem[] = [];
  const allIssues: GazetteIssue[] = [];
  const statuses: PartStatus[] = [];

  for (const part of options.parts) {
    if (part === "III") {
      options.onProgress?.("Reading Part III (Acts of Parliament)…");
      const result = await loadPartIII(options.since, now, options.fetchText);
      allItems.push(...result.items);
      statuses.push(result.status);
      continue;
    }
    options.onProgress?.(`Listing Part ${part} issues…`);
    const { issues, errors } = await loadIssueList(part, options.since, now, options.fetchText);
    allIssues.push(...issues);
    let loaded = 0;
    const perIssue = await runPool(issues, concurrency, async (issue) => {
      try {
        const items = await loadIssueItems(issue, options.fetchText);
        loaded += 1;
        options.onProgress?.(`Part ${part}: ${loaded} of ${issues.length} issues read`);
        return { items, error: "" };
      } catch (caught) {
        return { items: [] as GazetteItem[], error: `${issue.date}: ${caught instanceof Error ? caught.message : String(caught)}` };
      }
    });
    const items = perIssue.flatMap((entry) => entry.items);
    const issueErrors = perIssue.map((entry) => entry.error).filter(Boolean);
    allItems.push(...items);
    const failures = [...errors, ...issueErrors];
    statuses.push({
      part,
      status: failures.length ? (loaded ? "partial" : "error") : items.length ? "ok" : "empty",
      message: failures.slice(0, 3).join("; ") || undefined,
      issues: issues.length,
      items: items.length,
      updatedAt: loaded || (!failures.length && issues.length === 0) ? now.toISOString() : undefined,
      latestIssueDate: issues[0]?.date,
    });
  }

  allItems.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || a.part.localeCompare(b.part) || a.id.localeCompare(b.id));
  return { items: allItems, issues: allIssues, statuses, checkedAt: now.toISOString() };
}

export type BodyOptions = {
  concurrency?: number;
  limit?: number;
  onUpdate?: (updated: GazetteItem[]) => void;
};

/** Attaches full text to items, one fetch per page (a Part I section page serves every notice anchored on it). */
export async function loadBodies(items: readonly GazetteItem[], fetchText: FetchText, options: BodyOptions = {}): Promise<GazetteItem[]> {
  const pending = items.filter((item) => item.bodyStatus === "none" && item.bodyUrl);
  const byUrl = new Map<string, GazetteItem[]>();
  pending.forEach((item) => {
    const group = byUrl.get(item.bodyUrl as string) || [];
    group.push(item);
    byUrl.set(item.bodyUrl as string, group);
  });
  const urls = [...byUrl.keys()].slice(0, options.limit ?? byUrl.size);
  const updates = new Map<string, GazetteItem>();
  await runPool(urls, options.concurrency ?? 4, async (url) => {
    const group = byUrl.get(url) || [];
    try {
      const html = await fetchText(url);
      const sectionBodies = group.some((item) => item.anchor) ? extractSectionBodies(html) : null;
      const pageText = sectionBodies ? sectionBodies.get("") || "" : extractPageText(html);
      group.forEach((item) => {
        const body = (item.anchor && sectionBodies?.get(item.anchor)) || pageText;
        updates.set(item.id, { ...item, body, bodyStatus: body ? "loaded" : "unavailable" });
      });
    } catch {
      group.forEach((item) => updates.set(item.id, { ...item, bodyStatus: "unavailable" }));
    }
    options.onUpdate?.([...updates.values()]);
  });
  return items.map((item) => updates.get(item.id) || item);
}
