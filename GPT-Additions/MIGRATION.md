# Cloud-only migration path

The additions in this folder are intentionally not wired into the existing
application. Promote them in this order:

1. Run the workflow contract audit and correct any incompatible saved workflows.
2. Deploy `cloud-run-api` as a new revision of the existing `stanley-runner`.
3. Copy the two files in `drop-in/src/lib` into the production `src/lib` directory.
4. Rebuild hosting with the existing Cloud Run service URL as `VITE_RUNNER_URL`.
5. Remove browser-side vault loading from run paths. Vault data may still be read
   for its dedicated management screen, but never to execute workflows.
6. Optionally enable Cloud Tasks after inline execution is verified.
7. Disable the legacy `/run` compatibility endpoint.

## Non-goals of this first addition

- No production files are modified.
- No daemon or extension path is revived.
- No Cloud Console deployment has been performed.
- The existing execution engine is used through a temporary adapter so current
  Playwright/AI behavior remains the compatibility reference.
