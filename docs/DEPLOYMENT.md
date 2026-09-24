# Deployment and promotion

## Deployment targets

| Target | Cloudflare project | Command |
| --- | --- | --- |
| Internal Use Only | `fda-device-internaluseonly` | `npm run deploy:internal` |
| Main | `fda-device-index` | `npm run deploy:main` |

Main and Internal use the same static multi-route build. The target project name is the only difference between their deployment commands.

## Prerequisites

- Node.js 22.13 or newer
- npm dependencies installed with `npm install`
- Wrangler authenticated to the Cloudflare account that owns both Pages projects
- A clean, reviewed Git commit

Do not add Cloudflare or GitHub tokens to the repository, scripts, remotes, `.npmrc`, or documentation.

## Local validation

```bash
npm install
npm test
npm run dev
```

Before a release, manually verify:

- FDA Explorer loads and filters records.
- FDA Monitoring loads 510(k), recall and adverse-event sections.
- Health Canada / MDALL Explorer loads SONOVA AG licences from the official API.
- Health Canada / MDALL Monitoring shows first-issued and ended licences for the selected window.
- IECEE Explorer loads the Sonova group preset through the `/api/iecee/search` relay, facet counts appear, and a certificate drawer loads model, ratings and standards.
- IECEE Monitoring shows issued, updated and cancelled/suspended certificates for the selected window.
- FCC Explorer shows “FCC data as of” a time from the last day. If it doesn't, check the capture Worker's `/history` (see below).
- Complete and partial FCC-ID searches work for covered scopes.
- Grantee cards, profiles and authorization dossiers open.
- FCC source mode and capture/retrieval timestamps are visible.
- Monitoring date windows and authorization-change categories are accurate.
- An uncovered FCC scope shows the official-link/import fallback.
- CSV exports and shareable URLs work.

## Recommended release flow

### 1. Deploy Internal Use Only

```bash
npm run deploy:internal
```

Verify the deployed URL and record the Git commit SHA that was tested.

### 2. Promote the same commit to Main

Do not make additional source edits between internal validation and promotion.

```bash
git status --short
git rev-parse HEAD
npm run deploy:main
```

The working tree should be clean, and the SHA should match the internally tested commit.

### 3. Verify Main

Smoke-test all eight regulatory routes and confirm that the deployed source/provenance labels match the validated Internal deployment.

## The FCC capture Worker

`cron/fcc-snapshot` is a separate Cloudflare Worker (`fcc-snapshot-refresh`) with a cron trigger and the `FCC_SNAPSHOT` KV namespace. It is deployed independently of the two Pages projects:

```bash
npx wrangler deploy --config cron/fcc-snapshot/wrangler.toml
```

After deploying, `curl -X POST https://fcc-snapshot-refresh.ahmedbinsaeed1997.workers.dev/refresh` runs a capture immediately and `GET /latest` shows the run summary. The Pages worker reaches it through the URL in `public/_worker.js` (`FCC_CAPTURE_WORKER`) and `app/fcc-capture.ts`.

- **Schedule:** `23 */2 * * *` in `cron/fcc-snapshot/wrangler.toml`: every two hours at :23 UTC, away from the top of the hour when many scheduled jobs hit shared services. Scopes captured in the last 10 hours are skipped.
- **Manual refresh:** `POST /refresh` runs at most once every 10 minutes. There is no bypass, because every run spends the reader's shared allowance.
- **Health check:** `GET /history` lists the last 30 runs with every attempt per scope. Each scope should have a successful capture at least every 12 hours or so.

### Optional: a reader key

The Worker reads the FCC through the r.jina.ai reader, which rate-limits anonymous requests per IP. Workers share outbound IPs, so anonymous captures sometimes need several retries and can fail for days (as they did 2026-09-18 to 09-23). A free API key from [jina.ai](https://jina.ai/) moves the limit to the key. To add it, run this from the repository root and paste the key when asked:

```bash
npx wrangler secret put JINA_API_KEY --config cron/fcc-snapshot/wrangler.toml
```

No code change or redeploy is needed; the next run uses it. Never commit the key: this repository is public.

## Build details

`npm run build:pages` uses `cloudflare-spa/vite.config.ts` and writes output to `work/cloudflare-pages/`. That directory is generated and ignored by Git.

`npm run build` creates the full vinext Worker build used for production validation. `dist/` is generated and ignored by Git.

## Rollback

Use the Cloudflare Pages deployment history to promote the last known-good deployment for the affected project. Then revert or fix the responsible Git commit so the repository again describes the deployed state.

Main and Internal can be rolled back independently, but a fix should be revalidated internally before being promoted again.
