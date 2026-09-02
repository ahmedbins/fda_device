# Data sources and provenance

The application uses public regulatory sources and keeps their fields distinguishable from application-derived labels.

## FDA

### Registration and listing

- Endpoint: `https://api.fda.gov/device/registrationlisting.json`
- Used by: FDA Explorer
- Primary app fields: establishment name, registration number, FEI, location, status, products, proprietary names and device listing numbers.
- Record granularity: each result is one **device listing** filed under one establishment registration. `products[]` holds one entry per product code on that listing, `proprietary_name[]` holds the listing's trade names, and `k_number` / `pma_number` identify the premarket submission behind it. The same registration number appears once per listing the establishment has filed.
- Product-code matching: the Records view lists listings that carry at least one selected code (`products.product_code:("A" OR "B")`), because a listing is one filing and normally one code. The **Company + devices** view adds a Match control: **Any** shows every owner/operator with a listing for at least one selected code; **All** keeps only owner/operators whose listings, taken together, cover every selected code — so a firm with one KSW listing and a separate OSM listing qualifies for KSW + OSM. That rollup is app-derived by grouping on the FDA-reported owner/operator name; the source data does not link listings to each other. The request to openFDA is the same for both modes; the view loads up to 5,000 matching listings before grouping and says so when a search has more.
- Zero-hit searches: openFDA answers with HTTP 404 `NOT_FOUND`. The app treats that as an empty result set, not an error.

### Product classification

- Endpoint: `https://api.fda.gov/device/classification.json`
- Used by: FDA Explorer, to name any product code a user enters (device name, class, regulation) and to flag codes FDA does not know. Results are cached per session.
- Deep links: 510(k) numbers open `cfpmn/pmn.cfm`, De Novo numbers `cfpmn/denovo.cfm`, PMA numbers `cfpma/pma.cfm`, and product codes `cfpcd/classification.cfm` on accessdata.fda.gov.

### 510(k)

- Endpoint: `https://api.fda.gov/device/510k.json`
- Used by: FDA Monitoring
- Activity date: the FDA decision date returned by the source.

### Recalls

- Endpoint: `https://api.fda.gov/device/recall.json`
- Used by: FDA Monitoring
- The app links to FDA recall detail pages when the source identifier is available.

### Adverse events

- Endpoint: `https://api.fda.gov/device/event.json`
- Used by: FDA Monitoring
- Monitoring categories reflect source fields; they are not risk conclusions.

