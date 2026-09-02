"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Info,
  Link2,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { PART_LABELS, type GazetteItem, type GazettePart, itemHeadings, proxyUrl } from "../gazette-core";
import { type PartStatus, loadBodies, loadGazette, sinceWeeks } from "../gazette-service";
import {
  COOCCURRENCE,
  DEFAULT_CONFIG,
  GROUP_LABELS,
  PRIORITIES,
  PROFILES,
  TOPIC_GROUPS,
  type ConceptGroup,
  type Priority,
  type Relevance,
  profileById,
  scoreText,
} from "../gazette-scoring";
import { downloadExcel } from "../excel-export";
import { NextShell } from "./shell";
import "./next.css";

type Scored = { item: GazetteItem; rel: Relevance };
type SortMode = "relevance" | "date";
type Cache = { version: number; savedAt: string; checkedAt: string; updatedAt: string; parts: GazettePart[]; weeks: number; statuses: PartStatus[]; items: GazetteItem[] };

const PART_ORDER: GazettePart[] = ["I", "II", "III"];
const WEEK_OPTIONS = [4, 8, 13, 26];
const CACHE_KEY = "nx-gazette-cache-v1";
const BODY_KEEP = 20000;
const DEEPEN_LIMIT = 120;
const DEEPEN_THRESHOLD = 8;
const PRIORITY_COLORS: Record<Priority, string> = { Critical: "#b7382b", High: "#d97a1c", Medium: "#c9a500", Low: "#8fa3c4", "Very Low": "#d3d8df" };

const slug = (value: string) => value.toLowerCase().replace(/\s+/g, "-");
/** Module-level memo: scoring is pure in (item text, profile), so results survive re-renders and remounts. */
const scoreCache = new Map<string, { key: string; rel: Relevance }>();

function readUrl() {
  const fallback = { profile: "general", parts: PART_ORDER, weeks: 13, priorities: [] as Priority[], topics: [] as ConceptGroup[], q: "", sort: "relevance" as SortMode };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const parts = (params.get("parts") || "").split(",").filter((part): part is GazettePart => PART_ORDER.includes(part as GazettePart));
  const weeks = Number(params.get("weeks"));
  return {
    profile: profileById(params.get("profile")).id,
    parts: parts.length ? parts : PART_ORDER,
    weeks: WEEK_OPTIONS.includes(weeks) ? weeks : 13,
    priorities: (params.get("priority") || "").split(",").filter((value): value is Priority => PRIORITIES.includes(value as Priority)),
    topics: (params.get("topic") || "").split(",").filter((value): value is ConceptGroup => TOPIC_GROUPS.includes(value as ConceptGroup)),
    q: params.get("q") || "",
    sort: params.get("sort") === "date" ? "date" as const : "relevance" as const,
  };
}

function writeUrl(state: ReturnType<typeof readUrl>) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.profile !== "general") params.set("profile", state.profile);
  if (state.parts.length !== PART_ORDER.length) params.set("parts", state.parts.join(","));
  if (state.weeks !== 13) params.set("weeks", String(state.weeks));
  if (state.priorities.length) params.set("priority", state.priorities.join(","));
  if (state.topics.length) params.set("topic", state.topics.join(","));
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.sort !== "relevance") params.set("sort", state.sort);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

