# FDA + FCC Device Regulatory Explorer

One workspace for searching and monitoring public FDA medical-device records and FCC equipment authorizations.

![FDA + FCC Device Regulatory Explorer](public/og-regulatory.png)

## Start here

| I want to… | Go here |
| --- | --- |
| Use the stable website | [Main site](https://fda-device-index.pages.dev/) |
| Review the newest internal version | [Internal Use Only](https://fda-device-internaluseonly.pages.dev/) |
| Run the project locally | [Local setup](#run-it-locally) |
| Understand the code | [Code tour](#code-tour) |
| Understand the regulatory sources | [Data sources](docs/DATA-SOURCES.md) |
| Release a change | [Deployment guide](docs/DEPLOYMENT.md) |

## What the app does

The top navigation has two independent choices:

1. **Source:** FDA or FCC
2. **View:** Explorer or Monitoring

That creates four main workflows:

| Workflow | What it is for |
| --- | --- |
| **FDA Explorer** | Search registration and listing records; filter establishments and products; customize columns; inspect record details; export CSVs. |
| **FDA Monitoring** | Review recent 510(k), recall, and adverse-event activity. |
| **FCC Explorer** | Search complete or partial FCC IDs; group results by confirmed grantee; inspect authorization history and evidence. |
| **FCC Monitoring** | Review recent original authorizations and FCC-labelled authorization changes for configured scopes. |

Every workflow keeps source links and timestamps visible. FCC views also distinguish official source fields from app-derived labels and preserve the raw FCC record.

## One codebase, two websites

Main and Internal Use Only are not duplicated applications. Both are built from this repository and deployed to separate Cloudflare Pages projects.

```mermaid
flowchart LR
  G["GitHub repository"] --> B["Shared production build"]
  B --> I["Internal Use Only"]
  B --> M["Main site"]
  I -->|"validate the same commit"| M
```

The normal release path is:

1. Build and test a commit.
2. Deploy it to Internal Use Only.
3. Verify all FDA and FCC routes.
4. Deploy that exact commit to Main.

This keeps the two sites consistent while giving unfinished changes a safe validation target.

## Run it locally

You need Node.js 22.13 or newer and npm.

```bash
git clone https://github.com/ahmedbins/fda_device.git
cd fda_device
npm install
npm run dev
```

Open the local URL printed by the development server.

To validate the complete project:

```bash
npm test
```

That command creates a production build and runs the parsing, provenance, rendering, API-validation, and FDA regression tests.

## Code tour

### 1. Routes stay small

The route files under `app/fda/` and `app/fcc/` select shared page components. Most feature code lives in a small number of clearly named modules:

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | FDA Explorer UI, query state, filters, result table, detail panels, and export behavior. |
| `app/monitor-page.tsx` | FDA Monitoring queries and the 510(k), recall, and adverse-event sections. |
| `app/fcc-explorer-page.tsx` | FCC search UI, filters, grouped grantees, authorization dossiers, imports, sharing, and CSV export. |
| `app/fcc-monitor-page.tsx` | FCC watchlists, date windows, activity summaries, authorization tables, and change categories. |
| `app/source-nav.tsx` | Shared FDA/FCC and Explorer/Monitoring navigation. |
| `app/globals.css` | Shared responsive visual system for every route. |

### 2. Data logic is separate from the UI

The page components do not need to understand every source-specific detail:

| File | Responsibility |
| --- | --- |
| `app/fda-shared.ts` | FDA constants, normalization helpers, and CSV utilities shared by FDA views. |
| `app/fcc-core.ts` | FCC XML/JSON parsing, date normalization, conservative purpose mapping, confirmed ID-part derivation, deduplication, grouping, and monitoring windows. |
| `app/fcc-service.ts` | Orchestrates the FCC snapshot, live request, server proxy, cache, grantee registry, and manual official-response import. |
| `app/fcc-config.ts` | Explicitly confirmed FCC presets and watchlist scopes. |
| `app/fcc-official-snapshot.ts` | Exact provenance-labelled FCC EAS records used for reliable covered-scope startup. |
| `app/api/fcc/search/route.ts` | Server-side FCC proxy used by the full-stack build when the upstream service permits it. |

The separation matters: parsing and source rules can be tested without rendering React, while UI work can consume one normalized record shape.

### 3. FDA request flow

```mermaid
flowchart LR
  U["FDA page"] --> Q["Build openFDA query"]
  Q --> A["openFDA API"]
  A --> N["Normalize source response"]
  N --> R["Filters, tables, details, CSV"]
```

FDA Explorer uses the Registration & Listing API. FDA Monitoring uses the 510(k), Recall, and Adverse Event APIs. Requests are made directly from the client to public openFDA endpoints.

### 4. FCC request flow

```mermaid
flowchart TD
  U["FCC search or watchlist"] --> C{"Covered by verified snapshot?"}
  C -->|Yes| S["Load official snapshot records"]
  C -->|No| L["Try live FCC EAS request"]
  L -->|Available| N["Normalize records"]
  L -->|Blocked| P["Try server proxy"]
  P -->|Still unavailable| I["Show official link + import control"]
  S --> N
  I --> N
  N --> V["Explorer or Monitoring view"]
```

The FCC endpoint is public, but FCC/Akamai and browser CORS policies can block some automated request modes. The app treats that as a coverage limitation—not evidence that a record does not exist. Confirmed scopes load from the labelled official snapshot, and uncovered scopes can be imported from the official XML/JSON response.

### 5. Two production build paths share the same UI

- `npm run build` creates the full vinext/Worker build.
- `npm run build:pages` creates static multi-route output from `cloudflare-spa/`.
- Both builds import the same page components from `app/`.
- `npm run deploy:internal` sends the static build to the Internal Pages project.
- `npm run deploy:main` sends the same build to the Main Pages project.

## Project structure

```text
app/
  api/fcc/search/        FCC server-proxy route
  fda/                   FDA route entry points
  fcc/                   FCC route entry points
  *-page.tsx             Shared Explorer and Monitoring page components
  fda-shared.ts          FDA helpers
  fcc-core.ts            FCC parsing and normalization
  fcc-service.ts         FCC source orchestration
cloudflare-spa/          Static Pages entry points and Vite configuration
public/                  Icons and social-preview assets
tests/                   Unit, rendered-route, API, and regression tests
worker/                  Full-stack Cloudflare Worker entry point
docs/                    Deeper architecture, provenance, and release guides
```

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start local development. |
| `npm test` | Build and run all automated tests. |
| `npm run build` | Create the full vinext production build. |
| `npm run build:pages` | Create the static Cloudflare Pages build. |
| `npm run deploy:internal` | Build and deploy Internal Use Only. |
| `npm run deploy:main` | Build and deploy Main. |

Cloudflare deployment requires an authenticated Wrangler session with access to the existing Pages projects.

## Regulatory data sources

| Source | Used by |
| --- | --- |
| [openFDA Device Registration & Listing](https://open.fda.gov/apis/device/registrationlisting/) | FDA Explorer |
| [openFDA 510(k)](https://open.fda.gov/apis/device/510k/) | FDA Monitoring |
| [openFDA Device Recall](https://open.fda.gov/apis/device/recall/) | FDA Monitoring |
| [openFDA Device Adverse Events](https://open.fda.gov/apis/device/event/) | FDA Monitoring |
| [FCC Equipment Authorization System](https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId=KWC) | FCC Explorer and Monitoring |
| [FCC Open Data grantee registrations](https://opendata.fcc.gov/Engineering-Technology/EAS-Equipment-Authorization-Grantee-Registrations/3b3k-34jp) | Confirmed FCC grantee profiles |

Read [Data sources and provenance](docs/DATA-SOURCES.md) before changing source mappings, FCC presets, normalized categories, or snapshot records.

## Adding or changing a feature

1. Start in the relevant page component for UI/state behavior.
2. Put reusable source parsing or normalization in `fda-shared.ts` or `fcc-core.ts`.
3. Keep upstream request/fallback logic in `fcc-service.ts` or the relevant FDA page module.
4. Preserve the raw regulatory value and label derived fields.
5. Add a focused test under `tests/`.
6. Run `npm test`.
7. Validate the change on Internal Use Only before promoting the same commit to Main.

## More documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data sources and provenance](docs/DATA-SOURCES.md)
- [Deployment and promotion](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)

## Security and accuracy

- Never commit access tokens, Cloudflare credentials, `.env` files, cookies, or private session data.
- Do not treat the Internal Use Only hostname as an authentication boundary.
- Do not invent missing regulatory fields or corporate relationships.
- Keep FCC-reported wording visible when showing a normalized category.
- Verify material regulatory decisions against the linked official record.
