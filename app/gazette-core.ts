/*
 * Canada Gazette parsing. Works on the official HTML pages at gazette.gc.ca:
 *
 * - Part I  (notices and proposed regulations): weekly issues, each with an
 *   index page whose items link into section pages (government notices,
 *   commissions, miscellaneous notices, parliament, orders in council) or to
 *   one page per proposed regulation. Extra editions are single pages.
 * - Part II (enacted regulations, SOR/SI): fortnightly issues; the index lists
 *   each instrument with its registration number, registration date and
 *   enabling statutes; each instrument has its own page including the
 *   Regulatory Impact Analysis Statement. Extras link straight to an instrument.
 * - Part III (Acts of Parliament): a yearly table of Acts by publication date.
 *
 * Everything here is pure string processing so it runs in the browser, in
 * the Cloudflare worker and in Node tests alike.
 */

export type GazettePart = "I" | "II" | "III";

export type GazetteIssue = {
  part: GazettePart;
  year: number;
  date: string;
  url: string;
  label: string;
  extra: boolean;
};

export type GazetteItem = {
  id: string;
  part: GazettePart;
  extra: boolean;
  issueDate: string;
  issueLabel: string;
  issueUrl: string;
  title: string;
  section: string;
  organization: string;
  act: string;
  enablingActs: string[];
  registration?: string;
  registrationDate?: string;
  url: string;
  bodyUrl?: string;
  anchor?: string;
  body?: string;
  bodyStatus: "none" | "loaded" | "unavailable";
};

export const GAZETTE_ORIGIN = "https://gazette.gc.ca";
export const GAZETTE_HOSTS = ["gazette.gc.ca", "www.gazette.gc.ca", "canadagazette.gc.ca", "www.canadagazette.gc.ca"];
export const PART_LABELS: Record<GazettePart, string> = {
  I: "Part I · Notices and proposed regulations",
  II: "Part II · Enacted regulations",
  III: "Part III · Acts of Parliament",
};

export function isGazetteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GAZETTE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/** Same-origin proxy path used by the browser (the Gazette site refuses cross-origin requests). */
export function proxyUrl(target: string) {
  return `/api/gazette/source?url=${encodeURIComponent(target)}`;
}

export function yearIndexUrl(part: GazettePart, year: number) {
  return `${GAZETTE_ORIGIN}/rp-pr/p${part === "I" ? 1 : part === "II" ? 2 : 3}/${year}/index-eng.html`;
}

export function absoluteUrl(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                         */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û",
  icirc: "î", iuml: "ï", uuml: "ü", ouml: "ö", auml: "ä", Eacute: "É", copy: "©", reg: "®", trade: "™", deg: "°", sect: "§", para: "¶", times: "×",
};

export function decodeEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

export function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

export function cleanText(html: string) {
  return decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
}

/** Readable plain text: block elements become line breaks, everything else is flattened. */
export function htmlToText(html: string) {
  const withoutNoise = html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<span class="wb-inv">[\s\S]*?<\/span>/gi, " ")
    .replace(/<sup[^>]*class="[^"]*fn[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, " ");
  const blocks = withoutNoise.replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|dl|dd|dt|caption|section|article|br)\s*>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return decodeEntities(stripTags(blocks))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function mainContent(html: string) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const content = html.match(/<div id="content"[^>]*>([\s\S]*)/i);
  return content ? content[1] : html;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "August 29, 2026" → "2026-08-29" */
export function parseLongDate(text: string) {
  const match = decodeEntities(text).match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return "";
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return "";
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

/** "17/08/26" (day/month/year) → "2026-08-17" */
export function parseShortDate(text: string) {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function dateFromPath(path: string) {
  const match = path.match(/(\d{4}-\d{2}-\d{2})(?:-x\d+)?\//);
  return match ? match[1] : "";
}

/* ------------------------------------------------------------------ */
/* Year indexes                                                         */
/* ------------------------------------------------------------------ */

export function parseYearIndex(html: string, part: GazettePart, year: number): GazetteIssue[] {
  const issues = new Map<string, GazetteIssue>();
  const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html))) {
    const href = match[1];
    const partSegment = part === "I" ? "p1" : part === "II" ? "p2" : "p3";
    if (!href.includes(`/rp-pr/${partSegment}/${year}/`)) continue;
    const date = dateFromPath(href);
    if (!date) continue;
    const extra = /-x\d+\//.test(href);
    const isIndex = /\/html\/index-eng\.html$/.test(href);
    const isExtraPage = extra && /\/html\/[^/]+-eng\.html$/.test(href);
    if (!isIndex && !isExtraPage) continue;
    const url = absoluteUrl(href, GAZETTE_ORIGIN);
    if (issues.has(url)) continue;
    const text = cleanText(match[2]);
    issues.set(url, { part, year, date, url, label: text || `${date}${extra ? " (extra)" : ""}`, extra });
  }
  return [...issues.values()].sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
}

