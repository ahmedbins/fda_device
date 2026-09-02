/*
 * Deterministic relevance scoring for Canada Gazette items.
 *
 * Terms are grouped into weighted concepts; matches in the title count more
 * than matches in headings, which count more than body text; repeats are
 * capped with diminishing returns; related concepts occurring together earn
 * bonuses; weak generic terms (software, battery, fee…) are damped unless a
 * medical-device context is present; clearly unrelated topics carry a small,
 * conservative penalty. The result is a 0–100 score with a priority band and
 * a plain-language explanation. Nothing here is a legal or regulatory
 * conclusion — it only orders reading.
 */

export type ConceptGroup = "device" | "lifecycle" | "technology" | "broader" | "organization" | "hearing" | "helper" | "negative";

export const GROUP_LABELS: Record<ConceptGroup, string> = {
  device: "Medical device regulation",
  lifecycle: "Regulatory lifecycle",
  technology: "Technology",
  broader: "Broader regulation",
  organization: "Organizations",
  hearing: "Hearing & audiology",
  helper: "Context",
  negative: "Unrelated topic",
};

/** Groups shown as filterable topics (helpers and negatives are internal). */
export const TOPIC_GROUPS: ConceptGroup[] = ["device", "lifecycle", "technology", "broader", "organization", "hearing"];

export type Term = string | { phrase: string; weight?: number };
export type Concept = {
  id: string;
  label: string;
  group: ConceptGroup;
  /** Points per matched unit (title = 3 units, heading = 2, body = 1, repeats diminishing). */
  weight: number;
  /** Maximum matched units credited to this concept. */
  cap?: number;
  /** Generic terms that only matter alongside device/regulatory context. */
  weak?: boolean;
  terms: Term[];
};
export type Cooccurrence = { id: string; label: string; concepts: string[]; bonus: number };
export type Priority = "Critical" | "High" | "Medium" | "Low" | "Very Low";
export const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low", "Very Low"];

export type ScoringConfig = {
  concepts: Concept[];
  cooccurrence: Cooccurrence[];
  location: { title: number; headings: number; body: number };
  /** Credit for the 1st, 2nd, 3rd… occurrence of a term in one location. */
  repetition: number[];
  weakDamping: number;
  weakContextBoost: number;
  /** Groups whose presence counts as "device context" for weak terms. */
  contextGroups: ConceptGroup[];
  /** A context concept must reach this many units (a title/heading mention, or two in the text). */
  contextMinUnits: number;
  /** Body text contributes at most this many units per concept, so long texts cannot outrank a title. */
  bodyUnitCap: number;
  /** Concepts found only in the text (never in title/headings) are scaled by this without device context. */
  bodyOnlyDamping: number;
  /** Saturation constant: score = 100 · (1 − e^(−raw / curve)). */
  curve: number;
  bands: { priority: Priority; min: number }[];
  bodyCharLimit: number;
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  /** Multiplier applied to a concept's weight (inherits everything else). */
  boosts: Record<string, number>;
  /** Concepts that count as real signal for this profile even without device context. */
  unweaken?: string[];
  extraConcepts?: Concept[];
  extraCooccurrence?: Cooccurrence[];
};

const c = (id: string, label: string, group: ConceptGroup, weight: number, terms: Term[], extra: Partial<Concept> = {}): Concept => ({ id, label, group, weight, terms, ...extra });

