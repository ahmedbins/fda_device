# Architecture

## One application, two Pages deployments

Main and Internal Use Only are two deployments of the same source tree:

```mermaid
flowchart LR
  R["GitHub repository"] --> B["Static Pages build"]
  B --> M["Main Pages project"]
  B --> I["Internal Use Only Pages project"]
  R --> V["vinext full-stack build"]
  V --> S["Owner-only Sites mirror"]
```

There is intentionally no `main-site/` and `internal-site/` duplication. Environment-specific behavior is limited to the deployment command and hosting access policy. UI, routes, data normalization, tests, and assets are shared.

## Runtime shapes

### Cloudflare Pages: Main and Internal

`cloudflare-spa/vite.config.ts` produces static HTML and JavaScript entry points for all FDA and FCC routes. Both Pages projects deploy the output from `work/cloudflare-pages/`.

- Main project: `fda-device-index`
- Internal project: `fda-device-internaluseonly`
- Client-side FDA requests go directly to openFDA.
- Confirmed FCC scopes resolve from the bundled official snapshot.
- The app attempts the live FCC endpoint where the browser supports it.
- Uncovered FCC scopes can be imported from the official FCC XML/JSON response.

### Sites mirror

The root vinext build produces a Cloudflare Worker-compatible full-stack application. It includes `/api/fcc/search`, which can proxy the FCC endpoint when the upstream service permits server-side access. Sites controls the mirror's owner-only access policy.

## Route composition

The route files are intentionally small. They select a shared page component:

```text
app/page.tsx                  FDA Explorer implementation
app/monitor-page.tsx          FDA Monitoring implementation
app/fcc-explorer-page.tsx     FCC Explorer implementation
app/fcc-monitor-page.tsx      FCC Monitoring implementation
app/source-nav.tsx            FDA/FCC and Explorer/Monitoring navigation
app/fda-shared.ts             FDA normalization and export helpers
app/fcc-core.ts               FCC parsing, normalization, grouping, provenance
app/fcc-service.ts            FCC snapshot/live/import orchestration
app/fcc-config.ts             Confirmed FCC presets and watchlists
app/fcc-official-snapshot.ts  Provenance-labelled official FCC response snapshot
```

## Data flow

```mermaid
flowchart TD
  UI["Explorer or Monitoring UI"] --> S{"Selected source"}
  S -->|FDA| F["openFDA APIs"]
  F --> FN["FDA normalization"]
  S -->|FCC| C{"Scope covered by official snapshot?"}
  C -->|Yes| SN["Snapshot records"]
  C -->|No| L["Live FCC request"]
  L -->|Supported| LN["Live records"]
  L -->|Blocked by CORS/upstream| IM["Official response import"]
  SN --> N["FCC normalization + provenance"]
  LN --> N
  IM --> N
  FN --> UI
  N --> UI
```

## FCC record model

The FCC model deliberately separates source facts from derived values:

- FCC-reported: FCC ID, grantee name, grant date, application purpose, address and location.
- Derived only from confirmed configuration: grantee-code component, product-code component, normalized activity category.
- Provenance: source mode, snapshot capture time, app retrieval time, exact official-source URL, raw source object.

Equipment descriptions, RF characteristics, and equipment class are not invented when the implemented FCC endpoint does not return them.

## State and persistence

- Explorer filters and Monitoring scopes are reflected in the URL for sharing and repeatability.
- Column preferences use browser local storage.
- Imported FCC responses remain in the current browser session.
- No database-backed snapshot comparison is enabled. Monitoring reports activity based on FCC grant dates and does not claim snapshot-delta detection.

## Testing

`npm test` performs a production build and runs Node tests covering:

- FCC scope and date normalization;
- official XML parsing;
- confirmed grantee-code derivation;
- FCC purpose normalization while preserving raw wording;
- official snapshot records and manual imports;
- grouped grantee behavior;
- route server rendering;
- FDA Explorer and Monitoring regression checks;
- API input validation.

