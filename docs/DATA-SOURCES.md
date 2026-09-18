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

### Unique Device Identification (GUDID)

- Endpoint: `https://api.fda.gov/device/udi.json`
- Used by: FDA Explorer — the **Devices (UDI)** view, the GUDID panel on every registration record, and the barcode action on each company in Company + devices.
- Record granularity: one result is one device identifier record published by a labeler: `identifiers[]` (primary DI, usually a GS1 GTIN, plus package DIs), `product_codes[]` (a device routinely carries several — a hearing aid with a tinnitus masker is filed under OSM and KLW at once), `premarket_submissions[]` (`submission_number`, `supplement_number`) as declared by the labeler, `is_pm_exempt`, Rx/OTC, GMDN terms, publish/version dates and distribution status.
- Product-code matching in this view is device-level: **All** means every selected code on the same device record (`product_codes.code:"A" AND product_codes.code:"B"`).
- Cross-reference with registrations is by **labeler name + product codes** (`company_name` phrase search, case-insensitive) because GUDID carries no registration or FEI number. Labelers file under their own legal or brand entity, so a registration owner/operator (e.g. DEMANT A/S) can have its devices under different labelers (Oticon A/S, SBO Hearing A/S); the app says so instead of inventing a link. The per-company panel uses exact server counts (`_exists_:premarket_submissions.submission_number`, `is_pm_exempt:true`) rather than sampled rows.
- Labeler groups: `app/fda-udi.ts` carries a small, app-maintained table mapping registration owners to the GUDID labelers they stand behind (Demant → Oticon A/S, SBO Hearing A/S, Bernafon AG, Sonic Innovations; Sonova → Phonak, Unitron, Hansaton, Advanced Bionics; WS Audiology → Widex; Cochlear Americas → Cochlear Limited; and a few spelling variants). Every name was verified to exist in the UDI dataset. The panel labels these as app-maintained aliases from public ownership information, never as an FDA relationship, and users can add further labeler names per company (kept in browser storage).
- Premarket gap report: the company panel exports every GUDID device record under the selected codes (up to 5,000) with its declared submission number or “None listed”, devices carrying every selected code first.
- Country, state and establishment role do not exist in GUDID and are ignored (visibly) in the Devices view. Zero-hit searches are HTTP 404 like the other openFDA endpoints. AccessGUDID pages are linked by primary DI.

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

## Canada Gazette

### Parts I, II and III

- Site: `https://gazette.gc.ca/rp-pr/` (official HTML editions; the site refuses cross-origin browser requests, so the app relays pages through `/api/gazette/source`, which only accepts `gazette.gc.ca` URLs and caches them at the edge)
- Used by: Canada Gazette intelligence (`/next/gazette`, design preview on Internal)
- Part I (weekly, Saturdays): notices, commissions, miscellaneous notices, Parliament, Orders in Council and proposed regulations. The yearly index lists issues and extra editions; each issue index links items into section pages (one page for all government notices, one per proposed regulation).
- Part II (fortnightly, Wednesdays): enacted regulations (SOR) and statutory instruments (SI) with registration number, registration date and enabling statutes; each instrument page carries the regulation and its Regulatory Impact Analysis Statement. Extra editions link straight to an instrument.
- Part III: Acts of Parliament, published as a yearly table (Justice Canada hosts the Act text); Acts assented this year appear in the volume that closed last year.
- Official fields shown as published: part, edition, date, title, section, organization, act or enabling statute, registration number, links.
- App-generated fields, always labelled as such: relevance score (0–100), priority band, topics, matched concepts and the "why" explanation. They come from deterministic, configurable keyword rules in `app/gazette-scoring.ts` (weighted concept groups, title/heading/body weighting, capped repetition, co-occurrence bonuses, weak-term damping, conservative negatives), calibrated against six months of real publications. Ranking orders reading; it never hides an item and is not a legal or regulatory conclusion.
- Freshness: the page shows when it last checked and when it last succeeded, per part, and keeps the last successful update in the browser so stale data is never presented as current.

## FCC