Official documentation: [openFDA device APIs](https://open.fda.gov/apis/device/).

## FCC

### Equipment Authorization System

- Endpoint: `https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId={scope}`
- Used by: FCC Explorer and FCC Monitoring
- Implemented source fields: FCC ID, grant date, grantee, application purpose, address, city, state, country and postal code.
- Equipment description, equipment class and RF characteristics are not in this endpoint. Those fields come from official FCC ID Search results and Grant of Equipment Authorization pages, stored in `app/fcc-official-grants.ts` for covered IDs.

The endpoint accepts a complete FCC ID or an initial prefix. It returns XML in a normal browser. FCC/Akamai policies and browser CORS rules can block automated server-side or embedded requests even while the same URL works when opened directly. An FCC account is not required for this endpoint, and geographic location is not the cause of that request-mode difference.

### Official bundled snapshot

The repository includes `app/fcc-official-snapshot.ts`, generated from exact official FCC EAS responses and labelled with its capture time.

Current confirmed scopes:

- `KWC` — Sonova USA Inc.
- `2A3UL` — Sonova Consumer Hearing GmbH

The snapshot is a reliability layer for the confirmed internal watchlist, not a claim that all FCC authorizations are stored in the repository. The UI shows when results come from this snapshot.

### FCC grantee registrations

- API: `https://opendata.fcc.gov/resource/3b3k-34jp.json`
- Dataset: [EAS Equipment Authorization Grantee Registrations](https://opendata.fcc.gov/Engineering-Technology/EAS-Equipment-Authorization-Grantee-Registrations/3b3k-34jp)
- Used for: confirmed grantee name, address and contact metadata when a registration exists.

The FCC Open Data dataset is an older registry snapshot. A grantee absent there may still be confirmed by a newer official EAS authorization response. The UI states which source established the identity.

## FCC live lookup order

1. Official `getFCCIDList` when the browser or server proxy can reach it.
2. The public [fccid.io](https://fccid.io/) index of FCC filings, retrieved through the app proxy. This is how Explorer and Monitoring stay current without a weekly snapshot recapture.
3. The bundled official snapshot for confirmed scopes, if both live sources fail.
4. Manual import of an official FCC XML/JSON response.

fccid.io is a third-party index of public FCC grants, not the FCC itself. The UI labels that source when it is used. Official FCC search links remain available on each record.

## Derived FCC fields

| Field | Derivation |
| --- | --- |
| Grantee code | Removed from the start of the FCC ID only when it matches a confirmed configured scope |
| Product-code component | The remaining FCC ID portion after a confirmed grantee code |
| Activity category | Conservative mapping of the FCC application-purpose text |

Normalized activity categories are `Original authorization`, `Class II permissive change`, `Change in FCC ID`, and `Other authorization activity`. The original FCC wording remains visible and is included in CSV exports.

## FCC public record links

The official FCC ID Search at [fcc.gov/oet/ea/fccid](https://www.fcc.gov/oet/ea/fccid) is a form. Official grant and exhibit pages need an internal `application_id` and are POST-driven; they cannot be opened as a stable GET URL for a specific FCC ID. Other public indexes such as fcc.report are behind bot challenges.

The app therefore:

- keeps a prominent **Official FCC Search** button at the top of Explorer and Monitoring;
- links each FCC ID to its public [fccid.io](https://fccid.io/) page, which is a GET URL of the form `https://fccid.io/{FCCID}`;
- still labels fccid.io as a third-party index, not the FCC.

## FCC exhibits / supporting documents

fccid.io publishes an exhibit table for each FCC ID: document name, exhibit type, public availability date, and a "Metadata only" marker when the file is not yet public. The official FCC exhibit report is not available as a documented GET API.

Explorer exports two CSVs:

- authorization records;
- exhibit metadata for the first 40 unique FCC IDs in the current result set (name, type, application/submitted date when present, public date, confidentiality status).

The app does not need to open the PDF itself. The export is a list of what supporting documents exist.

## Health Canada / MDALL

Health Canada publishes a documented JSON API for the Medical Devices Active Licence Listing:

- Documentation: [MDALL API Guide](https://health-products.canada.ca/api/documentation/mdall-documentation-en.html)
- Base URI: `https://health-products.canada.ca/api/medical-devices/`
- Browser CORS: `Access-Control-Allow-Origin: *`

| Endpoint | Useful for |
| --- | --- |
| `/licence/` | Licence number, name, status, risk class, type, first issued date, end date, company ID |
| `/company/` | Company name, ID, address, country |
| `/device/` | Device IDs and trade names; the app loads the selected state and indexes rows by `original_licence_no` |
| `/deviceidentifier/` | Catalogue / device identifiers, requested by device ID and selected state |
| `/licencetype/` | Licence type codes |
| `/sbdlocation/` | Summary Basis of Decision URLs, when present |

MDALL covers licensed Class II, III and IV devices. Class I devices, investigational testing, and special-access authorizations are not in this listing.

The official MDALL HTML search is POST-only (`/mdall-limh/search`). There is no stable official GET page for a specific licence number. The dashboard therefore uses the JSON API and keeps a prominent link to the official search form.

The `licence` endpoint does **not** accept `company_name`. Company searches resolve `company_id` first, then request `/licence/?company_id=`. The `device` endpoint does **not** provide a working licence-number filter, so the dashboard retrieves the complete selected-state device feed, filters locally on `original_licence_no`, and deduplicates on `device_id`. Identifier requests include the selected state and are also filtered locally so historical identifiers cannot leak into the active view. The licence drawer, device-count column, and Excel export all use this normalized dataset; retrieval errors remain explicit instead of being represented as zero devices.

Confirmed watch scope: SONOVA AG, company ID `113080`.

## Refreshing FCC data

When the official snapshot is refreshed:

1. Open the FCC EAS endpoint for each confirmed scope.
2. Preserve the exact returned records and the UTC capture timestamp.
3. Update only confirmed preset scopes in `app/fcc-config.ts`.
4. Run `npm test`.
5. Deploy Internal Use Only and verify Explorer, grouped grantees, dossiers, monitoring windows and source links.
6. Promote the same commit to Main only after validation.

Never infer competitors, affiliates, grantee-code ownership, equipment class or RF characteristics without an authoritative source.
