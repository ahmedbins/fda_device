import { IECEE_MAX_QUERY_LENGTH } from "./iecee-relay.ts";

/**
 * Presets for the IECEE Explorer and Monitoring pages.
 *
 * Each preset is a plain search on the official certificate index. The index matches words in the
 * manufacturer, applicant, trademark, product and model text, so a preset is a text match — it is
 * not a corporate-structure lookup and does not claim which legal entities belong to a group.
 */
export type IeceePreset = {
  id: string;
  label: string;
  description: string;
  query: string;
  sourceNote: string;
};

export const IECEE_PRESETS: IeceePreset[] = [
  {
    id: "sonova",
    label: "Sonova group",
    description: "Certificates whose manufacturer, applicant or trademark text matches “sonova”",
    query: "sonova",
    sourceNote: "On the IECEE index this currently returns SONOVA AG, Sonova Consumer Hearing GmbH and Sonova Communications AG. It is a text match on the certificate record, not an ownership lookup.",
  },
  {
    id: "hearing",
    label: "Hearing aid products",
    description: "Certificates whose product or model text matches “hearing aid”",
    query: "hearing aid",
    sourceNote: "Covers hearing aids, chargers and accessories from every manufacturer whose IECEE product or model text mentions hearing aids.",
  },
];

export const DEFAULT_IECEE_PRESET = "sonova";

export function getIeceePreset(id?: string | null) {
  return IECEE_PRESETS.find((preset) => preset.id === id);
}

/** The preset whose query matches a search exactly, if any — used to keep the preset selector honest after edits. */
export function presetForQuery(query: string) {
  const cleaned = query.replace(/\s+/g, " ").trim().toLowerCase().slice(0, IECEE_MAX_QUERY_LENGTH);
  return IECEE_PRESETS.find((preset) => preset.query.toLowerCase() === cleaned);
}
