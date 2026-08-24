import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMdallLicence } from "../app/mdall-core.ts";
import {
  clearMdallCache,
  fetchMdallDevicesForLicence,
  searchMdall,
} from "../app/mdall-service.ts";

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function activeLicence(number, companyId = 0) {
  return {
    original_licence_no: number,
    licence_status: "I",
    appl_risk_class: 2,
    licence_name: `LICENCE ${number}`,
    first_licence_status_dt: "1999-02-19",
    end_date: null,
    company_id: companyId || null,
    licence_type_desc: "Device Family",
  };
}

test("licence devices come from the complete active feed and include all current identifiers", async () => {
  clearMdallCache();
  const originalFetch = globalThis.fetch;
  const urls = [];
  const activeDevices = Array.from({ length: 15 }, (_, index) => ({
    original_licence_no: 1423,
    device_id: 1_096_200 + index,
    first_licence_dt: index === 14 ? "2026-07-28" : `2025-01-${String(index + 1).padStart(2, "0")}`,
    end_date: null,
    trade_name: index === 14 ? "PHONAK NAIDA LINK L" : `ACTIVE DEVICE ${index + 1}`,
  }));
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/device/?state=active")) {
      return jsonResponse([
        ...activeDevices,
        activeDevices[0],
        { ...activeDevices[1], device_id: 9_999_999, original_licence_no: 1424 },
        { ...activeDevices[2], device_id: 8_888_888, end_date: "2020-01-01" },
      ]);
    }
    if (url.includes("/deviceidentifier/?id=")) {
      const id = Number(new URL(url).searchParams.get("id"));
      return jsonResponse([
        { original_licence_no: 1423, device_id: id, device_identifier: `ACTIVE-${id}`, end_date: null },
        { original_licence_no: 1423, device_id: id, device_identifier: `ACTIVE-${id}`, end_date: null },
        { original_licence_no: 1423, device_id: id, device_identifier: `OLD-${id}`, end_date: "2024-01-01" },
        { original_licence_no: 1423, device_id: id + 1, device_identifier: "WRONG-DEVICE", end_date: null },
      ]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const licence = normalizeMdallLicence(activeLicence(1423), "2026-08-24T00:00:00.000Z");
    assert.ok(licence);
    const result = await fetchMdallDevicesForLicence(licence);
    assert.equal(result.devices.length, 15);
    assert.equal(result.devices[0].tradeName, "PHONAK NAIDA LINK L");
    assert.equal(result.devices[0].firstLicensedAt, "2026-07-28");
    assert.equal(result.identifiersComplete, true);
    assert.deepEqual(result.devices[0].identifiers, [`ACTIVE-${result.devices[0].deviceId}`]);
    assert.equal(urls.some((url) => url.includes("device_name=")), false);
    assert.equal(urls.filter((url) => url.includes("/deviceidentifier/")).length, 15);
    assert.ok(urls.every((url) => url.includes("state=active")));
  } finally {
    globalThis.fetch = originalFetch;
    clearMdallCache();
  }
});

test("device-name and identifier searches carry state and do not cap matching licences", async () => {
  clearMdallCache();
  const originalFetch = globalThis.fetch;
  const urls = [];
  const numbers = Array.from({ length: 81 }, (_, index) => 200_000 + index);
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    const parsed = new URL(url);
    if (url.includes("/device/?device_name=")) {
      return jsonResponse(numbers.flatMap((number, index) => Array.from({ length: 5 }, (_, offset) => ({
        original_licence_no: number,
        device_id: index * 10 + offset + 1,
        first_licence_dt: "2026-01-01",
        end_date: null,
        trade_name: `HEARING DEVICE ${index}-${offset}`,
      }))));
    }
    if (url.includes("/deviceidentifier/?device_identifier=")) {
      return jsonResponse([
        ...numbers.map((number, index) => ({ original_licence_no: number, device_id: index + 1, device_identifier: `ID-${index}`, end_date: null })),
        { original_licence_no: 999_999, device_id: 999_999, device_identifier: "HISTORICAL", end_date: "2020-01-01" },
      ]);
    }
    if (url.includes("/licence/?id=")) {
      const number = Number(parsed.searchParams.get("id"));
      return jsonResponse(activeLicence(number, number));
    }
    if (url.includes("/company/?id=")) {
      const companyId = Number(parsed.searchParams.get("id"));
      return jsonResponse({ company_id: companyId, company_name: `COMPANY ${companyId}` });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const deviceResult = await searchMdall({ query: "hearing", mode: "device", state: "active" });
    assert.equal(deviceResult.licences.length, 81);
    assert.equal(deviceResult.licences.filter((licence) => licence.companyName).length, 81);
    assert.equal(urls.filter((url) => url.includes("/company/?id=")).length, 81);
    clearMdallCache();
    const identifierResult = await searchMdall({ query: "ID-", mode: "identifier", state: "active" });
    assert.equal(identifierResult.licences.length, 81);
    assert.ok(urls.filter((url) => url.includes("/device/?device_name=") || url.includes("/deviceidentifier/?device_identifier=")).every((url) => url.includes("state=active")));
  } finally {
    globalThis.fetch = originalFetch;
    clearMdallCache();
  }
});