export const CONCEPTS: Concept[] = [
  /* ---- Direct medical-device regulation ---- */
  c("mdr", "Medical Devices Regulations", "device", 12, ["Medical Devices Regulations", "Medical Device Regulations", "SOR/98-282"], { cap: 4 }),
  c("fda-act", "Food and Drugs Act", "device", 5, ["Food and Drugs Act", "Food and Drug Act"], { cap: 3 }),
  c("medical-device", "Medical device", "device", 7, ["medical device", "medical devices", "in vitro diagnostic device", "IVDD"]),
  c("mdl", "Medical device licence (MDL)", "device", 6, ["medical device licence", "medical device license", "device licence", "MDL"]),
  c("mdel", "Establishment licence (MDEL)", "device", 6, ["medical device establishment licence", "medical device establishment license", "medical device establishment licences", "MDEL"]),
  c("classification", "Device classification", "device", 4, ["device classification", "classification rules", "risk classification", "Class II medical device", "Class III medical device", "Class IV medical device", "Class II device", "Class III device", "Class IV device", "Class II devices", "Class III devices", "Class IV devices"]),
  c("significant-change", "Significant change", "device", 5, ["significant change", "significant changes"], { weak: true }),

  /* ---- Regulatory lifecycle ---- */
  c("licensing", "Licensing", "lifecycle", 3, ["licensing", "licence application", "license application", "licence amendment", "licence renewal", "market authorization", "market authorisation"], { weak: true }),
  c("labelling", "Labelling", "lifecycle", 3, ["labelling", "labeling", "label requirements", "instructions for use", "IFU"]),
  c("qms", "Quality management (ISO 13485 / MDSAP)", "lifecycle", 4, ["quality management system", "quality system", "ISO 13485", "MDSAP", "Medical Device Single Audit Program", "QMS"]),
  c("safety-effectiveness", "Safety and effectiveness", "lifecycle", 3, ["safety and effectiveness", "safety, effectiveness", "safety and efficacy", "safety requirements"]),
  c("clinical", "Clinical evidence", "lifecycle", 3, ["clinical evidence", "clinical data", "clinical trial", "clinical trials", "clinical investigation", "clinical study"]),
  c("investigational", "Investigational testing", "lifecycle", 4, ["investigational testing", "investigational device", "investigational testing authorization"]),
  c("special-access", "Special access", "lifecycle", 4, ["special access", "Special Access Programme", "Special Access Program", "custom-made device", "custom made device"]),
  c("post-market", "Post-market surveillance", "lifecycle", 4, ["post-market surveillance", "post market surveillance", "postmarket surveillance", "post-market", "vigilance", "summary report"]),
  c("incident", "Incident reporting", "lifecycle", 4, ["incident reporting", "mandatory problem reporting", "problem reporting", "adverse event", "adverse events", "medical device incident", "serious incident"]),
  c("complaints", "Complaints", "lifecycle", 2, ["complaint handling", "complaints", "complaint"]),
  c("recall", "Recalls", "lifecycle", 4, ["recall", "recalls", "recalled", "field safety corrective action"]),
  c("shortage", "Shortages", "lifecycle", 3, ["shortage", "shortages", "supply disruption", "discontinuation"]),
  c("capa", "Corrective action", "lifecycle", 3, ["corrective action", "corrective and preventive action", "CAPA", "corrective measures"]),

  /* ---- Technology ---- */
  c("samd", "Software as a medical device", "technology", 6, ["software as a medical device", "SaMD", "medical device software", "device software"]),
  c("software", "Software / firmware", "technology", 2, ["software", "firmware", "software update", "software updates"], { weak: true }),
  c("cyber", "Cybersecurity", "technology", 3, ["cybersecurity", "cyber security", "cyber-security", "vulnerability", "vulnerabilities", "malware"]),
  c("ai", "AI / machine learning", "technology", 3, ["artificial intelligence", "machine learning", "machine-learning", "AI"], { weak: true }),
  c("mlmd", "Machine learning-enabled device", "technology", 6, ["machine learning-enabled medical device", "machine learning enabled medical device", "MLMD", "predetermined change control plan", "PCCP"]),
  c("privacy", "Privacy / data security", "technology", 2, ["privacy", "personal information", "data security", "data protection", "PIPEDA"], { weak: true }),
  c("wireless", "Wireless / Bluetooth / RF", "technology", 2, ["wireless", "Bluetooth", "radio frequency", "radiofrequency", "RF", "radio apparatus", "radiocommunication", "spectrum"], { weak: true }),
  c("emc", "EMC / electrical safety", "technology", 3, ["electromagnetic compatibility", "EMC", "electrical safety", "IEC 60601", "interference-causing equipment", "ICES-"]),
  c("battery", "Batteries / lithium-ion", "technology", 2, ["battery", "batteries", "lithium-ion", "lithium ion", "lithium battery", "rechargeable", "charging"], { weak: true }),
  c("sterile", "Sterilization / biocompatibility", "technology", 4, ["sterilization", "sterilisation", "sterile", "biocompatibility", "ISO 10993", "ethylene oxide"]),

  /* ---- Broader regulation that can touch a device business ---- */
  c("accessibility", "Accessibility", "broader", 2, ["accessibility", "Accessible Canada Act", "Accessible Canada Regulations", "accessible", "persons with disabilities", "disability", "disabilities"], { weak: true }),
  c("trade", "Import / export", "broader", 2, ["import", "imports", "importation", "export", "exports", "exportation", "customs", "tariff", "Customs Tariff"], { weak: true }),
  c("transport", "Transportation / dangerous goods", "broader", 2, ["dangerous goods", "Transportation of Dangerous Goods", "TDG", "hazardous materials", "shipping"], { weak: true }),
  c("environment", "Environmental / chemical restrictions", "broader", 2, ["Canadian Environmental Protection Act", "CEPA", "toxic substances", "chemicals management", "Chemicals Management Plan", "PFAS", "plastics", "hazardous waste", "restricted substances", "RoHS"], { weak: true }),
  c("advertising", "Advertising / claims", "broader", 2, ["advertising", "advertisement", "advertisements", "health claims", "misleading", "marketing authorization"], { weak: true }),
  c("fees", "Fees", "broader", 2, ["fee", "fees", "Fees in Respect of", "cost recovery", "user fees", "Service Fees Act"], { weak: true }),

  /* ---- Organizations ---- */
  c("health-canada", "Health Canada", "organization", 5, ["Health Canada", "Department of Health", "Health, Dept. of", "Dept. of Health", "Minister of Health", "Public Health Agency of Canada"], { cap: 3 }),
  c("mdd", "Medical Devices Directorate", "organization", 8, ["Medical Devices Directorate", "Medical Devices Bureau"], { cap: 3 }),
  c("hpfb", "HPFB", "organization", 5, ["Health Products and Food Branch", "HPFB", "Therapeutic Products Directorate"], { cap: 3 }),
  c("ised", "ISED", "organization", 4, ["Innovation, Science and Economic Development", "Industry, Dept. of", "Department of Industry", "ISED", "Radiocommunication Act", "Radio Standards Specification", "RSS-"], { cap: 2 }),
  c("spectrum", "Spectrum management", "organization", 3, ["Spectrum Management", "spectrum licence", "licence-exempt", "Radio Equipment"], { cap: 2 }),
  c("other-dept", "Other departments (ECCC, Transport, CBSA)", "organization", 1, ["Environment and Climate Change Canada", "Environment, Dept. of the", "Transport Canada", "Transport, Dept. of", "Canada Border Services Agency", "CBSA"], { weak: true, cap: 2 }),

  /* ---- Hearing / audiology (base weights; the hearing profile boosts these) ---- */
  c("hearing-aid", "Hearing aid", "hearing", 4, ["hearing aid", "hearing aids", "hearing instrument", "hearing instruments", "hearing device", "hearing devices", "cochlear implant", "cochlear implants", "bone conduction"]),
  c("audiology", "Audiology / audiometer", "hearing", 3, ["audiology", "audiologist", "audiologists", "audiometer", "audiometers", "audiometric", "audiometry"]),
  c("hearing-loss", "Hearing loss", "hearing", 2, ["hearing loss", "hearing impairment", "hearing impaired", "hard of hearing", "deaf", "deafness", "hearing health"]),
  c("assistive-listening", "Assistive listening", "hearing", 2, ["assistive listening", "assistive device", "assistive devices", "assistive technology", "assistive technologies"]),
  c("acoustic", "Acoustic / electroacoustic", "hearing", 1, ["acoustic", "electroacoustic", "electro-acoustic", "sound level", "sound levels", "noise exposure", "decibel"], { weak: true }),
  c("hac", "Hearing aid compatibility (HAC)", "hearing", 3, ["hearing aid compatibility", "hearing aid compatible", "RSS-HAC", "HAC"]),

  /* ---- Helper context (low weight, used mostly for co-occurrence) ---- */
  c("amendment", "Amendment", "helper", 1, ["amending", "amendment", "amendments", "amend", "amended"], { cap: 2 }),
  c("regulation", "Regulation / order", "helper", 1, ["regulations", "regulation", "regulatory", "order", "orders", "proposed"], { cap: 2, weak: true }),
  c("health-product", "Health product / drug", "helper", 2, ["Food and Drug Regulations", "Natural Health Products Regulations", "health product", "health products", "therapeutic product", "therapeutic products", "drug", "drugs", "natural health product", "pharmaceutical"], { cap: 3 }),

  /* ---- Conservative negatives for clearly unrelated topics ---- */
  c("neg-fisheries", "Fisheries / oceans", "negative", -3, ["fisheries", "fishery", "fishing", "aquaculture", "Fisheries Act"], { cap: 2 }),
  c("neg-agri", "Agriculture / marketing quotas", "negative", -3, ["agricultural", "agriculture", "marketing quota", "Farm Products", "poultry", "turkey", "dairy", "grain", "livestock"], { cap: 2 }),
  c("neg-elections", "Elections / parliament housekeeping", "negative", -3, ["Canada Elections Act", "electoral district", "electors", "by-election", "by-elections", "private bills"], { cap: 2 }),
  c("neg-hr", "Personnel notices", "negative", -3, ["Permission granted", "Permission and leave granted", "Public Service Employment Act", "appointment opportunities"], { cap: 2 }),
  c("neg-sanctions", "Sanctions / economic measures", "negative", -2, ["Special Economic Measures", "sanctions", "United Nations Act"], { cap: 2 }),
  c("neg-energy", "Energy / utilities", "negative", -2, ["export electricity", "electricity", "pipeline", "hydro", "water-power", "oil and gas", "petroleum"], { cap: 2 }),
];

