# fcc-snapshot-refresh

A scheduled Cloudflare Worker that keeps the FCC equipment-authorization records for the confirmed
Sonova scopes (`KWC`, `2A3UL`) current, because the FCC endpoint refuses automated requests and the
bundled snapshot in `app/fcc-official-snapshot.ts` otherwise goes stale.

- Runs every two hours at :23 UTC (`[triggers]` in `wrangler.toml`), skipping scopes captured in the last 10 hours, and on `POST /refresh` (at most once per 10 minutes, no bypass).
- The reader relay limits anonymous requests per IP, and Workers share outbound IPs, so anonymous runs often meet HTTP 429. Scheduled runs retry over about four minutes. For dependable captures, add a reader key: `npx wrangler secret put JINA_API_KEY --config cron/fcc-snapshot/wrangler.toml` (a free key from jina.ai).
- The dashboard does not depend on this alone: when the capture is older than 14 hours, the visitor's browser reads the same official FCC response through the relay itself (see `app/fcc-service.ts`).
- For each scope it tries the official endpoint directly, then the official endpoint through the r.jina.ai reader (raw source mode, which returns the FCC's XML), then the fccid.io public index as a clearly labelled fallback.
- Stores captures in the `FCC_SNAPSHOT` KV namespace (`scope:<CODE>`, `scope:<CODE>:previous`, `latest`, `history`).
- Serves `GET /snapshot` (records per scope), `GET /latest` (last run summary with what changed), `GET /history`.

The dashboard's Pages worker proxies `/api/fcc/snapshot` and `/api/fcc/snapshot/refresh` to this Worker, and
`app/fcc-service.ts` merges the capture with the bundled official snapshot.

Deploy from the repository root:

```bash
npx wrangler deploy --config cron/fcc-snapshot/wrangler.toml
```

Trigger a run and inspect it:

```bash
curl -X POST https://fcc-snapshot-refresh.<account>.workers.dev/refresh
curl https://fcc-snapshot-refresh.<account>.workers.dev/latest
```
