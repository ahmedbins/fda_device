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
- FCC Explorer defaults to verified records rather than a blank state.
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

Smoke-test all four regulatory routes and confirm that the deployed source/provenance labels match the validated Internal deployment.

## Build details

`npm run build:pages` uses `cloudflare-spa/vite.config.ts` and writes output to `work/cloudflare-pages/`. That directory is generated and ignored by Git.

`npm run build` creates the full vinext Worker build used for production validation. `dist/` is generated and ignored by Git.

## Rollback

Use the Cloudflare Pages deployment history to promote the last known-good deployment for the affected project. Then revert or fix the responsible Git commit so the repository again describes the deployed state.

Main and Internal can be rolled back independently, but a fix should be revalidated internally before being promoted again.