export const COOCCURRENCE: Cooccurrence[] = [
  { id: "mdr-amend", label: "Medical Devices Regulations + amendment", concepts: ["mdr", "amendment"], bonus: 8 },
  { id: "fda-device", label: "Food and Drugs Act + medical device", concepts: ["fda-act", "medical-device"], bonus: 5 },
  { id: "fda-mdr", label: "Food and Drugs Act + Medical Devices Regulations", concepts: ["fda-act", "mdr"], bonus: 5 },
  { id: "fda-amend", label: "Food and Drugs Act + amendment", concepts: ["fda-act", "amendment"], bonus: 4 },
  { id: "device-cyber", label: "Medical device + cybersecurity", concepts: ["medical-device", "cyber"], bonus: 5 },
  { id: "device-recall", label: "Medical device + recall", concepts: ["medical-device", "recall"], bonus: 5 },
  { id: "device-software", label: "Medical device + software", concepts: ["medical-device", "software"], bonus: 4 },
  { id: "samd-ai", label: "Software as a medical device + AI", concepts: ["samd", "ai"], bonus: 3 },
  { id: "hc-lifecycle", label: "Health Canada + licensing/post-market", concepts: ["health-canada", "licensing"], bonus: 3 },
  { id: "hc-recall", label: "Health Canada + recall", concepts: ["health-canada", "recall"], bonus: 3 },
  { id: "hc-shortage", label: "Health Canada + shortage", concepts: ["health-canada", "shortage"], bonus: 3 },
  { id: "hearing-wireless", label: "Hearing aid + Bluetooth/wireless", concepts: ["hearing-aid", "wireless"], bonus: 4 },
  { id: "ised-hac", label: "ISED + hearing aid compatibility", concepts: ["ised", "hac"], bonus: 5 },
  { id: "hearing-access", label: "Hearing + accessibility", concepts: ["hearing-loss", "accessibility"], bonus: 3 },
];