### Equipment Authorization System

- Endpoint: `https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId={scope}`
- Used by: FCC Explorer and FCC Monitoring
- Implemented source fields: FCC ID, grant date, grantee, application purpose, address, city, state, country and postal code.
- Equipment description, equipment class and RF characteristics are not in this endpoint. Those fields come from official FCC ID Search results and Grant of Equipment Authorization pages, stored in `app/fcc-official-grants.ts` for covered IDs.

The endpoint accepts a complete FCC ID or an initial prefix. It returns XML in a normal browser. FCC/Akamai policies and browser CORS rules can block automated server-side or embedded requests even while the same URL works when opened directly. An FCC account is not required for this endpoint, and geographic location is not the cause of that request-mode difference.

### Scheduled capture (primary FCC source)

The FCC endpoint answers HTTP 403 to automated clients, including Cloudflare Workers, so the site cannot query it at request time. Instead a scheduled Cloudflare Worker, `cron/fcc-snapshot` (`fcc-snapshot-refresh`), captures the confirmed scopes (`KWC`, `2A3UL`) twice a day (06:00 and 18:00 UTC):

1. It tries the official endpoint directly (kept in case the FCC ever allows it).
2. It fetches the official endpoint through the r.jina.ai reader in raw-source mode, which returns the FCC's own XML records re-serialised with lower-case tags. Records captured this way carry `source: "official_relay"` and show as "Official FCC EAS response, captured automatically twice a day".
3. Only if both fail does it fall back to the fccid.io public index, stored and shown as `public_index`, never as official.

Captures live in the `FCC_SNAPSHOT` KV namespace with the previous capture and a 30-run history of what changed. The Pages worker relays `GET /api/fcc/current` to the Worker's `/snapshot` route (edge-cached 10 minutes), and `app/fcc-service.ts` uses that capture as the primary source for the confirmed scopes: the pages show "FCC data as of <capture time>" and "Pulled <page load time>", exactly like the other sources. A failed run never overwrites the last good capture.

### Official bundled copy (fallback)

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

## IECEE CB Scheme certificates

The IEC System of Conformity Assessment Schemes for Electrotechnical Equipment and Components (IECEE) publishes CB Test Certificates and related certificate types through its Online Certificate System (OCS):