/* ------------------------------------------------------------------ */
/* Part I                                                               */
/* ------------------------------------------------------------------ */

type Token = { kind: "h2" | "h3" | "h4" | "item"; text: string; href?: string };

function tokenizePartIIndex(html: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<(h2|h3|h4)[^>]*>([\s\S]*?)<\/\1>|<li[^>]*>\s*<a\s+[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[1]) {
      tokens.push({ kind: match[1].toLowerCase() as "h2" | "h3" | "h4", text: cleanText(match[2]) });
    } else {
      tokens.push({ kind: "item", text: cleanText(match[4]), href: match[3] });
    }
  }
  return tokens;
}

function issueMeta(html: string, fallback: GazetteIssue) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const label = heading ? cleanText(heading[1]).replace(/:\s*(Index|Extra)\s*$/i, "") : fallback.label;
  const dateLine = html.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  const date = (dateLine && parseLongDate(dateLine[1])) || fallback.date;
  return { label, date };
}

export function parsePartIIndex(html: string, issue: GazetteIssue): GazetteItem[] {
  const main = mainContent(html);
  const meta = issueMeta(main, issue);
  const items: GazetteItem[] = [];
  let section = "";
  let organization = "";
  let act = "";
  tokenizePartIIndex(main).forEach((token) => {
    if (token.kind === "h2") {
      section = token.text;
      organization = "";
      act = "";
      return;
    }
    if (token.kind === "h3") {
      organization = token.text;
      act = "";
      return;
    }
    if (token.kind === "h4") {
      act = token.text;
      return;
    }
    if (!token.href || !token.text || /footnote/i.test(section)) return;
    const url = absoluteUrl(token.href, issue.url);
    const [bodyUrl, anchor] = url.split("#");
    items.push({
      id: `I:${meta.date}:${anchor || bodyUrl.split("/").pop() || items.length}`,
      part: "I",
      extra: false,
      issueDate: meta.date,
      issueLabel: meta.label,
      issueUrl: issue.url,
      title: token.text.replace(/\s*\*+$/, ""),
      section,
      organization,
      act,
      enablingActs: act ? [act] : [],
      url,
      bodyUrl,
      anchor: anchor || undefined,
      bodyStatus: "none",
    });
  });
  return items;
}

export function parsePartIExtra(html: string, issue: GazetteIssue): GazetteItem[] {
  const main = mainContent(html);
  const meta = issueMeta(main, issue);
  const chunks = main.split(/(?=<h2[^>]*\sid="[^"]+"[^>]*>)/i).filter((chunk) => /<h2[^>]*\sid="/i.test(chunk));
  const pieces = chunks.length ? chunks : [main];
  return pieces.map((chunk, index) => {
    const id = chunk.match(/<h2[^>]*\sid="([^"]+)"/i)?.[1];
    const organization = cleanText(chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "");
    const act = cleanText(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
    const heading = cleanText(chunk.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || "");
    const title = heading || act || organization || meta.label;
    const body = htmlToText(chunk);
    return {
      id: `I:${meta.date}:extra:${id || index}`,
      part: "I" as const,
      extra: true,
      issueDate: meta.date,
      issueLabel: meta.label,
      issueUrl: issue.url,
      title,
      section: "Extra edition",
      organization,
      act,
      enablingActs: act ? [act] : [],
      url: id ? `${issue.url}#${id}` : issue.url,
      bodyUrl: issue.url,
      anchor: id,
      body,
      bodyStatus: "loaded" as const,
    };
  });
}

/** Text of each anchored notice on a Part I section page, keyed by anchor id; "" holds the whole page. */
export function extractSectionBodies(html: string) {
  const main = mainContent(html);
  const bodies = new Map<string, string>();
  bodies.set("", htmlToText(main));
  const pattern = /<h2[^>]*\sid="([^"]+)"[^>]*>/gi;
  const anchors: { id: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(main))) anchors.push({ id: match[1], index: match.index });
  anchors.forEach((anchor, position) => {
    const end = position + 1 < anchors.length ? anchors[position + 1].index : main.length;
    bodies.set(anchor.id, htmlToText(main.slice(anchor.index, end)));
  });
  return bodies;
}

export function extractPageText(html: string) {
  return htmlToText(mainContent(html));
}

/* ------------------------------------------------------------------ */
/* Part II                                                              */
/* ------------------------------------------------------------------ */

/** Index titles are inverted ("Subject — Regulations Amending the"); restore reading order. */
export function normalizeInstrumentTitle(raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  const split = text.split(/\s[—–]\s/);
  if (split.length !== 2) return text;
  const [subject, instrument] = split.map((part) => part.trim());
  if (/\b(the|certain|to|of|under|amending|regulations|order)$/i.test(instrument) || /^(Regulations|Order|Rules|Proclamation|Directive|Notice)\b/i.test(instrument)) {
    return `${instrument} ${subject}`.replace(/\s+/g, " ");
  }
  return text;
}