export const DEFAULT_CONFIG: ScoringConfig = {
  concepts: CONCEPTS,
  cooccurrence: COOCCURRENCE,
  location: { title: 3, headings: 2, body: 1 },
  repetition: [1, 0.5, 0.25],
  weakDamping: 0.35,
  weakContextBoost: 1.4,
  contextGroups: ["device", "hearing"],
  contextMinUnits: 2,
  bodyUnitCap: 2,
  bodyOnlyDamping: 0.5,
  curve: 30,
  bands: [
    { priority: "Critical", min: 80 },
    { priority: "High", min: 60 },
    { priority: "Medium", min: 35 },
    { priority: "Low", min: 15 },
    { priority: "Very Low", min: 0 },
  ],
  bodyCharLimit: 20000,
};

export const PROFILES: Profile[] = [
  {
    id: "general",
    name: "General Medical Devices",
    description: "Anything that changes how medical devices are licensed, made, labelled, sold, monitored or recalled in Canada.",
    boosts: {},
  },
  {
    id: "hearing",
    name: "Hearing Aids / Audiology",
    description: "Everything in General Medical Devices, plus hearing aids, audiology, hearing-aid compatibility, wireless/RF, batteries and accessibility.",
    boosts: {
      "hearing-aid": 2.5, audiology: 2.2, "hearing-loss": 2.2, "assistive-listening": 2.2, acoustic: 2, hac: 2.8,
      wireless: 2.2, battery: 2, accessibility: 2.2, emc: 1.5, ised: 1.5, spectrum: 1.6,
    },
    unweaken: ["accessibility", "wireless"],
    extraCooccurrence: [
      { id: "hearing-battery", label: "Hearing aid + batteries/charging", concepts: ["hearing-aid", "battery"], bonus: 4 },
      { id: "hearing-device", label: "Hearing aid + medical device regulation", concepts: ["hearing-aid", "medical-device"], bonus: 4 },
    ],
  },
];

