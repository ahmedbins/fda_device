export type FccPreset = {
  id: string;
  label: string;
  description: string;
  granteeCodes: string[];
  sourceNote: string;
};

export const FCC_PRESETS: FccPreset[] = [
  {
    id: "sonova",
    label: "Sonova FCC",
    description: "Confirmed Sonova equipment-authorization scopes",
    granteeCodes: ["KWC", "2A3UL"],
    sourceNote: "KWC is confirmed by the FCC Open Data grantee registry; both scopes are confirmed by FCC EAS authorization responses.",
  },
];

export const DEFAULT_FCC_PRESET = "sonova";

export function getFccPreset(id?: string | null) {
  return FCC_PRESETS.find((preset) => preset.id === id);
}
