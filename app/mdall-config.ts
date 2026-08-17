export type MdallPreset = {
  id: string;
  label: string;
  description: string;
  companyIds: number[];
  sourceNote: string;
};

export const MDALL_PRESETS: MdallPreset[] = [
  {
    id: "sonova",
    label: "Sonova MDALL",
    description: "Confirmed Health Canada company ID for SONOVA AG",
    companyIds: [113080],
    sourceNote: "Company ID 113080 is returned by the official MDALL company API for SONOVA AG.",
  },
];

export const DEFAULT_MDALL_PRESET = "sonova";

export function getMdallPreset(id?: string | null) {
  return MDALL_PRESETS.find((preset) => preset.id === id);
}