export function parsePartIIIndex(html: string, issue: GazetteIssue): GazetteItem[] {
  const main = mainContent(html);
  const meta = issueMeta(main, issue);
  const items: GazetteItem[] = [];
  const pattern = /<li[^>]*>\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(main))) {
    const href = match[1];
    if (/^#/.test(href)) continue;
    const lines = match[2].split(/<br\s*\/?>/i).map((line) => cleanText(line)).filter(Boolean);
    if (!lines.length) continue;
    const title = normalizeInstrumentTitle(lines[0]);
    const enablingActs = lines.slice(1);
    const trailing = cleanText(match[3]);
    const registration = trailing.match(/\b(SOR|SI)\/\d{4}-\d+\b/)?.[0] || "";
    const registrationDate = parseShortDate(trailing);
    const url = absoluteUrl(href, issue.url);
    const kind = registration.startsWith("SI") || /si-tr/i.test(href) ? "Statutory instruments (SI)" : "Regulations (SOR)";
    items.push({
      id: `II:${meta.date}:${registration || href}`,
      part: "II",
      extra: false,
      issueDate: meta.date,
      issueLabel: meta.label,
      issueUrl: issue.url,
      title,
      section: kind,
      organization: "",
      act: enablingActs.join("; "),
      enablingActs,
      registration: registration || undefined,
      registrationDate: registrationDate || undefined,
      url,
      bodyUrl: url,
      bodyStatus: "none",
    });
  }
  return items;
}

/** A Part II extra edition is a single instrument page. */
export function parsePartIIInstrumentPage(html: string, issue: GazetteIssue): GazetteItem {
  const main = mainContent(html);
  const heading = cleanText(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || issue.label);
  const registration = heading.match(/\b(SOR|SI)\/\d{4}-\d+\b/)?.[0] || "";
  const title = heading.replace(/:\s*(SOR|SI)\/\d{4}-\d+\s*$/i, "").trim();
  const text = htmlToText(main);
  const registrationDate = parseLongDate(text.match(/Registration\s+(?:SOR|SI)\/\d{4}-\d+\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/)?.[1] || "");
  const enablingActs = [...text.matchAll(/^([A-Z][A-Z0-9 ,'’-]{6,}(?:ACT|CODE|TARIFF)(?:, \d{4})?)$/gm)].map((entry) => entry[1].trim()).slice(0, 4);
  return {
    id: `II:${issue.date}:${registration || "extra"}`,
    part: "II",
    extra: true,
    issueDate: issue.date,
    issueLabel: issue.label,
    issueUrl: issue.url,
    title,
    section: registration.startsWith("SI") ? "Statutory instruments (SI) · extra" : "Regulations (SOR) · extra",
    organization: "",
    act: enablingActs.join("; "),
    enablingActs,
    registration: registration || undefined,
    registrationDate: registrationDate || undefined,
    url: issue.url,
    bodyUrl: issue.url,
    body: text,
    bodyStatus: "loaded",
  };
}

/* ------------------------------------------------------------------ */
/* Part III                                                             */
/* ------------------------------------------------------------------ */

export function parsePartIIIYear(html: string, year: number): GazetteItem[] {
  const main = mainContent(html);
  const volume = cleanText(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || `Part III ${year}`);
  const items: GazetteItem[] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowPattern.exec(main))) {
    const cells = row[1];
    const date = cells.match(/data-order="(\d{4}-\d{2}-\d{2})"/)?.[1] || parseLongDate(cleanText(cells.match(/<td[^>]*>([\s\S]*?)<\/td>/i)?.[1] || ""));
    if (!date) continue;
    const pdf = cells.match(/<a\s+[^>]*href="([^"]+\.pdf)"/i)?.[1];
    const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let link: RegExpExecArray | null;
    while ((link = linkPattern.exec(cells))) {
      if (/\.pdf$/i.test(link[1])) continue;
      const title = cleanText(link[2]);
      if (!title) continue;
      const chapter = title.match(/\(S\.C\.\s*\d{4},\s*c\.\s*\d+\)/)?.[0] || "";
      items.push({
        id: `III:${date}:${chapter || title.slice(0, 40)}`,
        part: "III",
        extra: false,
        issueDate: date,
        issueLabel: volume,
        issueUrl: pdf ? absoluteUrl(pdf, GAZETTE_ORIGIN) : yearIndexUrl("III", year),
        title,
        section: "Acts of Parliament",
        organization: "Parliament of Canada",
        act: chapter,
        enablingActs: [],
        url: absoluteUrl(link[1], GAZETTE_ORIGIN),
        bodyStatus: "unavailable",
      });
    }
  }
  return items.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

/** Text used for scoring: headings gather the structural context FDA-style readers scan first. */
export function itemHeadings(item: GazetteItem) {
  return [item.section, item.organization, item.act, ...item.enablingActs.filter((act) => act !== item.act), item.registration || ""].filter(Boolean).join(" · ");
}
