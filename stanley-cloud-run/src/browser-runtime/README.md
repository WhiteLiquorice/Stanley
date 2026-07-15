# Stanley browser runtime

This layer adds deterministic accessibility references, encrypted tenant-bound Playwright storage state, bounded browser leases, metadata-only trace bundles, and authenticated interactive takeover commands.

Production must set `BROWSER_SESSION_ENCRYPTION_KEY` to a base64 or hex encoded 32-byte key. Without it, session persistence and takeover snapshots fail closed; runs still execute with fresh browser contexts.

Optional limits:

- `BROWSER_MAX_SESSIONS_PER_TENANT` (default `3`)
- `BROWSER_MAX_SESSIONS_TOTAL` (default `20`)
- `BROWSER_MAX_RUNTIME_MS` (default `900000`)

Takeover supports only `click_ref`, `type_ref`, `resume`, and `abort`. It never accepts arbitrary JavaScript, selectors, URLs, cookies, or network requests. Trace bundles omit request/response bodies, query strings, hashes, visible text, and screenshots.
