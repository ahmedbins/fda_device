# FDA + FCC Device Regulatory Explorer

A searchable regulatory-data workspace for exploring FDA medical-device records and FCC equipment authorizations. One shared codebase powers two Cloudflare Pages deployments: the main site and an Internal Use Only site used to validate changes before promotion.

![FDA + FCC Device Regulatory Explorer](public/og-regulatory.png)

## Live sites

| Deployment | URL | Purpose |
| --- | --- | --- |
| Main | [fda-device-index.pages.dev](https://fda-device-index.pages.dev/) | Stable public-facing deployment |
| Internal Use Only | [fda-device-internaluseonly.pages.dev](https://fda-device-internaluseonly.pages.dev/) | Internal validation and release-candidate deployment |
| Owner-only mirror | [fda-device-index.ahmeds.chatgpt.site](https://fda-device-index.ahmeds.chatgpt.site/) | Private Sites-hosted mirror |

The Main and Internal deployments are not separate applications or duplicated folders. They are two Cloudflare Pages projects built from this repository. This keeps fixes and features consistent and makes promotion explicit: verify a commit internally, then deploy that same commit to Main.

## What it does

- Switches independently between FDA/FCC data and Explorer/Monitoring views.
- Searches FDA registration/listing records with filters, configurable columns, CSV export, shareable URLs, and record detail views.
- Monitors FDA 510(k), recall, and adverse-event activity.
- Searches complete or partial FCC IDs from verified FCC Equipment Authorization records.
- Groups FCC records into confirmed grantee profiles and authorization dossiers.
- Separates FCC-reported values from clearly labeled derived fields.
- Monitors original FCC authorizations and FCC-labelled authorization changes.
- Preserves source links, retrieval times, snapshot provenance, and raw FCC records.

## Data sources

| Source | Used for |
| --- | --- |
| [openFDA Device Registration & Listing](https://open.fda.gov/apis/device/registrationlisting/) | FDA Explorer |
| [openFDA 510(k)](https://open.fda.gov/apis/device/510k/) | FDA Monitoring |
| [openFDA Device Recall](https://open.fda.gov/apis/device/recall/) | FDA Monitoring |
| [openFDA Device Adverse Events](https://open.fda.gov/apis/device/event/) | FDA Monitoring |
| [FCC Equipment Authorization System](https://apps.fcc.gov/OETLabServices/getFCCIDList?fccId=KWC) | FCC authorization records |
| [FCC Open Data grantee registrations](https://opendata.fcc.gov/Engineering-Technology/EAS-Equipment-Authorization-Grantee-Registrations/3b3k-34jp) | Confirmed FCC grantee metadata |

The FCC endpoint is public but may reject server-side or cross-origin requests. The app therefore starts with a provenance-labelled official FCC snapshot for confirmed Sonova scopes, attempts the live source where supported, and provides an official XML/JSON import path for uncovered scopes. See [Data sources and provenance](docs/DATA-SOURCES.md).

## Quick start

Requirements: Node.js 22.13 or newer and npm.

```bash
git clone https://github.com/ahmedbins/fda_device.git
cd fda_device
npm install
npm run dev
```

Then open the local URL printed by the development server.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the full vinext development server |
| `npm test` | Build and run the automated test suite |
| `npm run build` | Build the full Sites/vinext deployment |
| `npm run build:pages` | Build the static multi-route Cloudflare Pages output |
| `npm run deploy:internal` | Build and deploy Internal Use Only |
| `npm run deploy:main` | Build and deploy Main |

Cloudflare deployment requires an authenticated Wrangler session and access to the two existing Pages projects. No access token or secret should ever be committed.

## Routes

| Route | View |
| --- | --- |
| `/` and `/fda/explorer` | FDA Explorer |
| `/fda/monitoring` and `/monitor` | FDA Monitoring |
| `/fcc/explorer` | FCC Explorer |
| `/fcc/monitoring` | FCC Monitoring |

## Repository map

```text
app/                  Shared Next.js/vinext application and regulatory UI
  api/fcc/search/     Server-side FCC proxy used by the full-stack build
  fda/                FDA routes
  fcc/                FCC routes
cloudflare-spa/       Static multi-route entry points for both Pages projects
public/               Shared icons and social-preview assets
tests/                Parsing, provenance, rendering, and regression tests
worker/               Cloudflare Worker entry point for the full-stack build
docs/                 Architecture, data-source, and deployment guides
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data sources and provenance](docs/DATA-SOURCES.md)
- [Deployment and promotion](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)

## Security and privacy

- This repository must not contain API keys, GitHub tokens, Cloudflare credentials, or personal environment files.
- `.env*`, build output, Wrangler state, and dependencies are ignored.
- The regulatory sources used here are public, but the Internal and owner-only deployments may contain work-in-progress features. Do not treat an "Internal Use Only" hostname as an authentication boundary.
- Regulatory data can change. Verify material decisions against the linked official record.