- Public search: [certificates.iecee.org](https://certificates.iecee.org/)
- Search API used by that site: `POST https://ocs-iecee-api.iecee.org/api/search-es` (an Elasticsearch-style index of about 1.8 million certificates)
- Certificate record: `GET https://ocs-iecee-api.iecee.org/api/proxy/deliverables/CERT/{id}`
- Trademark suggestions: `GET https://ocs-iecee-api.iecee.org/api/search-trademarks?q=`
- Browser CORS: `Access-Control-Allow-Origin: https://certificates.iecee.org` only, so the dashboard cannot call the API directly from a page

### Same-origin relay

Every IECEE request leaves the site through a relay on its own origin: `public/_worker.js` on Cloudflare Pages, the Vite middleware in `cloudflare-spa/vite.config.ts` for local preview, and `app/api/iecee/*` in the full-stack build. The relay:

- accepts only the request shape the official front end sends (`from`, `size`, `query`, `sortBy`, `dateRanges`, `conjunctiveFacetGroups`, `terms`) and rejects anything else with HTTP 400 (`app/iecee-relay.ts`, mirrored in plain JavaScript inside the worker);
- forwards the request with its own user agent, never forwards cookies in either direction, and caches answers at the edge (searches 5 minutes, certificate records 6 hours, trademark lookups 1 hour);
- never exposes the certificate PDF, which the public API does not serve (the site links to the official certificate page instead).

### Request and response shape

| Body field | Meaning |
| --- | --- |
| `query` | Free text matched against manufacturer, applicant, trademark, product, model and certificate-number text. Quoted phrases are exact. |
| `from`, `size` | Paging. `size` ≤ 1,000 and `from + size` ≤ 10,000 (the index result window); deeper pages fail upstream, so the app tells the user to narrow the search. |
| `sortBy` | `[{"issue_date": "desc"}]`, `ref_number` or `last_update_date`. Relevance sorting returns a score of 0 for every hit, so the app defaults to newest issued. |
| `dateRanges` | `{"issue_date": {"min": "YYYY-MM-DD", "max": "YYYY-MM-DD"}}`. Only `issue_date` filters; other dates are ignored upstream. |
| `terms` | Facet filters keyed by group then level: `status`, `type`, `scope_categories`, `scopes` (level 1 = base standard, level 2 = edition), `org_name` (certification body), `trademark.for_agg` (lower-cased trademark key). |
| `conjunctiveFacetGroups` | Groups whose selected values must **all** match. The Explorer uses it for “cites every selected standard”. |

The response carries two searches. `primary` is the search text alone and drives the complete facet list; `secondary` applies the facet and date filters and holds the actual results and per-option counts. The app reads results from `secondary` (falling back to `primary`) and shows counts from both.

### Fields shown

| Index field | Shown as |
| --- | --- |
| `ref_number` | Certificate number (link to `https://certificates.iecee.org/deliverables/CERT/{id}`) |
| `manufacturer_name`, `trademark`, `subject` | Manufacturer, trademark, product |
| `org_name`, `org.address.country` | Certification body (NCB) and its country |
| `type.level_1` | Certificate type (CB Test, Component, EMC, Aspect, Cyber Security, PV, statements of test results) |
| `status.level_1` | Valid, Cancelled or Suspended |
| `scope_categories` | CB Scheme product-category codes |
| `scopes` | Standards: level 1 base standard, level 2 edition, level 3 amendment |
| `issue_date`, `last_update_date`, `expiration_date` | Issued, updated, expiry |

The certificate record adds model(s), ratings, national differences, manufacturer/factory/applicant parties, the NCB address, status message and cancellation details, the scheme code and whether a PDF exists on the IECEE system.

### App-maintained labels

- **Product-category names** (`IECEE_CATEGORIES` in `app/iecee-core.ts`) mirror the IECEE product-category list; the index only carries codes such as `MED` or `ITAV`. Unknown codes are shown as codes.
- **Certificate families** are found by searching the base certificate number and keeping references that extend it (`-A1`, `/M1`, `-M2`). This is a text match on certificate numbers, not an IECEE relationship field.
- **Presets** (`app/iecee-config.ts`) are plain text searches (“sonova”, “hearing aid”), not corporate-structure lookups; the Sonova preset currently returns SONOVA AG, Sonova Consumer Hearing GmbH and Sonova Communications AG.
- **Monitoring** uses issue dates and IECEE last-update timestamps. An update means the record was edited or its status changed; the public record does not say what changed. The updated list checks the 1,000 most recently updated certificates in scope.

## Refreshing FCC data

The scheduled Worker refreshes the confirmed scopes automatically (see “Scheduled capture” above). The bundled copy in `app/fcc-official-snapshot.ts` is only the offline fallback; refresh it occasionally so a Worker outage never shows very old data. When the bundled copy is refreshed:

1. Open the FCC EAS endpoint for each confirmed scope (`https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId=KWC` and `?fccId=2A3UL`). The FCC's edge returns HTTP 403 to command-line clients and scripts, so use a real browser: load the KWC URL, then from that page's console fetch both scopes (same origin) and parse each `<fccidInfo>` element into an object keyed by its child tag names. The 2026-09-17 refresh was captured this way; the records were identical to the 2026-08-11 capture.
2. Preserve the exact returned records and the UTC capture timestamp in `app/fcc-official-snapshot.ts` (`capturedAt`, `records`); keep the confirmed `scopes` block.
3. Update only confirmed preset scopes in `app/fcc-config.ts`.
4. Run `npm test`.
5. Deploy Internal Use Only and verify Explorer, grouped grantees, dossiers, monitoring windows and source links.
6. Promote the same commit to Main only after validation.

Never infer competitors, affiliates, grantee-code ownership, equipment class or RF characteristics without an authoritative source.