export function profileById(id: string | null | undefined) {
  return PROFILES.find((profile) => profile.id === id) || PROFILES[0];
}

export type MatchDetail = {
  conceptId: string;
  label: string;
  group: ConceptGroup;
  points: number;
  units: number;
  title: number;
  headings: number;
  body: number;
  terms: string[];
  damped?: boolean;
};

export type Relevance = {
  score: number;
  priority: Priority;
  raw: number;
  matches: MatchDetail[];
  bonuses: { label: string; points: number }[];
  penalties: { label: string; points: number }[];
  topics: ConceptGroup[];
  reasons: string[];
  depth: "title" | "full";
};

export type ScoreInput = { title: string; headings?: string; body?: string; depth?: "title" | "full" };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function termPattern(phrase: string) {
  const acronym = /^[A-Z0-9/-]{2,6}$/.test(phrase) && phrase === phrase.toUpperCase() && /[A-Z]/.test(phrase);
  const words = phrase.trim().split(/\s+/).map(escapeRegExp);
  const joined = words.join("[\\s\\u00a0-]+");
  const body = phrase.endsWith("-") ? joined : `${joined}(?:e?s)?`;
  const lead = /^[A-Za-z0-9]/.test(phrase) ? "(?<![A-Za-z0-9])" : "";
  const tail = /[A-Za-z0-9]$/.test(phrase) ? "(?![A-Za-z0-9])" : "";
  return new RegExp(`${lead}${body}${tail}`, acronym ? "g" : "gi");
}

