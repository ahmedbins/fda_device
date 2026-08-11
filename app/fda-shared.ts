import { useState } from "react";

export type Product = {
  product_code?: string;
  created_date?: string;
  owner_operator_number?: string;
  exempt?: string;
  openfda?: {
    device_name?: string;
    medical_specialty_description?: string;
    regulation_number?: string;
    device_class?: string;
  };
};

export type Registration = {
  registration_number?: string;
  fei_number?: string;
  status_code?: string;
  reg_expiry_date_year?: string;
  name?: string;
  business_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_code?: string;
  iso_country_code?: string;
  zip_code?: string;
  postal_code?: string;
  owner_operator?: { firm_name?: string; owner_operator_number?: string };
  us_agent?: { business_name?: string; name?: string; email_address?: string };
};

export type RecordItem = {
  proprietary_name?: string[];
  establishment_type?: string[];
  registration?: Registration;
  pma_number?: string;
  k_number?: string;
  products?: Product[];
};

export const API = "https://api.fda.gov/device/registrationlisting.json";

export const PRESET = [
  { code: "QUF", name: "Hearing Aid, Air-Conduction, Over The Counter" },
  { code: "QUG", name: "Hearing Aid, Air-Conduction With Wireless Technology, Over The Counter" },
  { code: "QDD", name: "Self-Fitting Air-Conduction Hearing Aid, Prescription" },
  { code: "QUH", name: "Self-Fitting Air-Conduction Hearing Aid, Over The Counter" },
  { code: "OSM", name: "Hearing Aid, Air-Conduction With Wireless Technology, Prescription" },
  { code: "SCR", name: "Air-Conduction Hearing Aid Software" },
];
export const PRESET_CODES = PRESET.map((p) => p.code);
export const CODE_NAMES = new Map(PRESET.map((p) => [p.code, p.name]));

export function quote(value: string) {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

export function parseCodes(text: string) {
  return [...new Set(
    text
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((code) => code.length >= 2 && code.length <= 8),
  )];
}

export function firmName(item: RecordItem) {
  return (
    item.registration?.name ||
    item.registration?.business_name ||
    item.registration?.owner_operator?.firm_name ||
    "Unnamed establishment"
  );
}

export function companyName(item: RecordItem) {
  return item.registration?.owner_operator?.firm_name || firmName(item);
}

export function locationSummary(item: RecordItem) {
  const r = item.registration;
  return [r?.city, r?.state_code, r?.iso_country_code].filter(Boolean).join(", ") || "Location unavailable";
}

/** True on the internal dev deployment and local previews — drives the DEV badge. */
export function useDevHost() {
  const [dev] = useState(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host.includes("internaluseonly");
  });
  return dev;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
