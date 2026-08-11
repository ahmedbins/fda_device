# Contributing

## Development workflow

1. Create a focused branch from `main`.
2. Make the smallest coherent change.
3. Keep FDA and FCC state independent.
4. Add or update tests for parsing, normalization, source provenance, route rendering, or regressions.
5. Run `npm test` before opening a pull request.
6. Deploy to Internal Use Only for browser validation when the change affects data fetching or UI behavior.

## Source-data rules

- Preserve raw regulatory values.
- Label every derived field as derived.
- Do not infer corporate relationships, competitors, grantee-code ownership, risk, equipment class, RF characteristics, or regulatory status without an authoritative source.
- Hide or explain unsupported fields rather than showing dead controls or invented values.
- Keep an exact official-record link and retrieval/capture timestamp wherever possible.
- Monitoring language must distinguish source activity dates from snapshot-delta detection.

## Pull requests

Explain:

- what changed;
- why it changed;
- which source fields or assumptions are involved;
- how FDA behavior was protected;
- which tests and deployed routes were checked.

## Secrets

Never commit:

- GitHub or Cloudflare access tokens;
- `.env` files;
- browser cookies or exported session data;
- private API responses containing non-public data;
- generated deployment credentials.

If a secret is exposed, revoke it immediately and remove it from Git history before publishing.