const patternCache = new Map<string, RegExp>();
function pattern(phrase: string) {
  let regex = patternCache.get(phrase);
  if (!regex) {
    regex = termPattern(phrase);
    patternCache.set(phrase, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

/** Counts matches and blanks them out, so a span credited to one phrase is never credited to a shorter one. */
function consumeMatches(text: string, phrase: string, limit = 12): { count: number; text: string } {
  if (!text) return { count: 0, text };
  const regex = pattern(phrase);
  let count = 0;
  const consumed = text.replace(regex, (found) => {
    if (count >= limit) return found;
    count += 1;
    return " ".repeat(found.length);
  });
  regex.lastIndex = 0;
  return { count, text: count ? consumed : text };
}

const longestTerm = (concept: Concept) => Math.max(...concept.terms.map((term) => (typeof term === "string" ? term : term.phrase).length));

function repeated(count: number, repetition: number[]) {
  let total = 0;
  for (let index = 0; index < count && index < repetition.length; index += 1) total += repetition[index];
  return total;
}

export function priorityFor(score: number, config: ScoringConfig = DEFAULT_CONFIG): Priority {
  return (config.bands.find((band) => score >= band.min) || config.bands[config.bands.length - 1]).priority;
}

export function scoreText(input: ScoreInput, profile: Profile = PROFILES[0], config: ScoringConfig = DEFAULT_CONFIG): Relevance {
  const title = input.title || "";
  const headings = input.headings || "";
  const body = (input.body || "").slice(0, config.bodyCharLimit);
  const lifted = new Set(profile.unweaken || []);
  const concepts = [...config.concepts, ...(profile.extraConcepts || [])].map((concept) => (lifted.has(concept.id) ? { ...concept, weak: false } : concept));
  const cooccurrence = [...config.cooccurrence, ...(profile.extraCooccurrence || [])];

  type Hit = { concept: Concept; units: number; title: number; headings: number; body: number; terms: string[] };
  const hits = new Map<string, Hit>();
  // Longest phrases claim their text first, so "Medical Devices Regulations" is not also "medical device".
  const ordered = [...concepts].sort((a, b) => longestTerm(b) - longestTerm(a));
  const working = { title, headings, body };
  ordered.forEach((concept) => {
    let titleUnits = 0;
    let headingUnits = 0;
    let bodyUnits = 0;
    const terms: string[] = [];
    const conceptTerms = [...concept.terms].sort((a, b) => (typeof b === "string" ? b : b.phrase).length - (typeof a === "string" ? a : a.phrase).length);
    conceptTerms.forEach((term) => {
      const phrase = typeof term === "string" ? term : term.phrase;
      const weight = typeof term === "string" ? 1 : term.weight ?? 1;
      const titleHit = consumeMatches(working.title, phrase);
      const headingHit = consumeMatches(working.headings, phrase);
      const bodyHit = consumeMatches(working.body, phrase);
      working.title = titleHit.text;
      working.headings = headingHit.text;
      working.body = bodyHit.text;
      const inTitle = titleHit.count;
      const inHeadings = headingHit.count;
      const inBody = bodyHit.count;
      if (inTitle + inHeadings + inBody === 0) return;
      terms.push(phrase);
      titleUnits += weight * repeated(inTitle, config.repetition) * config.location.title;
      headingUnits += weight * repeated(inHeadings, config.repetition) * config.location.headings;
      bodyUnits += weight * repeated(inBody, config.repetition) * config.location.body;
    });
    const cappedBody = Math.min(bodyUnits, config.bodyUnitCap);
    const units = Math.min(titleUnits + headingUnits + cappedBody, concept.cap ?? 5);
    if (units > 0) hits.set(concept.id, { concept, units, title: titleUnits, headings: headingUnits, body: cappedBody, terms });
  });

  const contextPresent = [...hits.values()].some((hit) => !hit.concept.weak && hit.concept.weight > 0 && config.contextGroups.includes(hit.concept.group) && hit.units >= config.contextMinUnits);
  const matches: MatchDetail[] = [];
  const penalties: { label: string; points: number }[] = [];
  let raw = 0;
  hits.forEach((hit) => {
    const boost = profile.boosts[hit.concept.id] ?? 1;
    let points = hit.concept.weight * boost * hit.units;
    let damped = false;
    if (hit.concept.weak && hit.concept.weight > 0) {
      points *= contextPresent ? config.weakContextBoost : config.weakDamping;
      damped = !contextPresent;
    } else if (hit.concept.weight > 0 && hit.title + hit.headings === 0 && !contextPresent) {
      points *= config.bodyOnlyDamping;
    }
    points = Math.round(points * 10) / 10;
    if (points < 0) {
      penalties.push({ label: hit.concept.label, points });
      raw += points;
      return;
    }
    raw += points;
    matches.push({ conceptId: hit.concept.id, label: hit.concept.label, group: hit.concept.group, points, units: hit.units, title: hit.title, headings: hit.headings, body: hit.body, terms: hit.terms, damped });
  });

  const bonuses: { label: string; points: number }[] = [];
  cooccurrence.forEach((rule) => {
    if (rule.concepts.every((id) => (hits.get(id)?.units ?? 0) >= 1)) {
      bonuses.push({ label: rule.label, points: rule.bonus });
      raw += rule.bonus;
    }
  });

  raw = Math.max(0, Math.round(raw * 10) / 10);
  const score = Math.round(100 * (1 - Math.exp(-raw / config.curve)));
  const priority = priorityFor(score, config);
  matches.sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));

  const topicPoints = new Map<ConceptGroup, number>();
  matches.forEach((match) => {
    if (!TOPIC_GROUPS.includes(match.group) || match.points < 1) return;
    topicPoints.set(match.group, (topicPoints.get(match.group) || 0) + match.points);
  });
  const topics = [...topicPoints.entries()].sort((a, b) => b[1] - a[1]).map(([group]) => group);

  const where = (match: MatchDetail) => {
    const parts: string[] = [];
    if (match.title > 0) parts.push("title");
    if (match.headings > 0) parts.push("headings");
    if (match.body > 0) parts.push("text");
    return parts.join(" & ");
  };
  const reasons: string[] = [];
  matches.filter((match) => !match.damped && match.points >= 1).slice(0, 4).forEach((match) => {
    reasons.push(`${match.label} in ${where(match)} (+${match.points})`);
  });
  bonuses.forEach((bonus) => reasons.push(`${bonus.label} together (+${bonus.points})`));
  const dampedLabels = matches.filter((match) => match.damped).map((match) => match.label.toLowerCase());
  if (dampedLabels.length) reasons.push(`${dampedLabels.slice(0, 3).join(", ")} carry little weight without device context`);
  penalties.forEach((penalty) => reasons.push(`${penalty.label} (${penalty.points})`));
  if (!matches.length && !penalties.length) reasons.push("No medical-device, regulatory or technology concepts found");
  const depth = input.depth || (body ? "full" : "title");
  if (depth === "title") reasons.push("Scored on the title and headings only — full text not loaded");

  return { score, priority, raw, matches, bonuses, penalties, topics, reasons, depth };
}

export function priorityRank(priority: Priority) {
  return PRIORITIES.indexOf(priority);
}
