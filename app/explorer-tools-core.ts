/** Pure helpers behind `app/explorer-tools.tsx`, kept free of JSX so Node tests can import them. */

export type SortDir = "asc" | "desc";

/** Ignore header clicks while a column is being dragged and for a moment after (the release click lands on the header). */
export const DRAG_CLICK_GUARD_MS = 500;
export const MIN_COLUMN_WIDTH = 64;
/** A dragged column is stored as a share of the table pane, so it means the same at any window size. */
export const MIN_COLUMN_SHARE = 4;
export const MAX_COLUMN_SHARE = 92;
/** Shares never take the whole table: what is left is what the columns nobody dragged get to share. */
export const MAX_TOTAL_SHARE = 88;

/**
 * Shares are stored under their own key because they are not interchangeable with the pixel widths
 * that used to live in `*-col-widths-*`: a stored `48` meant 48 pixels then and 48% now, which
 * turned a 48px arrow column into half the table. The old keys are abandoned, not reinterpreted.
 */
export function columnSharesKey(name: string) {
  return `${name}-col-shares`;
}

/** Keeps the pinned columns from crowding out the rest, however many of them get dragged. */
export function fitShares(shares: Record<string, number>): Record<string, number> {
  const keys = Object.keys(shares);
  const total = keys.reduce((sum, key) => sum + shares[key], 0);
  if (total <= MAX_TOTAL_SHARE) return shares;
  const scale = MAX_TOTAL_SHARE / total;
  return Object.fromEntries(keys.map((key) => [key, Math.max(MIN_COLUMN_SHARE, Math.round(shares[key] * scale * 10) / 10)]));
}

/** Turns a dragged pixel width into the share of the pane it should keep, leaving the rest room. */
export function columnShare(width: number, paneWidth: number, sharing: number) {
  if (!(paneWidth > 0)) return MIN_COLUMN_SHARE;
  const ceiling = Math.max(MIN_COLUMN_SHARE, Math.min(MAX_COLUMN_SHARE, 100 - sharing * MIN_COLUMN_SHARE));
  return Math.round(Math.min(ceiling, Math.max(MIN_COLUMN_SHARE, (width / paneWidth) * 100)) * 10) / 10;
}
export const RECENT_MAX = 6;

export type RecentEntry = { params: string; label: string; at: string };

export function parseColumnWidths(raw: string | null): Record<string, number> {
  try {
    const parsed = JSON.parse(raw || "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return {};
    const shares = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] >= MIN_COLUMN_SHARE && entry[1] <= MAX_COLUMN_SHARE));
    return fitShares(shares);
  } catch {
    return {};
  }
}

/** Sort state for a table whose rows are all loaded on the device (FCC, Health Canada): any column can order them. */
export function toggleSort<K extends string>(current: { key: K; dir: SortDir }, key: K, numericKeys: readonly K[] = []): { key: K; dir: SortDir } {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: numericKeys.includes(key) ? "desc" : "asc" };
}

/** Orders two cell values; missing values always sort last regardless of direction. */
export function compareValues(a: string | number | undefined | null, b: string | number | undefined | null, dir: SortDir) {
  const missingA = a === undefined || a === "" || a === null;
  const missingB = b === undefined || b === "" || b === null;
  if (missingA && missingB) return 0;
  if (missingA) return 1;
  if (missingB) return -1;
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

export function parseRecentEntries(raw: string | null, max = RECENT_MAX): RecentEntry[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.params === "string" && typeof item.label === "string")
      .map((item) => ({ params: item.params, label: item.label, at: typeof item.at === "string" ? item.at : "" }))
      .slice(0, max);
  } catch {
    return [];
  }
}

/** Adds a search to the front of the list, de-duplicated by its URL parameters. */
export function rememberEntry(list: readonly RecentEntry[], params: string, label: string, at = new Date().toISOString(), max = RECENT_MAX): RecentEntry[] {
  if (!params) return [...list];
  return [{ params, label, at }, ...list.filter((item) => item.params !== params)].slice(0, max);
}

/** URL parameters that identify a search for the recent list: sort, paging and view choices are not part of it. */
export function recentSearchParams(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of ["sort", "rows", "page", "view"]) params.delete(key);
  return params.toString();
}