async function fetchText(url: string) {
  const response = await fetch(proxyUrl(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 404 ? " (not published)" : ""}`);
  return response.text();
}

function trimForCache(item: GazetteItem): GazetteItem {
  return item.body && item.body.length > BODY_KEEP ? { ...item, body: item.body.slice(0, BODY_KEEP) } : item;
}

function readCache(): Cache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as Cache | null;
    return parsed && parsed.version === 1 && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cache: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, items: cache.items.map(trimForCache) }));
  } catch {
    // Quota exceeded or storage unavailable: the page still works, it just cannot show cached data next time.
  }
}

function snippet(body: string | undefined, terms: string[]) {
  if (!body) return null;
  const lower = body.toLowerCase();
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - 160);
      const end = Math.min(body.length, index + term.length + 220);
      return { before: `${start > 0 ? "…" : ""}${body.slice(start, index)}`, hit: body.slice(index, index + term.length), after: `${body.slice(index + term.length, end)}${end < body.length ? "…" : ""}` };
    }
  }
  return { before: body.slice(0, 320), hit: "", after: body.length > 320 ? "…" : "" };
}

function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function GazettePage() {
  const [initial] = useState(readUrl);
  const [profileId, setProfileId] = useState(initial.profile);
  const [parts, setParts] = useState<GazettePart[]>(initial.parts);
  const [weeks, setWeeks] = useState(initial.weeks);
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>(initial.priorities);
  const [topicFilter, setTopicFilter] = useState<ConceptGroup[]>(initial.topics);
  const [query, setQuery] = useState(initial.q);
  const [sort, setSort] = useState<SortMode>(initial.sort);
  const [items, setItems] = useState<GazetteItem[]>([]);
  const [statuses, setStatuses] = useState<PartStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loadedParts, setLoadedParts] = useState<GazettePart[]>([]);
  const [loadedWeeks, setLoadedWeeks] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [deepening, setDeepening] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const seq = useRef(0);
  const rulesPicker = useRef<HTMLDetailsElement>(null);

  const profile = profileById(profileId);
  const since = sinceWeeks(weeks);

  const mergeItems = useCallback((updates: GazetteItem[]) => {
    const byId = new Map(updates.map((item) => [item.id, item]));
    setItems((current) => current.map((item) => byId.get(item.id) || item));
  }, []);

  const deepen = useCallback(async (source: GazetteItem[], run: number, targetParts: GazettePart[], targetWeeks: number) => {
    const general = profileById("general");
    const hearing = profileById("hearing");
    // Rank candidates by their title-only score so the most promising pages are read first when the limit bites.
    const candidates = source
      .filter((item) => item.bodyStatus === "none" && !!item.bodyUrl)
      .map((item) => {
        const input = { title: item.title, headings: itemHeadings(item), depth: "title" as const };
        const preliminary = Math.max(scoreText(input, general).score, scoreText(input, hearing).score);
        const structural = item.part === "II" || /proposed regulations|orders in council/i.test(item.section);
        return { item, preliminary, eligible: structural || preliminary >= DEEPEN_THRESHOLD };
      })
      .filter((entry) => entry.eligible)
      .sort((a, b) => b.preliminary - a.preliminary || b.item.issueDate.localeCompare(a.item.issueDate))
      .map((entry) => entry.item);
    const pages = new Set(candidates.map((item) => item.bodyUrl)).size;
    const total = Math.min(pages, DEEPEN_LIMIT);
    if (!total) return;
    setDeepening({ done: 0, total });
    let done = 0;
    const updated = await loadBodies(candidates, fetchText, {
      concurrency: 3,
      limit: DEEPEN_LIMIT,
      onUpdate: (updates) => {
        if (run !== seq.current) return;
        done += 1;
        mergeItems(updates);
        setDeepening({ done: Math.min(done, total), total });
      },
    });
    if (run !== seq.current) return;
    setDeepening(null);
    setItems((current) => {
      const byId = new Map(updated.map((item) => [item.id, item]));
      const merged = current.map((item) => byId.get(item.id) || item);
      writeCache({ version: 1, savedAt: new Date().toISOString(), checkedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), parts: targetParts, weeks: targetWeeks, statuses: [], items: merged });
      return merged;
    });
  }, [mergeItems]);

  const refresh = useCallback(async (targetParts: GazettePart[], targetWeeks: number) => {
    const run = ++seq.current;
    setLoading(true);
    setError("");
    setDeepening(null);
    setProgress("Contacting gazette.gc.ca…");
    const startedAt = new Date().toISOString();
    try {
      const result = await loadGazette({
        parts: PART_ORDER.filter((part) => targetParts.includes(part)),
        since: sinceWeeks(targetWeeks),
        fetchText,
        concurrency: 4,
        onProgress: (message) => run === seq.current && setProgress(message),
      });
      if (run !== seq.current) return;
      setCheckedAt(result.checkedAt);
      setStatuses(result.statuses);
      const usable = result.statuses.some((status) => status.status === "ok" || status.status === "partial" || status.status === "empty");
      if (!usable) {
        setError("Could not read any Canada Gazette part. Showing the last successful update, if any.");
        return;
      }
      setItems(result.items);
      setUpdatedAt(result.checkedAt);
      setLoadedParts(targetParts);
      setLoadedWeeks(targetWeeks);
      setFromCache(false);
      setExpanded(null);
      writeCache({ version: 1, savedAt: result.checkedAt, checkedAt: result.checkedAt, updatedAt: result.checkedAt, parts: targetParts, weeks: targetWeeks, statuses: result.statuses, items: result.items });
      setLoading(false);
      setProgress("");
      void deepen(result.items, run, targetParts, targetWeeks);
    } catch (caught) {
      if (run !== seq.current) return;
      setCheckedAt(startedAt);
      setError(caught instanceof Error ? caught.message : "Unable to reach the Canada Gazette.");
    } finally {
      if (run === seq.current) {
        setLoading(false);
        setProgress("");
      }
    }
  }, [deepen]);

  useEffect(() => {
    const cached = readCache();
    queueMicrotask(() => {
      if (cached && cached.parts.join() === initial.parts.join() && cached.weeks === initial.weeks) {
        setItems(cached.items);
        setStatuses(cached.statuses);
        setCheckedAt(cached.checkedAt);
        setUpdatedAt(cached.updatedAt);
        setLoadedParts(cached.parts);
        setLoadedWeeks(cached.weeks);
        setFromCache(true);
      }
      void refresh(initial.parts, initial.weeks);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeUrl({ profile: profileId, parts, weeks, priorities: priorityFilter, topics: topicFilter, q: query, sort });
  }, [profileId, parts, weeks, priorityFilter, topicFilter, query, sort]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const picker = rulesPicker.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const scored = useMemo<Scored[]>(() => {
    const cache = scoreCache;
    return items.map((item) => {
      const key = `${profile.id}|${item.bodyStatus}|${item.body?.length || 0}`;
      const hit = cache.get(item.id);
      if (hit && hit.key === key) return { item, rel: hit.rel };
      const rel = scoreText({ title: item.title, headings: itemHeadings(item), body: item.body, depth: item.bodyStatus === "loaded" ? "full" : "title" }, profile);
      cache.set(item.id, { key, rel });
      return { item, rel };
    });
  }, [items, profile]);

  const inWindow = useMemo(() => scored.filter(({ item }) => parts.includes(item.part) && item.issueDate >= since), [scored, parts, since]);
  const priorityCounts = useMemo(() => {
    const counts = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])) as Record<Priority, number>;
    inWindow.forEach(({ rel }) => { counts[rel.priority] += 1; });
    return counts;
  }, [inWindow]);
  const topicCounts = useMemo(() => {
    const counts = Object.fromEntries(TOPIC_GROUPS.map((group) => [group, 0])) as Record<ConceptGroup, number>;
    inWindow.forEach(({ rel }) => rel.topics.forEach((topic) => { counts[topic] += 1; }));
    return counts;
  }, [inWindow]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = inWindow.filter(({ item, rel }) => {
      if (priorityFilter.length && !priorityFilter.includes(rel.priority)) return false;
      if (topicFilter.length && !rel.topics.some((topic) => topicFilter.includes(topic))) return false;
      if (needle) {
        const haystack = `${item.title} ${itemHeadings(item)} ${item.registration || ""} ${rel.matches.map((match) => match.label).join(" ")}`.toLowerCase();
        if (!needle.split(/\s+/).every((term) => haystack.includes(term))) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => (sort === "relevance" ? b.rel.score - a.rel.score || b.item.issueDate.localeCompare(a.item.issueDate) : b.item.issueDate.localeCompare(a.item.issueDate) || b.rel.score - a.rel.score) || a.item.title.localeCompare(b.item.title));
  }, [inWindow, priorityFilter, topicFilter, query, sort]);

  const filtersActive = priorityFilter.length > 0 || topicFilter.length > 0 || query.trim().length > 0 || parts.length !== PART_ORDER.length;
  const stale = !!updatedAt && !!checkedAt && new Date(checkedAt).getTime() - new Date(updatedAt).getTime() > 36 * 3600000;
  const needsReload = loadedWeeks > 0 && (loadedWeeks < weeks || parts.some((part) => !loadedParts.includes(part)));

  const togglePriority = (priority: Priority) => setPriorityFilter((current) => (current.includes(priority) ? current.filter((entry) => entry !== priority) : [...current, priority]));
  const toggleTopic = (topic: ConceptGroup) => setTopicFilter((current) => (current.includes(topic) ? current.filter((entry) => entry !== topic) : [...current, topic]));
  const togglePart = (part: GazettePart) => setParts((current) => (current.includes(part) ? (current.length > 1 ? current.filter((entry) => entry !== part) : current) : PART_ORDER.filter((entry) => entry === part || current.includes(entry))));
  const showAll = () => { setPriorityFilter([]); setTopicFilter([]); setQuery(""); setParts(PART_ORDER); };

  const loadOne = async (item: GazetteItem) => {
    const run = seq.current;
    const [updated] = await loadBodies([item], fetchText);
    if (run === seq.current && updated) mergeItems([updated]);
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

  const exportExcel = () => downloadExcel({
    filename: `canada-gazette-${profile.id}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: "Gazette items",
    columns: [
      { header: "Priority", width: 10 }, { header: "Score", type: "number", width: 7 }, { header: "Part", width: 7 }, { header: "Date", type: "date", width: 12 },
      { header: "Title", width: 60 }, { header: "Section", width: 22 }, { header: "Organization", width: 28 }, { header: "Act / enabling statute", width: 32 },
      { header: "Registration", width: 14 }, { header: "Topics", width: 26 }, { header: "Why (app-generated)", width: 60 }, { header: "Matched concepts", width: 40 }, { header: "Text scored", width: 10 }, { header: "Official link", type: "link", width: 40 },
    ],
    rows: visible.map(({ item, rel }) => [
      rel.priority, rel.score, `${item.part}${item.extra ? " (extra)" : ""}`, item.issueDate, item.title, item.section, item.organization, item.act || item.enablingActs.join("; "),
      item.registration || "", rel.topics.map((topic) => GROUP_LABELS[topic]).join("; "), rel.reasons.join(" · "), rel.matches.map((match) => match.label).join("; "), rel.depth === "full" ? "full text" : "title only", { text: "Open", url: item.url },
    ]),
  });

  const statusFor = (part: GazettePart) => statuses.find((status) => status.part === part);
  const statusClass = (status?: PartStatus) => (!status ? "" : status.status === "ok" || status.status === "empty" ? "ok" : status.status === "partial" ? "partial" : "bad");

  return (
    <NextShell active="gazette">
      <header className="nx-topbar">
        <div className="nx-scope-row">
          <div className="nx-seg" role="group" aria-label="Relevance profile">
            {PROFILES.map((entry) => (
              <button key={entry.id} type="button" className={profile.id === entry.id ? "active" : ""} aria-pressed={profile.id === entry.id} title={entry.description} onClick={() => setProfileId(entry.id)}>{entry.name}</button>
            ))}
          </div>
          <div className="nx-seg" role="group" aria-label="Gazette parts">
            {PART_ORDER.map((part) => (
              <button key={part} type="button" className={parts.includes(part) ? "active" : ""} aria-pressed={parts.includes(part)} title={PART_LABELS[part]} onClick={() => togglePart(part)}>Part {part}</button>
            ))}
          </div>
          <label className="nx-select on">
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Window">
              {WEEK_OPTIONS.map((value) => <option key={value} value={value}>Last {value} weeks</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <div className="nx-search nx-search-compact">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, organizations, acts, concepts…" aria-label="Search items" />
            {query && <button type="button" className="nx-clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
          </div>
          <label className="nx-select">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort"><option value="relevance">Highest relevance first</option><option value="date">Newest first</option></select>
            <ChevronDown size={13} />
          </label>
          <button type="button" className={`nx-btn ${needsReload ? "primary" : ""}`} onClick={() => refresh(parts, weeks)} disabled={loading}>{loading ? <LoaderCircle className="nx-spin" size={14} /> : <RefreshCw size={14} />} {needsReload ? "Load this window" : "Check now"}</button>
          <button type="button" className="nx-btn icon" onClick={copyLink} aria-label="Copy shareable link" title="Copy a shareable link to this view">{linkCopied ? <Check size={14} /> : <Link2 size={14} />}</button>
          <details ref={rulesPicker} className="nx-pop">
            <summary className="nx-btn"><Info size={14} /> How ranking works</summary>
            <div className="nx-pop-menu nx-gz-rules">
              <div className="nx-pop-head"><b>{profile.name}</b></div>
              <p>{profile.description}</p>
              <p>Points per matched unit: title ×{DEFAULT_CONFIG.location.title}, headings ×{DEFAULT_CONFIG.location.headings}, text ×{DEFAULT_CONFIG.location.body}; repeats count {DEFAULT_CONFIG.repetition.join(" / ")}; weak generic terms are scaled ×{DEFAULT_CONFIG.weakDamping} without device context and ×{DEFAULT_CONFIG.weakContextBoost} with it. Bands: Critical ≥ 80, High ≥ 60, Medium ≥ 35, Low ≥ 15.</p>
              {TOPIC_GROUPS.map((group) => (
                <div key={group}>
                  <h4>{GROUP_LABELS[group]}</h4>
                  <ul>
                    {DEFAULT_CONFIG.concepts.filter((concept) => concept.group === group).map((concept) => {
                      const boost = profile.boosts[concept.id] ?? 1;
                      return <li key={concept.id}><span style={{ color: "inherit" }}>{concept.label}{concept.weak && !(profile.unweaken || []).includes(concept.id) ? " (weak)" : ""}</span><span>{Math.round(concept.weight * boost * 10) / 10}{boost !== 1 ? ` (×${boost})` : ""}</span></li>;
                    })}
                  </ul>
                </div>
              ))}
              <h4>Bonuses when found together</h4>
              <ul>{[...COOCCURRENCE, ...(profile.extraCooccurrence || [])].map((rule) => <li key={rule.id}><span style={{ color: "inherit" }}>{rule.label}</span><span>+{rule.bonus}</span></li>)}</ul>
              <h4>Conservative penalties</h4>
              <ul>{DEFAULT_CONFIG.concepts.filter((concept) => concept.group === "negative").map((concept) => <li key={concept.id}><span style={{ color: "inherit" }}>{concept.label}</span><span>{concept.weight} per unit</span></li>)}</ul>
            </div>
          </details>
        </div>
      </header>

      <div className="nx-gz-fresh" aria-live="polite">
        <span><b>Last checked</b> {formatTime(checkedAt)}</span>
        <span><b>Last successful update</b> {formatTime(updatedAt)}{fromCache ? " (cached on this device)" : ""}</span>
        {stale && <span className="nx-pill stale">older than 36 h</span>}
        {PART_ORDER.filter((part) => loadedParts.includes(part) || statusFor(part)).map((part) => {
          const status = statusFor(part);
          return <span key={part} className={`nx-pill ${statusClass(status)}`} title={status?.message || PART_LABELS[part]}>Part {part} · {status ? `${status.status}${status.issues ? ` · ${status.issues} issue${status.issues === 1 ? "" : "s"}` : ""} · ${status.items} items${status.latestIssueDate ? ` · latest ${status.latestIssueDate}` : ""}` : "cached"}</span>;
        })}
        {loading && <span className="nx-pill"><LoaderCircle className="nx-spin" size={11} /> {progress || "Loading…"}</span>}
        {deepening && <span className="nx-pill"><LoaderCircle className="nx-spin" size={11} /> Reading full text {deepening.done} of {deepening.total} pages</span>}
        <span style={{ marginLeft: "auto" }}>Window since {since} · items published in this window: <b>{inWindow.length.toLocaleString()}</b></span>
      </div>

      {error && <div className="nx-error" role="alert"><CircleAlert size={16} /><div><b>Canada Gazette could not be refreshed</b><span>{error}</span></div><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}

      <div className="nx-gz-summary">
        <span className="nx-query-label">Priority</span>
        {PRIORITIES.map((priority) => (
          <button key={priority} type="button" className={`nx-gz-chip ${priorityFilter.includes(priority) ? "on" : ""}`} aria-pressed={priorityFilter.includes(priority)} onClick={() => togglePriority(priority)}>
            <i style={{ background: PRIORITY_COLORS[priority] }} />{priority} <em>{priorityCounts[priority].toLocaleString()}</em>
          </button>
        ))}
        <span className="nx-query-label" style={{ marginLeft: 8 }}>Topic</span>
        {TOPIC_GROUPS.map((group) => (
          <button key={group} type="button" className={`nx-gz-chip ${topicFilter.includes(group) ? "on" : ""}`} aria-pressed={topicFilter.includes(group)} onClick={() => toggleTopic(group)} disabled={!topicCounts[group]}>
            {GROUP_LABELS[group]} <em>{topicCounts[group].toLocaleString()}</em>
          </button>
        ))}
        <span className="nx-subbar-actions">
          {filtersActive && <button type="button" className="nx-btn small ghost" onClick={showAll}>Show all</button>}
          <span className="nx-subbar-count">{visible.length.toLocaleString()} shown</span>
          <button type="button" className="nx-btn small" onClick={exportExcel} disabled={!visible.length}><ArrowDownToLine size={12} /> Excel</button>
        </span>
      </div>

      <div className="nx-gz-list">
        {!visible.length && !loading && (
          <div className="nx-empty">
            <ScrollText size={30} />
            <h2>{inWindow.length ? "Nothing matches these filters." : "No Gazette items loaded yet."}</h2>
            <p>{inWindow.length ? "Every item stays available — widen the priority or topic filters, or clear the search." : "The page reads the official Canada Gazette pages through the site's relay. Use Check now to try again."}</p>
            <div className="nx-empty-actions">{inWindow.length ? <button type="button" className="nx-btn primary" onClick={showAll}>Show all</button> : <button type="button" className="nx-btn primary" onClick={() => refresh(parts, weeks)}>Check now</button>}</div>
          </div>
        )}
        {visible.map(({ item, rel }) => {
          const open = expanded === item.id;
          const detail = open ? snippet(item.body, rel.matches.flatMap((match) => match.terms)) : null;
          return (
            <article key={item.id} className={`nx-gz-item p-${slug(rel.priority)}`}>
              <div className="nx-gz-rank">
                <span className="nx-gz-priority">{rel.priority}</span>
                <span className="nx-gz-score">{rel.score}<small> /100</small></span>
                <span className="nx-gz-depth">{rel.depth === "full" ? "full text scored" : item.bodyStatus === "unavailable" ? "text unavailable" : "title & headings"}</span>
              </div>
              <div className="nx-gz-main">
                <div className="nx-gz-meta">
                  <span className="nx-gz-part">Part {item.part}{item.extra ? " · Extra edition" : ""}</span>
                  <span>{item.issueDate}</span>
                  <span>{item.section}</span>
                  {item.registration && <span className="nx-mono">{item.registration}{item.registrationDate ? ` · registered ${item.registrationDate}` : ""}</span>}
                </div>
                <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ExternalLink size={11} /></a></h3>
                {(item.organization || item.act || item.enablingActs.length > 0) && <p className="nx-gz-context">{[item.organization, item.act || item.enablingActs.join("; ")].filter(Boolean).join(" · ")}</p>}
                <p className="nx-gz-why"><b>Why ranked here:</b> {rel.reasons.slice(0, 3).join(" · ")}</p>
                <div className="nx-gz-tags">
                  {rel.topics.map((topic) => <span key={topic} className={`nx-gz-topic t-${topic}`}>{GROUP_LABELS[topic]}</span>)}
                  {rel.matches.filter((match) => match.points >= 1).slice(0, 6).map((match) => <span key={match.conceptId} className="nx-gz-concept" title={`${match.terms.join(", ")} · +${match.points}`}>{match.label}</span>)}
                </div>
                <div className="nx-gz-actions">
                  <button type="button" className="nx-linklike" onClick={() => setExpanded(open ? null : item.id)}>{open ? "Hide details" : "Details"}</button>
                  {item.bodyStatus === "none" && item.bodyUrl && <button type="button" className="nx-linklike" onClick={() => loadOne(item)}>Load full text &amp; rescore</button>}
                  <a className="nx-ext" href={item.url} target="_blank" rel="noreferrer">Official source <ExternalLink size={10} /></a>
                  {item.issueUrl !== item.url && <a className="nx-ext" href={item.issueUrl} target="_blank" rel="noreferrer">Issue index <ExternalLink size={10} /></a>}
                  <span className="nx-muted">{item.issueLabel}</span>
                </div>
                {open && (
                  <div className="nx-gz-detail">
                    <table>
                      <thead><tr><th>Concept</th><th>Group</th><th>Where</th><th>Terms</th><th className="nx-num">Points</th></tr></thead>
                      <tbody>
                        {rel.matches.map((match) => (
                          <tr key={match.conceptId}><td>{match.label}{match.damped ? " (damped)" : ""}</td><td>{GROUP_LABELS[match.group]}</td><td>{[match.title > 0 && "title", match.headings > 0 && "headings", match.body > 0 && "text"].filter(Boolean).join(", ")}</td><td>{match.terms.join(", ")}</td><td className="nx-num">+{match.points}</td></tr>
                        ))}
                        {rel.bonuses.map((bonus) => <tr key={bonus.label}><td>{bonus.label}</td><td>Together</td><td>—</td><td>—</td><td className="nx-num">+{bonus.points}</td></tr>)}
                        {rel.penalties.map((penalty) => <tr key={penalty.label}><td>{penalty.label}</td><td>Unrelated topic</td><td>—</td><td>—</td><td className="nx-num">{penalty.points}</td></tr>)}
                        <tr><td colSpan={4}><b>Raw total → score</b></td><td className="nx-num"><b>{rel.raw} → {rel.score}</b></td></tr>
                      </tbody>
                    </table>
                    {detail ? <p className="nx-gz-snippet">{detail.before}{detail.hit && <mark>{detail.hit}</mark>}{detail.after}</p> : <p className="nx-muted">{item.bodyStatus === "unavailable" ? "Full text is not available through the Gazette site for this item (Part III Acts are published by Justice Canada)." : "Full text not loaded yet — scoring used the title and headings."}</p>}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="nx-gz-disclaimer">
        Official Gazette information (part, date, title, organization, registration and links) comes from gazette.gc.ca and is shown as published. Priority, score, topics and explanations are generated by the configurable keyword rules of this app to order reading; they are not a legal or regulatory conclusion, and every item remains listed regardless of rank.
      </footer>
    </NextShell>
  );
}
